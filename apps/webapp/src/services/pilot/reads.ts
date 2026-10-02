import {
  buildContractClientOptions,
  PilotIncomeTokenClient,
  PilotPayoutSplitClient,
  PilotWhitelistClient,
  readCurrencyPreference,
  readDistributionSummary,
  readEvidence,
  readExitStatus,
  readSettlement,
  readWithheldBalance,
  type PilotDistributionSummary,
  type PilotExitRecord,
  type PilotIncomeTokenClientInterface,
  type PilotPayoutSplitClientInterface,
  type PilotSettlementCurrency,
  type PilotWhitelistClientInterface,
  type PilotCycleRecord,
  type PilotEvidenceRecord,
  type PilotEvidenceStatus,
} from "@akkuea/shared";
import {
  assertPilotDeployed,
  pilotContractIds,
  pilotNetworkPassphrase,
  pilotPaymentDay,
  pilotRpcUrl,
  pilotStartCycle,
} from "./config";
import { enumerateCycles, expectedAtFor } from "./cycles";

/**
 * Read layer for the pilot dashboard.
 *
 * Every value here is a simulated contract read against Soroban RPC. Nothing is
 * fetched from the API, and nothing is persisted: the dashboard is a view of
 * contract storage, which is what lets an investor treat it as evidence rather
 * than as a claim by Akkuea.
 */

/** Platform fee the payout-split contract withholds, as a percentage. */
export const PLATFORM_FEE_PERCENT = BigInt(10);
const PERCENT_DENOMINATOR = BigInt(100);

function clients() {
  const ids = pilotContractIds();
  assertPilotDeployed(ids);
  const shared = {
    networkPassphrase: pilotNetworkPassphrase(),
    rpcUrl: pilotRpcUrl(),
  };
  // The generated clients build their call surface from the contract spec at
  // runtime; the matching interface is what describes it to TypeScript.
  return {
    payout: new PilotPayoutSplitClient(
      buildContractClientOptions({ ...shared, contractId: ids.payoutSplit }),
    ) as unknown as PilotPayoutSplitClientInterface,
    incomeToken: new PilotIncomeTokenClient(
      buildContractClientOptions({ ...shared, contractId: ids.incomeToken }),
    ) as unknown as PilotIncomeTokenClientInterface,
    whitelist: new PilotWhitelistClient(
      buildContractClientOptions({ ...shared, contractId: ids.whitelist }),
    ) as unknown as PilotWhitelistClientInterface,
  };
}

function toStatus(record: PilotEvidenceRecord): PilotEvidenceStatus {
  switch (record.status) {
    case "Submitted":
      return "submitted";
    case "UnderReview":
      return "under_review";
    case "Approved":
      return "approved";
    case "Rejected":
      return "rejected";
    case "Disputed":
      return "disputed";
  }
}

/**
 * Holder share of a cycle's income.
 *
 * Mirrors the contract's own truncating integer split so the dashboard never
 * shows a total the chain would disagree with.
 */
export function holderAmountFor(totalIncome: bigint): bigint {
  const platformFee =
    (totalIncome * PLATFORM_FEE_PERCENT) / PERCENT_DENOMINATOR;
  return totalIncome - platformFee;
}

function toCycleRecord(
  cycleId: string,
  expectedAt: number,
  record: PilotEvidenceRecord | undefined,
): PilotCycleRecord {
  if (!record) {
    return { cycleId, expectedAt };
  }

  const status = toStatus(record);
  return {
    cycleId,
    expectedAt,
    evidence: {
      status,
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt > 0 ? record.reviewedAt : undefined,
      reviewReason: record.reviewReason || undefined,
    },
    distribution: record.distributed
      ? {
          distributedAt: record.distributedAt,
          totalIncome: record.totalIncome,
          holderAmount: holderAmountFor(record.totalIncome),
        }
      : undefined,
  };
}

export interface PilotEvidenceDetail extends PilotCycleRecord {
  /** Hex-encoded SHA-256 digest written on-chain, when evidence exists. */
  evidenceHashHex?: string;
  /** Link the ally supplied alongside the hash. */
  evidenceLink?: string;
  /** Reported income for the cycle, in USDC stroops. */
  totalIncome?: bigint;
}

function toDetail(
  cycleId: string,
  expectedAt: number,
  record: PilotEvidenceRecord | undefined,
): PilotEvidenceDetail {
  const base = toCycleRecord(cycleId, expectedAt, record);
  if (!record) {
    return base;
  }
  return {
    ...base,
    evidenceHashHex: Buffer.from(record.evidenceHash).toString("hex"),
    evidenceLink: record.evidenceLink,
    totalIncome: record.totalIncome,
  };
}

/**
 * Reads every cycle from the configured pilot start month to the current one.
 *
 * Cycles are read individually from contract storage rather than reconstructed
 * from events, so history stays complete beyond the RPC event retention window.
 */
export async function fetchPilotCycles(
  now: Date = new Date(),
): Promise<PilotEvidenceDetail[]> {
  const { payout } = clients();
  const paymentDay = pilotPaymentDay();
  const cycleIds = enumerateCycles(pilotStartCycle(), now);

  const records = await Promise.all(
    cycleIds.map(async (cycleId) => {
      const record = await readEvidence(payout, cycleId);
      return toDetail(cycleId, expectedAtFor(cycleId, paymentDay), record);
    }),
  );

  return records;
}

export async function fetchPilotCycle(
  cycleId: string,
): Promise<PilotEvidenceDetail> {
  const { payout } = clients();
  const record = await readEvidence(payout, cycleId);
  return toDetail(cycleId, expectedAtFor(cycleId, pilotPaymentDay()), record);
}

export async function fetchPayoutPaused(): Promise<boolean> {
  const { payout } = clients();
  const tx = await payout.is_paused();
  return tx.result;
}

/**
 * Reads the terminal exit record, or undefined while the pilot is active.
 *
 * Read straight from contract storage: the dashboard never infers "wound down"
 * from a stale cycle or a missing event.
 */
export async function fetchExitStatus(): Promise<PilotExitRecord | undefined> {
  const { payout } = clients();
  return readExitStatus(payout);
}

/**
 * Reads the USDC a holder can currently reclaim via `claim_withheld`.
 *
 * This is the balance the contract is holding on the holder's behalf, not a
 * locally derived figure, so the claim button reflects exactly what a signature
 * would release.
 */
export async function fetchWithheldBalance(
  address: string,
): Promise<bigint> {
  const { payout } = clients();
  return readWithheldBalance(payout, address);
}

/** Reads a holder's settlement-currency preference; defaults to USDC on chain. */
export async function fetchCurrencyPreference(
  address: string,
): Promise<PilotSettlementCurrency> {
  const { payout } = clients();
  return readCurrencyPreference(payout, address);
}

/** One settled cycle as the investor's payout history shows it. */
export interface PilotPayoutHistoryEntry {
  cycleId: string;
  /** Amount actually delivered, denominated in `currency`. */
  amount: bigint;
  currency: PilotSettlementCurrency;
  /** USDC reserved for this cycle because the leg was rejected. */
  withheldUsdc: bigint;
  /** Unix seconds the settlement was recorded. */
  settledAt: number;
  /** The cycle's persisted summary, when the cycle was distributed. */
  summary?: PilotDistributionSummary;
}

/**
 * Builds this holder's payout history from persisted contract state.
 *
 * Every figure comes from a stored `HolderSettlement` / `DistributionSummary`,
 * never from re-deriving the pro-rata split: the point is that the history an
 * investor reads is the history the chain recorded, and it stays readable when
 * the RPC has dropped the corresponding events.
 */
export async function fetchPayoutHistory(
  address: string,
  cycleIds: string[],
): Promise<PilotPayoutHistoryEntry[]> {
  const { payout } = clients();

  const entries = await Promise.all(
    cycleIds.map(async (cycleId) => {
      const [settlement, summary] = await Promise.all([
        readSettlement(payout, cycleId, address),
        readDistributionSummary(payout, cycleId),
      ]);
      if (!settlement) return undefined;
      return { cycleId, settlement, summary };
    }),
  );

  return entries
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== undefined,
    )
    .map(({ cycleId, settlement, summary }) => ({
      cycleId,
      amount: settlement.amount,
      currency: settlement.currency,
      withheldUsdc: settlement.withheldUsdc,
      settledAt: settlement.settledAt,
      summary,
    }));
}

export interface PilotHoldings {
  /** The viewer's token balance, in token base units. */
  balance: bigint;
  totalSupply: bigint;
  decimals: number;
  symbol: string;
  /** Whether the viewer is approved on the pilot whitelist. */
  whitelisted: boolean;
}

export async function fetchPilotHoldings(
  address: string,
): Promise<PilotHoldings> {
  const { incomeToken, whitelist } = clients();

  const [balance, totalSupply, decimals, symbol, whitelisted] =
    await Promise.all([
      incomeToken.balance({ id: address }).then((tx) => tx.result),
      incomeToken.total_supply().then((tx) => tx.result),
      incomeToken.decimals().then((tx) => tx.result),
      incomeToken.symbol().then((tx) => tx.result),
      whitelist.is_approved({ address }).then((tx) => tx.result),
    ]);

  return { balance, totalSupply, decimals, symbol, whitelisted };
}

/**
 * The viewer's share of a cycle's holder distribution, in USDC stroops.
 *
 * Uses the same truncating split the contract applies per holder, so a shown
 * amount matches what the payout transaction actually transferred.
 */
export function holderShareOf(
  holderAmount: bigint,
  balance: bigint,
  totalSupply: bigint,
): bigint {
  if (totalSupply <= BigInt(0)) {
    return BigInt(0);
  }
  return (holderAmount * balance) / totalSupply;
}
