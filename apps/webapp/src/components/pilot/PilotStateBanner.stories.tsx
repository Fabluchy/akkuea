import type { Meta, StoryObj } from "@storybook/react";
import { PilotStateBanner } from "./PilotStateBanner";

const EXIT_RECORD = {
  reason: "Property sold to a new owner; remaining rent settled directly",
  at: 1_772_323_200,
};

const meta: Meta<typeof PilotStateBanner> = {
  title: "Pilot/PilotStateBanner",
  component: PilotStateBanner,
  parameters: { layout: "padded" },
  args: {
    isPaused: false,
    exitStatus: undefined,
    woundDown: undefined,
  },
};

export default meta;
type Story = StoryObj<typeof PilotStateBanner>;

/** An active pilot renders no banner at all. */
export const Active: Story = {};

/** Operational and reversible: an admin can resume it. */
export const Paused: Story = {
  args: { isPaused: true },
};

/** Terminal, with the reason and timestamp both recorded on chain. */
export const Exited: Story = {
  args: { exitStatus: EXIT_RECORD },
};

/** Terminal with cycles that will now never be paid. */
export const WoundDown: Story = {
  args: {
    exitStatus: EXIT_RECORD,
    woundDown: { undeliveredCycleCount: 2 },
  },
};

/** A single outstanding cycle reads differently from several. */
export const WoundDownSingleCycle: Story = {
  args: {
    exitStatus: EXIT_RECORD,
    woundDown: { undeliveredCycleCount: 1 },
  },
};

/** Paused wins over terminal: it is the live operational fact. */
export const PausedAfterExit: Story = {
  args: { isPaused: true, exitStatus: EXIT_RECORD },
};