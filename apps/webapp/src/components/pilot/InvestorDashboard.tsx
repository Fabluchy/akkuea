"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ErrorBoundary, SectionErrorFallback } from "@/components/ui";
import { useWallet } from "@/components/auth/hooks";
import {
  useCurrencyPreference,
  usePayoutHistory,
  usePilotCycles,
  usePilotExitStatus,
  usePilotHoldings,
  usePayoutPaused,
  useWithheldBalance,
} from "@/hooks/usePilotContract";
import {
  pilotContractIds,
  pilotPropertySplatUrl,
} from "@/services/pilot/config";
import { claimWithheld, setCurrencyPreference } from "@/services/pilot/writes";
import type { PilotSettlementCurrency } from "@akkuea/shared";
import { CycleStatusTimeline } from "./CycleStatusTimeline";
import { EvidenceVerifyControl } from "./EvidenceVerifyControl";
import { InvestorHoldingsCard } from "./InvestorHoldingsCard";
import { PilotStateBanner } from "./PilotStateBanner";
import { PayoutHistoryList } from "./PayoutHistoryList";
import { PropertyEvidencePanel } from "./PropertyEvidencePanel";
import { SettlementCurrencyCard } from "./SettlementCurrencyCard";
import { WithheldFundsCard } from "./WithheldFundsCard";

interface InvestorDashboardProps {
  /** Name of the ally property shown in the 3D evidence panel. */
  propertyName?: string;
}

/**
 * The investor's view: what they hold, how reliably the ally has paid, what
 * they were actually paid in, what they can still reclaim, and what the
 * property actually looks like.
 *
 * The three new sections are deliberately driven by persisted contract state
 * rather than by what the cycle timeline happens to say:
 * - payout history comes from stored per-holder settlements, so it survives the
 *   event retention window;
 * - the withheld balance is the contract's own reserve for this holder, which
 *   is exactly what the claim action will release;
 * - the currency preference is read from chain, so the control reflects what a
 *   future distribution will honor.
 *
 * Each section is wrapped on its own, so a failing read cannot take the rest of
 * the payment history down with it.
 */
export function InvestorDashboard({ propertyName }: InvestorDashboardProps) {
  const t = useTranslations("Pilot");
  const { address, signTransaction } = useWallet();
  const cycles = usePilotCycles();
  const holdings = usePilotHoldings(address);
  const paused = usePayoutPaused();
  const exit = usePilotExitStatus();
  const withheld = useWithheldBalance(address);
  const currency = useCurrencyPreference(address);

  const cycleIds = useMemo(
    () => cycles.cycles.map((cycle) => cycle.cycleId),
    [cycles.cycles],
  );
  const history = usePayoutHistory(address, cycleIds);

  const refreshAll = useCallback(() => {
    history.refetch();
    withheld.refetch();
    currency.refetch();
    exit.refetch();
  }, [history, withheld, currency, exit]);

  const onChangeCurrency = useCallback(
    async (next: PilotSettlementCurrency) => {
      if (!address) return;
      await setCurrencyPreference(
        { holder: address, currency: next },
        signTransaction,
      );
      currency.refetch();
    },
    [address, signTransaction, currency],
  );

  const onClaim = useCallback(async () => {
    if (!address) return;
    await claimWithheld(address, signTransaction);
    withheld.refetch();
    history.refetch();
  }, [address, signTransaction, withheld, history]);

  // An exited pilot whose cycles were never distributed is what "wound down"
  // means: the chain says the pilot ended, and cycles below it are still
  // unresolved. Counting them here keeps that reading on chain state.
  const undelivered = useMemo(
    () =>
      cycles.cycles.filter(
        (cycle) =>
          cycle.distribution === undefined &&
          cycle.evidence?.status !== "rejected" &&
          cycle.evidence?.status !== "disputed",
      ).length,
    [cycles.cycles],
  );

  const woundDown =
    exit.isExited && undelivered > 0
      ? { undeliveredCycleCount: undelivered }
      : undefined;

  const payoutContractId = pilotContractIds().payoutSplit;

  return (
    <div className="space-y-6">
      <PilotStateBanner
        isPaused={paused.isPaused}
        exitStatus={exit.exitStatus ?? undefined}
        woundDown={woundDown}
      />

      <ErrorBoundary
        fallback={<SectionErrorFallback onReset={holdings.refetch} />}
      >
        <InvestorHoldingsCard
          holdings={holdings.holdings}
          totalDistributed={cycles.timeline.totalDistributed}
          isLoading={holdings.isLoading}
          error={holdings.error}
          isDisconnected={holdings.isDisconnected}
          lastUpdatedAt={holdings.lastUpdatedAt}
          connectionStatus={holdings.connectionStatus}
          onRefresh={holdings.refetch}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback onReset={refreshAll} />}>
        <WithheldFundsCard
          balance={withheld.balance}
          isLoading={withheld.isLoading}
          canClaim={Boolean(address)}
          onClaim={onClaim}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback onReset={history.refetch} />}>
        <PayoutHistoryList
          entries={history.entries}
          isLoading={history.isLoading}
          error={history.error}
          onRefresh={history.refetch}
          contractId={payoutContractId}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback onReset={currency.refetch} />}>
        <SettlementCurrencyCard
          preference={currency.preference}
          isLoading={currency.isLoading}
          error={currency.error}
          canChange={Boolean(address)}
          isPaused={paused.isPaused}
          isExited={exit.isExited}
          isWhitelisted={holdings.holdings?.whitelisted ?? false}
          onChange={onChangeCurrency}
          onRefresh={currency.refetch}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback onReset={cycles.refetch} />}>
        <CycleStatusTimeline
          timeline={cycles.timeline}
          isLoading={cycles.isLoading}
          error={cycles.error}
          lastUpdatedAt={cycles.lastUpdatedAt}
          connectionStatus={cycles.connectionStatus}
          onRefresh={cycles.refetch}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback />}>
        <PropertyEvidencePanel
          splatUrl={pilotPropertySplatUrl()}
          propertyName={propertyName ?? t("property.defaultName")}
        />
      </ErrorBoundary>
    </div>
  );
}

/** Re-exported so the review queue and dashboard share one verification control. */
export { EvidenceVerifyControl };