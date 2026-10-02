import type { Meta, StoryObj } from "@storybook/react";
import { WithheldFundsCard } from "./WithheldFundsCard";

const meta: Meta<typeof WithheldFundsCard> = {
  title: "Pilot/WithheldFundsCard",
  component: WithheldFundsCard,
  parameters: { layout: "padded" },
  args: {
    balance: BigInt(450_000000),
    isLoading: false,
    canClaim: true,
    onClaim: async () => {},
  },
};

export default meta;
type Story = StoryObj<typeof WithheldFundsCard>;

/** A rejected swap leg leaves USDC reserved for this holder. */
export const Claimable: Story = {};

/** Several cycles' worth accumulating before a single claim. */
export const LargeBalance: Story = {
  args: { balance: BigInt(1_350_000000) },
};

/** No wallet connected, so the balance is shown without a claim button. */
export const Disconnected: Story = {
  args: { canClaim: false },
};

export const Claiming: Story = {
  args: { isClaiming: true },
};

export const Loading: Story = {
  args: { isLoading: true },
};

/** With nothing reserved and no read in flight the card renders nothing. */
export const NothingReserved: Story = {
  args: { balance: BigInt(0) },
};