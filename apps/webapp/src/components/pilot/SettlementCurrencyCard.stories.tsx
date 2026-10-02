import type { Meta, StoryObj } from "@storybook/react";
import { SettlementCurrencyCard } from "./SettlementCurrencyCard";

const meta: Meta<typeof SettlementCurrencyCard> = {
  title: "Pilot/SettlementCurrencyCard",
  component: SettlementCurrencyCard,
  parameters: { layout: "padded" },
  args: {
    preference: "USDC",
    isLoading: false,
    error: null,
    canChange: true,
    isPaused: false,
    isExited: false,
    isWhitelisted: true,
    onChange: async () => {},
    onRefresh: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SettlementCurrencyCard>;

/** Default settlement, which is USDC whether or not a preference is stored. */
export const DefaultUsdc: Story = {};

/** Already opted in; the available action is to switch back. */
export const OptedInEurc: Story = {
  args: { preference: "EURC" },
};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Error: Story = {
  args: { error: "Could not reach Soroban RPC." },
};

/** No wallet connected, so the control explains rather than offering a dead button. */
export const Disconnected: Story = {
  args: { canChange: false },
};

/** Whitelist approval gates setting a preference on chain. */
export const NotWhitelisted: Story = {
  args: { isWhitelisted: false },
};

export const Paused: Story = {
  args: { isPaused: true },
};

export const Exited: Story = {
  args: { isExited: true },
};