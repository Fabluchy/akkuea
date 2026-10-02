"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, History } from "lucide-react";
import {
  Card,
  EmptyState,
  SectionErrorFallback,
  SkeletonText,
} from "@/components/ui";
import type { PilotPayoutHistoryEntry } from "@/services/pilot/reads";
import { formatBaseUnits, formatCycleLabel, formatUnixDate } from "./format";

/**
 * Per-cycle payout history for one investor.
 *
 * Every figure on this screen comes from a persisted `HolderSettlement` and
 * `DistributionSummary` read from contract storage. Nothing is recomputed from
 * token balances or the fee percentage, because a client-side pro-rata split
 * could drift from what was actually transferred - and this view's whole claim
 * is that it is showing the real thing.
 *
 * That also means it keeps working when the RPC no longer serves the events for
 * these cycles.
 */

export interface PayoutHistoryListProps {
  entries: PilotPayoutHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Testnet contract id, used to build the stellar.expert links. */
  contractId: string;
  locale?: string;
}

/**
 * Builds a stellar.expert link to the contract's transactions.
 *
 * Contract-level rather than per-cycle: Soroban RPC does not index an
 * invocation by its arguments, so the explorer link that actually resolves is
 * to the contract's transaction list.
 */
export function expertLink(contractId: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${contractId}?tab=transactions`;
}

/**
 * Formats a settled amount with its currency.
 *
 * Amounts deliberately ignore the locale: `formatBaseUnits` groups digits the
 * same way everywhere, and a payout figure should not change shape with the
 * reader's language.
 */
function formatInCurrency(amount: bigint, currency: "USDC" | "EURC"): string {
  return `${formatBaseUnits(amount)} ${currency}`;
}

export function PayoutHistoryList({
  entries,
  isLoading,
  error,
  onRefresh,
  contractId,
  locale = "en-US",
}: PayoutHistoryListProps) {
  const t = useTranslations("Pilot");

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white">
        <History className="h-4 w-4" aria-hidden="true" />
        {t("history.title")}
      </h2>
      <p className="text-xs text-neutral-500">{t("history.subtitle")}</p>
    </div>
  );

  if (isLoading && entries.length === 0) {
    return (
      <Card variant="bordered">
        {header}
        <SkeletonText lines={3} />
      </Card>
    );
  }

  if (error && entries.length === 0) {
    return (
      <Card variant="bordered">
        {header}
        <SectionErrorFallback onReset={onRefresh} message={error} />
      </Card>
    );
  }

  return (
    <Card variant="bordered">
      {header}

      {entries.length === 0 ? (
        <EmptyState
          title={t("history.emptyTitle")}
          description={t("history.emptyDescription")}
          icon={<History className="h-5 w-5 text-neutral-500" aria-hidden="true" />}
        />
      ) : (
        <ul className="divide-y divide-white/5" data-testid="payout-history-list">
          {entries.map((entry) => {
            const withheld = entry.withheldUsdc > BigInt(0);
            return (
              <li key={entry.cycleId} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-white">
                    {formatCycleLabel(entry.cycleId, locale)}
                  </p>
                  <p
                    data-testid={`payout-amount-${entry.cycleId}`}
                    className="text-sm font-medium text-white"
                  >
                    {withheld
                      ? t("history.withheldAmount", {
                          amount: formatBaseUnits(entry.withheldUsdc),
                        })
                      : formatInCurrency(entry.amount, entry.currency)}
                  </p>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    data-testid={`payout-currency-${entry.cycleId}`}
                    className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-neutral-400"
                  >
                    {withheld
                      ? t("history.currencyDeferred")
                      : t("history.currencyPaid", {
                          currency: entry.currency,
                        })}
                  </span>
                  {entry.settledAt > 0 && (
                    <span className="text-neutral-500">
                      {t("history.settledAt", {
                        date: formatUnixDate(entry.settledAt, locale),
                      })}
                    </span>
                  )}
                  {entry.summary && entry.summary.platformFee > BigInt(0) && (
                    <span className="text-neutral-500">
                      {t("history.fee", {
                        amount: formatBaseUnits(entry.summary.platformFee),
                      })}
                    </span>
                  )}
                  <a
                    href={expertLink(contractId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-cyan-400 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    {t("history.viewOnExplorer")}
                  </a>
                </div>

                {withheld && (
                  <p className="mt-1.5 text-xs text-amber-300">
                    {t("history.withheldHint")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}