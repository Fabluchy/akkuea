"use client";

import { useTranslations } from "next-intl";
import { PauseCircle, PlayCircle, XCircle } from "lucide-react";
import type { PilotExitRecord } from "@akkuea/shared";
import { cn } from "@/lib/utils";
import { formatUnixDate } from "./format";

/**
 * Terminal and operational state of the payout contract.
 *
 * Three distinct states, deliberately not collapsed into one "something is
 * wrong" banner:
 * - paused: operational and reversible; an admin can resume it.
 * - exited: permanent, with the reason and timestamp recorded on chain by the
 *   two signing parties.
 * - wound down: an exited pilot whose holders still have undelivered cycles,
 *   so a stale "pending" list would read as a false promise of payment.
 *
 * All three read from chain state passed in by the caller; nothing here infers
 * terminal status from a missing event or a stale cycle.
 */

/** Why a wound-down pilot is being shown as wound down rather than just exited. */
export interface WoundDownDetail {
  /** Cycles the chain shows as neither distributed nor resolved. */
  undeliveredCycleCount: number;
}

export interface PilotStateBannerProps {
  isPaused: boolean;
  /** Terminal exit record from chain, or undefined while the pilot is active. */
  exitStatus?: PilotExitRecord;
  /** Present when an exited pilot still has undelivered cycles. */
  woundDown?: WoundDownDetail;
  /** Locale for date formatting; defaults to the browser's US English. */
  locale?: string;
  className?: string;
}

type BannerTone = "paused" | "exited" | "wound-down";

interface BannerConfig {
  tone: BannerTone;
  title: string;
  description: string;
}

const TONE_CLASSES: Record<BannerTone, string> = {
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  exited: "border-white/10 bg-white/5 text-neutral-300",
  "wound-down": "border-red-500/30 bg-red-500/10 text-red-300",
};

const TONE_ICON_CLASSES: Record<BannerTone, string> = {
  paused: "text-amber-400",
  exited: "text-neutral-400",
  "wound-down": "text-red-400",
};

/**
 * Resolves which single banner applies.
 *
 * Wound down outranks exited because it is the strictly more urgent reading:
 * "this pilot ended" alone leaves an investor wondering about a cycle still
 * marked pending, while wound-down says that cycle will not be paid.
 *
 * Exported for the tests that pin the precedence, rather than testing it
 * through rendered markup for each combination.
 */
export function resolveBannerState(
  isPaused: boolean,
  exitStatus: PilotExitRecord | undefined,
  woundDown: WoundDownDetail | undefined,
): BannerTone | null {
  if (isPaused) return "paused";
  if (!exitStatus) return null;
  if (woundDown && woundDown.undeliveredCycleCount > 0) return "wound-down";
  return "exited";
}

export function PilotStateBanner({
  isPaused,
  exitStatus,
  woundDown,
  locale = "en-US",
  className,
}: PilotStateBannerProps) {
  const t = useTranslations("Pilot");
  const tone = resolveBannerState(isPaused, exitStatus, woundDown);

  if (!tone) return null;

  const config: BannerConfig =
    tone === "paused"
      ? {
          tone,
          title: t("state.pausedTitle"),
          description: t("state.pausedDescription"),
        }
      : tone === "wound-down"
        ? {
            tone,
            title: t("state.woundDownTitle"),
            description: t("state.woundDownDescription", {
              count: woundDown?.undeliveredCycleCount ?? 0,
            }),
          }
        : {
            tone,
            title: t("state.exitedTitle"),
            description: t("state.exitedDescription"),
          };

  const Icon =
    tone === "paused"
      ? PauseCircle
      : tone === "wound-down"
        ? XCircle
        : PlayCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`pilot-state-${tone}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2",
        TONE_CLASSES[config.tone],
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_ICON_CLASSES[config.tone])}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium">{config.title}</p>
        <p className="text-xs opacity-80">{config.description}</p>
        {exitStatus && (
          <div className="space-y-0.5 pt-1 text-xs opacity-70">
            {exitStatus.reason && (
              <p data-testid="pilot-exit-reason">
                {t("state.reasonLabel")}: {exitStatus.reason}
              </p>
            )}
            {exitStatus.at > 0 && (
              <p data-testid="pilot-exit-at">
                {t("state.exitedAt", {
                  date: formatUnixDate(exitStatus.at, locale),
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}