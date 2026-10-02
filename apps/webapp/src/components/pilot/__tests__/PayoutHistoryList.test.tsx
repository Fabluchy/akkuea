import "@/test/setup-dom";
import { cleanup, within } from "@testing-library/react";
import { renderWithIntl as render } from "@/test/renderWithIntl";
import { PayoutHistoryList } from "../PayoutHistoryList";

afterEach(() => {
  cleanup();
});

const CONTRACT_ID = "CBGDO2GUWYSDU4SK3SNJJHYX6HRADUNXCU7TKJFFGLRWA4FSRZNLAJ4J";

const baseProps = {
  isLoading: false,
  error: null as string | null,
  onRefresh: () => {},
  contractId: CONTRACT_ID,
};

/**
 * A settled USDC cycle, as the contract persisted it.
 *
 * The amount below is deliberately NOT derivable from any other number on
 * screen: the point of the history view is that it shows stored state, so a
 * test that recomputes it would prove nothing.
 */
const augustEntry = {
  cycleId: "2026-08",
  amount: BigInt(4_500_000000),
  currency: "USDC" as const,
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

const eurcEntry = {
  cycleId: "2026-09",
  amount: BigInt(4_293_000000),
  currency: "EURC" as const,
  withheldUsdc: BigInt(0),
  settledAt: 1_775_836_800,
};

const withheldEntry = {
  cycleId: "2026-10",
  amount: BigInt(0),
  currency: "EURC" as const,
  withheldUsdc: BigInt(4_500_000000),
  settledAt: 1_779_350_400,
};

describe("PayoutHistoryList", () => {
  it("shows the amount and currency actually paid for a cycle", () => {
    const view = render(
      <PayoutHistoryList {...baseProps} entries={[augustEntry, eurcEntry]} />,
    );

    expect(
      within(view.container).getByTestId("payout-amount-2026-08").textContent,
    ).toContain("450.00 USDC");
    expect(
      within(view.container).getByTestId("payout-currency-2026-08").textContent,
    ).toContain("USDC");

    // The EURC cycle must show EURC, not a USDC equivalent recomputed locally.
    expect(
      within(view.container).getByTestId("payout-currency-2026-09").textContent,
    ).toContain("EURC");
  });

  it(
    "renders history from stored records when no events are available",
    () => {
      // The acceptance case: the RPC serves nothing but contract storage. The
      // view must be identical, because nothing here reads events.
      const view = render(
        <PayoutHistoryList {...baseProps} entries={[augustEntry]} />,
      );
      expect(
        within(view.container).getByTestId("payout-amount-2026-08").textContent,
      ).toContain("450.00 USDC");
    },
  );

  it("shows a withheld cycle as held USDC rather than a zero payment", () => {
    const view = render(
      <PayoutHistoryList {...baseProps} entries={[withheldEntry]} />,
    );
    const row = within(view.container).getByTestId("payout-amount-2026-10");
    expect(row.textContent).toContain("450.00 USDC held");
    expect(row.textContent).not.toContain("0.00 EURC");
    expect(view.container.textContent).toContain("Claim it below");
  });

  it("shows the cycle's platform fee from the persisted summary", () => {
    const view = render(
      <PayoutHistoryList {...baseProps} entries={[augustEntry]} />,
    );
    expect(view.container.textContent).toContain("100.00 USDC");
  });

  it("links each cycle to the contract on stellar.expert", () => {
    const view = render(
      <PayoutHistoryList {...baseProps} entries={[augustEntry]} />,
    );
    const link = within(view.container).getByRole("link");
    expect(link.getAttribute("href")).toContain(`contract/${CONTRACT_ID}`);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows an empty state rather than a blank card before any payout", () => {
    const view = render(<PayoutHistoryList {...baseProps} entries={[]} />);
    expect(view.container.textContent).toContain("No payouts yet");
  });

  it("shows an error state when nothing loaded", () => {
    const view = render(
      <PayoutHistoryList
        {...baseProps}
        entries={[]}
        error="Could not reach Soroban RPC."
      />,
    );
    expect(view.container.textContent).toContain("Could not reach Soroban RPC.");
  });
});