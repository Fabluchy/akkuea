import type { Meta, StoryObj } from "@storybook/react";
import { PayoutHistoryList } from "./PayoutHistoryList";
import type { PilotPayoutHistoryEntry } from "@/services/pilot/reads";

const CONTRACT_ID = "CBGDO2GUWYSDU4SK3SNJJHYX6HRADUNXCU7TKJFFGLRWA4FSRZNLAJ4J";

const august: PilotPayoutHistoryEntry = {
  cycleId: "2026-08",
  amount: BigInt(450_000000),
  currency: "USDC",
  withheldUsdc: BigInt(0),
  settledAt: 1_772_323_200,
  summary: {
    cycleId: "2026-08",
    totalIncome: BigInt(10_000_000000),
    platformFee: BigInt(1_000_000000),
    holderAmount: BigInt(9_000_000000),
    holderCount: 5,
    distributedTotal: BigInt(4_500_000000),
    dust: BigInt(0),
    eurcDistributedTotal: BigInt(0),
    swapsFailed: 0,
    undistributedFailedSwaps: BigInt(0),
  },
};

const september: PilotPayoutHistoryEntry = {
  cycleId: "2026-09",
  amount: BigInt(4_293_000000),
  currency: "EURC",
  withheldUsdc: BigInt(0),
  settledAt: 1_775_836_800,
};

const october: PilotPayoutHistoryEntry = {
  cycleId: "2026-10",
  amount: BigInt(0),
  currency: "EURC",
  withheldUsdc: BigInt(450_000000),
  settledAt: 1_779_350_400,
};

const meta: Meta<typeof PayoutHistoryList> = {
  title: "Pilot/PayoutHistoryList",
  component: PayoutHistoryList,
  parameters: { layout: "padded" },
  args: {
    entries: [august],
    isLoading: false,
    error: null,
    onRefresh: () => {},
    contractId: CONTRACT_ID,
  },
};

export default meta;
type Story = StoryObj<typeof PayoutHistoryList>;

/** One USDC cycle, with the platform fee from the persisted summary. */
export const SingleUsdcCycle: Story = {};

/** Mixed currencies across cycles, read from stored settlements. */
export const MixedCurrencies: Story = {
  args: { entries: [august, september] },
};

/** A rejected swap leg: held as USDC, not shown as a zero EURC payment. */
export const WithheldCycle: Story = {
  args: { entries: [august, october] },
};

/** Before any cycle has been distributed. */
export const Empty: Story = {
  args: { entries: [] },
};

export const Loading: Story = {
  args: { entries: [], isLoading: true },
};

export const Error: Story = {
  args: { entries: [], error: "Could not reach Soroban RPC." },
};