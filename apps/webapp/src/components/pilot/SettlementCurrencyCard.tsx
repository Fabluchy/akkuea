"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Coins, Euro } from "lucide-react";
import type { PilotSettlementCurrency } from "@akkuea/shared";
import {
  Button,
  Card,
  SectionErrorFallback,
  SkeletonText,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Settlement-currency opt-in.
 *
 * The contract's `set_currency_preference` is already implemented and tested;
 * this is the control an investor uses to reach it. The preference shown is
 * read from chain (`get_currency_preference`), not from local state, so what is
 * on screen is what a future distribution will actually honor.
 *
 * The risk disclosure is not decoration. EURC settlement converts the holder's
 * share through an AMM at payout time, which means:
 * - the delivered amount depends on pool liquidity at that moment, and
 * - a leg that cannot satisfy the cycle's operator-and-ally-signed price floor
 *   is rejected, leaving that share reserved as USDC rather than lost.
 *
 * The reserved-USDC outcome is the reason this is a reasonable opt-in at all,
 * and it is why the withheld balance has its own claim path.
 */

export interface SettlementCurrencyCardProps {
  /** Current on-chain preference. */
  preference: PilotSettlementCurrency;
  isLoading: boolean;
  error: string | null;
  /** False when no wallet is connected, or the holder is not whitelisted. */
  canChange: boolean;
  /** Blocks the control while the contract is paused or exited. */
  isPaused: boolean;
  isExited: boolean;
  isWhitelisted: boolean;
  onChange: (currency: PilotSettlementCurrency) => Promise<void>;
  onRefresh: () => void;
}

export function SettlementCurrencyCard({
  preference,
  isLoading,
  error,
  canChange,
  isPaused,
  isExited,
  isWhitelisted,
  onChange,
  onRefresh,
}: SettlementCurrencyCardProps) {
  const t = useTranslations("Pilot");
  const [pending, setPending] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isEurc = preference === "EURC";
  const locked = isPaused || isExited || !canChange || !isWhitelisted;

  async function choose(currency: PilotSettlementCurrency) {
    setPending(true);
    setActionError(null);
    try {
      await onChange(currency);
      setConfirming(false);
    } catch (changeError) {
      setActionError(
        changeError instanceof Error
          ? changeError.message
          : t("currency.actionFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  if (isLoading) {
    return (
      <Card variant="bordered">
        <SkeletonText lines={4} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="bordered">
        <SectionErrorFallback onReset={onRefresh} message={error} />
      </Card>
    );
  }

  return (
    <Card variant="bordered">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            {isEurc ? (
              <Euro className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Coins className="h-4 w-4" aria-hidden="true" />
            )}
            {t("currency.title")}
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            {t("currency.current", { currency: preference })}
          </p>
        </div>
        <span
          data-testid="currency-badge"
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            isEurc
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
              : "border-white/10 bg-white/5 text-neutral-300",
          )}
        >
          {preference}
        </span>
      </div>

      {!isWhitelisted && (
        <p className="mt-3 text-xs text-amber-300">
          {t("currency.notWhitelisted")}
        </p>
      )}

      {isExited ? (
        <p className="mt-3 text-xs text-neutral-400">
          {t("currency.lockedExited")}
        </p>
      ) : isPaused ? (
        <p className="mt-3 text-xs text-amber-300">
          {t("currency.lockedPaused")}
        </p>
      ) : !canChange ? (
        <p className="mt-3 text-xs text-neutral-400">
          {t("currency.connectFirst")}
        </p>
      ) : null}

      {!confirming ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {isEurc ? (
            // Leaving EURC reduces risk, so it takes one step rather than a
            // second confirmation.
            <Button
              size="sm"
              variant="secondary"
              disabled={locked || pending}
              isLoading={pending}
              onClick={() => void choose("USDC")}
            >
              {t("currency.switchToUsdc")}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={locked || pending}
              isLoading={pending}
              onClick={() => {
                setActionError(null);
                setConfirming(true);
              }}
            >
              {t("currency.optInEurc")}
            </Button>
          )}
        </div>
      ) : (
        <div
          data-testid="currency-risk-disclosure"
          className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {t("currency.riskTitle")}
          </p>
          <ul className="space-y-1.5 text-xs text-amber-200/90">
            <li>{t("currency.riskSwap")}</li>
            <li>{t("currency.riskFloor")}</li>
            <li>{t("currency.riskFallback")}</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              isLoading={pending}
              onClick={() => void choose("EURC")}
            >
              {t("currency.confirmOptIn")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("currency.cancel")}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {actionError}
        </p>
      )}
    </Card>
  );
}