"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Coins, Lock } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { formatBaseUnits } from "./format";

/**
 * Withheld funds and the claim path.
 *
 * When a holder's EURC swap leg is rejected, their share is not lost: the
 * contract reserves it against their own address and pays it back in USDC on
 * demand through `claim_withheld`. This card is that release path.
 *
 * The amount shown is the contract's own `withheld_balance` for this holder -
 * not a locally computed figure - so the number on screen is exactly what a
 * signature would move.
 */

export interface WithheldFundsCardProps {
  /** Reserved USDC for this holder, from contract storage. */
  balance: bigint;
  isLoading: boolean;
  /** False when no wallet is connected. */
  canClaim: boolean;
  /** True while the claim transaction is in flight. */
  isClaiming?: boolean;
  onClaim: () => Promise<void>;
}

export function WithheldFundsCard({
  balance,
  isLoading,
  canClaim,
  isClaiming = false,
  onClaim,
}: WithheldFundsCardProps) {
  const t = useTranslations("Pilot");
  const [error, setError] = useState<string | null>(null);
  const hasFunds = balance > BigInt(0);

  async function claim() {
    setError(null);
    try {
      await onClaim();
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : t("withheld.actionFailed"),
      );
    }
  }

  // Nothing reserved and nothing loading: render nothing rather than an empty
  // card, so the dashboard does not carry a permanently empty panel.
  if (!hasFunds && !isLoading) return null;

  return (
    <Card variant="bordered" data-testid="withheld-funds-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Lock className="h-4 w-4 text-amber-400" aria-hidden="true" />
            {t("withheld.title")}
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            {t("withheld.subtitle")}
          </p>
        </div>
        <p
          data-testid="withheld-balance"
          className="text-sm font-medium text-white"
        >
          {isLoading ? "…" : formatBaseUnits(balance)} USDC
        </p>
      </div>

      {hasFunds && (
        <>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("withheld.explain")}
          </p>

          <div className="mt-4">
            {canClaim ? (
              <Button
                size="sm"
                leftIcon={<Coins className="h-4 w-4" />}
                isLoading={isClaiming}
                onClick={() => void claim()}
              >
                {t("withheld.claim")}
              </Button>
            ) : (
              <p className="text-xs text-neutral-400">
                {t("withheld.connectFirst")}
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}