"use client";

import { useMemo } from "react";
import { ErrorBoundary, SectionErrorFallback } from "@/components/ui";
import {
  usePayoutPaused,
  usePilotCycles,
  usePilotExitStatus,
} from "@/hooks/usePilotContract";
import { CycleStatusTimeline } from "./CycleStatusTimeline";
import { EvidenceSubmissionForm } from "./EvidenceSubmissionForm";
import { PilotStateBanner } from "./PilotStateBanner";
import { currentCycleId } from "./currentCycle";

/**
 * The ally's view: report this cycle, then watch it move through review.
 *
 * Both halves read the same contract state, so the status shown on the form is
 * the same fact the investor timeline below is built from.
 */
export function AllyDashboard() {
  const {
    cycles,
    timeline,
    isLoading,
    error,
    lastUpdatedAt,
    connectionStatus,
    refetch,
  } = usePilotCycles();
  const { isPaused } = usePayoutPaused();
  const exit = usePilotExitStatus();

  const cycleId = useMemo(() => currentCycleId(), []);
  const current = cycles.find((cycle) => cycle.cycleId === cycleId);

  // Terminal state has to be visible here too: an ally whose pilot has wound
  // down otherwise sees only a submission form that will never be accepted.
  const undelivered = useMemo(
    () =>
      cycles.filter(
        (cycle) =>
          cycle.distribution === undefined &&
          cycle.evidence?.status !== "rejected" &&
          cycle.evidence?.status !== "disputed",
      ).length,
    [cycles],
  );

  const woundDown =
    exit.isExited && undelivered > 0
      ? { undeliveredCycleCount: undelivered }
      : undefined;

  return (
    <div className="space-y-6">
      <PilotStateBanner
        isPaused={isPaused}
        exitStatus={exit.exitStatus ?? undefined}
        woundDown={woundDown}
      />

      <ErrorBoundary fallback={<SectionErrorFallback onReset={refetch} />}>
        <EvidenceSubmissionForm
          cycleId={cycleId}
          currentStatus={current?.evidence?.status}
          reviewReason={current?.evidence?.reviewReason}
          isPaused={isPaused}
          onSubmitted={refetch}
        />
      </ErrorBoundary>

      <ErrorBoundary fallback={<SectionErrorFallback onReset={refetch} />}>
        <CycleStatusTimeline
          timeline={timeline}
          isLoading={isLoading}
          error={error}
          lastUpdatedAt={lastUpdatedAt}
          connectionStatus={connectionStatus}
          onRefresh={refetch}
        />
      </ErrorBoundary>
    </div>
  );
}
