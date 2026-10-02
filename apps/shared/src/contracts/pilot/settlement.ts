import { scValToNative } from "@stellar/stellar-sdk";
import type { PilotPayoutSplitClientInterface } from "./payout-split.js";

/**
 * Reading persisted settlement facts.
 *
 * Kept beside the generated client rather than inside it, so regenerating the
 * bindings does not overwrite this.
 *
 * Everything here reads contract storage. Nothing recomputes a pro-rata share
 * or infers a currency: the point of persisting `DistributionSummary` and
 * `HolderSettlement` is that an investor view can show what was actually
 * transferred, long after the RPC has dropped the events.
 */

/** Settlement currency, normalized from the contract's tagged enum. */
export type PilotSettlementCurrency = "USDC" | "EURC";

/** Currency tags as plain strings. */
type RawCurrencyTag = "Usdc" | "Eurc";

function toCurrency(tag: RawCurrencyTag): PilotSettlementCurrency {
  return tag === "Eurc" ? "EURC" : "USDC";
}

/** What one holder actually received for one cycle, read from storage. */
export interface PilotSettlementRecord {
  cycleId: string;
  holder: string;
  /**
   * The currency the share was delivered in. Stays `EURC` for a withheld leg,
   * where nothing was delivered.
   */
  currency: PilotSettlementCurrency;
  /** Delivered amount in `currency`. Zero when withheld. */
  amount: bigint;
  /** USDC reserved for this holder for this cycle, claimable via `claim_withheld`. */
  withheldUsdc: bigint;
  /** Unix seconds. */
  settledAt: number;
}

/** A cycle's persisted distribution summary, read from storage. */
export interface PilotDistributionSummary {
  cycleId: string;
  totalIncome: bigint;
  platformFee: bigint;
  holderAmount: bigint;
  holderCount: number;
  distributedTotal: bigint;
  dust: bigint;
  eurcDistributedTotal: bigint;
  swapsFailed: number;
  undistributedFailedSwaps: bigint;
}

interface RawHolderSettlement {
  holder: string;
  currency: [RawCurrencyTag];
  amount: bigint;
  withheld_usdc: bigint;
  settled_at: bigint;
}

interface RawDistributionSummary {
  cycle_id: string;
  total_income: bigint;
  platform_fee: bigint;
  holder_amount: bigint;
  holder_count: bigint;
  distributed_total: bigint;
  dust: bigint;
  eurc_distributed_total: bigint;
  swaps_failed: bigint;
  undistributed_failed_swaps: bigint;
}

/** The terminal exit record, read from contract storage. */
export interface PilotExitRecord {
  /** Free-text reason supplied by the two signing parties. */
  reason: string;
  /** Unix seconds. */
  at: number;
}

interface RawExitRecord {
  reason: string;
  at: bigint;
}

/**
 * Decode an `Option<Struct>` return value.
 *
 * Uses the generic ScVal converter for the same reason `readEvidence` does: the
 * pinned @stellar/stellar-sdk cannot decode an option wrapping a struct through
 * the typed `result`. Revisit if the SDK is upgraded.
 */
function unwrapOption<T>(retval: unknown): T | undefined {
  if (!retval) return undefined;
  return (scValToNative(retval as never) as T | null | undefined) ?? undefined;
}

function normalizeSettlement(
  cycleId: string,
  raw: RawHolderSettlement,
): PilotSettlementRecord {
  return {
    cycleId,
    holder: raw.holder,
    currency: toCurrency(raw.currency[0]),
    amount: raw.amount,
    withheldUsdc: raw.withheld_usdc,
    settledAt: Number(raw.settled_at),
  };
}

function normalizeSummary(
  raw: RawDistributionSummary,
): PilotDistributionSummary {
  return {
    cycleId: raw.cycle_id,
    totalIncome: raw.total_income,
    platformFee: raw.platform_fee,
    holderAmount: raw.holder_amount,
    holderCount: Number(raw.holder_count),
    distributedTotal: raw.distributed_total,
    dust: raw.dust,
    eurcDistributedTotal: raw.eurc_distributed_total,
    swapsFailed: Number(raw.swaps_failed),
    undistributedFailedSwaps: raw.undistributed_failed_swaps,
  };
}

/** Reads one holder's recorded outcome for a cycle, if it was settled. */
export async function readSettlement(
  client: PilotPayoutSplitClientInterface,
  cycleId: string,
  holder: string,
): Promise<PilotSettlementRecord | undefined> {
  const tx = await client.get_settlement({ cycle_id: cycleId, holder });
  const raw = unwrapOption<RawHolderSettlement>(
    tx.simulationData?.result?.retval,
  );
  return raw ? normalizeSettlement(cycleId, raw) : undefined;
}

/** Reads a cycle's persisted distribution summary, if it has been paid. */
export async function readDistributionSummary(
  client: PilotPayoutSplitClientInterface,
  cycleId: string,
): Promise<PilotDistributionSummary | undefined> {
  const tx = await client.get_distribution_summary({ cycle_id: cycleId });
  const raw = unwrapOption<RawDistributionSummary>(
    tx.simulationData?.result?.retval,
  );
  return raw ? normalizeSummary(raw) : undefined;
}

/**
 * Reads the USDC a holder can currently reclaim via `claim_withheld`.
 *
 * A plain `i128` return, so this one decodes through the typed `result`.
 */
export async function readWithheldBalance(
  client: PilotPayoutSplitClientInterface,
  holder: string,
): Promise<bigint> {
  const tx = await client.withheld_balance({ holder });
  return tx.result;
}

/**
 * Reads the terminal exit record, or undefined while the pilot is active.
 *
 * `None` means "not exited" and a record means "permanently wound down"; the
 * distinction a banner renders comes straight from chain either way.
 */
export async function readExitStatus(
  client: PilotPayoutSplitClientInterface,
): Promise<PilotExitRecord | undefined> {
  const tx = await client.exit_status();
  const raw = unwrapOption<RawExitRecord>(tx.simulationData?.result?.retval);
  return raw ? { reason: raw.reason, at: Number(raw.at) } : undefined;
}

/**
 * Reads a holder's settlement-currency preference.
 *
 * The contract returns `Currency` (not an option), so this decodes through the
 * typed `result` as a tagged union.
 */
export async function readCurrencyPreference(
  client: PilotPayoutSplitClientInterface,
  holder: string,
): Promise<PilotSettlementCurrency> {
  const tx = await client.get_currency_preference({ holder });
  const tag = (
    tx.result as { tag?: RawCurrencyTag } | undefined
  )?.tag;
  return toCurrency(tag ?? "Usdc");
}