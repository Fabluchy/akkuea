import type { Meta, StoryObj } from "@storybook/react";
import { EvidenceVerifyControl } from "./EvidenceVerifyControl";

const meta: Meta<typeof EvidenceVerifyControl> = {
  title: "Pilot/EvidenceVerifyControl",
  component: EvidenceVerifyControl,
  parameters: { layout: "padded" },
  args: {
    // SHA-256 of the document the link resolves to, so clicking through in a
    // real deployment has a chance of reporting match.
    expectedHex:
      "ebba5f79322507486b753343cf38135d142f2aa99511fe3447ee39d03b705ebc",
    evidenceLink: "https://example.org/evidence/2026-08.txt",
  },
};

export default meta;
type Story = StoryObj<typeof EvidenceVerifyControl>;

/** Re-fetches the link, re-hashes it in the browser, and compares. */
export const Default: Story = {};

/** Without a link there is nothing to verify, so the action stays disabled. */
export const NoLink: Story = {
  args: { evidenceLink: undefined },
};