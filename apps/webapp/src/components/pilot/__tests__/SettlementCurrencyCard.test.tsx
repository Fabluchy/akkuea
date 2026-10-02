import "@/test/setup-dom";
import { cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@/test/renderWithIntl";
import { SettlementCurrencyCard } from "../SettlementCurrencyCard";

afterEach(() => {
  cleanup();
});

const baseProps = {
  isLoading: false,
  error: null as string | null,
  canChange: true,
  isPaused: false,
  isExited: false,
  isWhitelisted: true,
  onChange: async () => {},
  onRefresh: () => {},
};

describe("SettlementCurrencyCard", () => {
  it("shows the preference read from chain, not a local default", () => {
    const view = render(
      <SettlementCurrencyCard {...baseProps} preference="EURC" />,
    );
    expect(
      within(view.container).getByTestId("currency-badge").textContent,
    ).toContain("EURC");
  });

  it("requires the risk disclosure before opting in, then signs", async () => {
    const chosen: string[] = [];
    const view = render(
      <SettlementCurrencyCard
        {...baseProps}
        preference="USDC"
        onChange={async (currency) => {
          chosen.push(currency);
        }}
      />,
    );

    // Nothing is signed on the first click: the disclosure has to be shown.
    await userEvent.click(
      within(view.container).getByRole("button", { name: /opt in to EURC/i }),
    );
    expect(chosen).toEqual([]);

    const disclosure = within(view.container).getByTestId(
      "currency-risk-disclosure",
    );
    expect(disclosure.textContent).toContain("AMM");
    // The floor and the fallback are both part of the risk, not boilerplate.
    expect(disclosure.textContent).toContain("minimum exchange rate");
    expect(disclosure.textContent).toContain("reserved");

    await userEvent.click(
      within(view.container).getByRole("button", { name: /opt in to EURC/i }),
    );
    expect(chosen).toEqual(["EURC"]);
  });

  it("lets the investor back out of the disclosure without signing", async () => {
    const chosen: string[] = [];
    const view = render(
      <SettlementCurrencyCard
        {...baseProps}
        preference="USDC"
        onChange={async (currency) => {
          chosen.push(currency);
        }}
      />,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: /opt in to EURC/i }),
    );
    await userEvent.click(
      within(view.container).getByRole("button", { name: /cancel/i }),
    );

    expect(chosen).toEqual([]);
    expect(
      within(view.container).queryByTestId("currency-risk-disclosure"),
    ).toBeNull();
  });

  it("offers a direct switch away from EURC with no second disclosure", async () => {
    const chosen: string[] = [];
    const view = render(
      <SettlementCurrencyCard
        {...baseProps}
        preference="EURC"
        onChange={async (currency) => {
          chosen.push(currency);
        }}
      />,
    );

    // Leaving EURC reduces risk rather than adding it, so it is a single step.
    await userEvent.click(
      within(view.container).getByRole("button", { name: /switch to USDC/i }),
    );
    expect(chosen).toEqual(["USDC"]);
  });

  it("locks the control while the contract is paused", () => {
    const view = render(
      <SettlementCurrencyCard {...baseProps} preference="USDC" isPaused />,
    );
    expect(
      within(view.container).getByRole("button", { name: /opt in/i }).hasAttribute("disabled"),
    ).toBe(true);
    expect(view.container.textContent).toContain("paused");
  });

  it("locks the control after the pilot has ended", () => {
    const view = render(
      <SettlementCurrencyCard {...baseProps} preference="USDC" isExited />,
    );
    expect(view.container.textContent).toContain("has ended");
  });

  it("requires a connected wallet", () => {
    const view = render(
      <SettlementCurrencyCard {...baseProps} preference="USDC" canChange={false} />,
    );
    expect(view.container.textContent).toContain("Connect your wallet");
  });

  it("surfaces a rejected signature", async () => {
    const view = render(
      <SettlementCurrencyCard
        {...baseProps}
        preference="USDC"
        onChange={async () => {
          throw new Error("User rejected the request");
        }}
      />,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: /opt in to EURC/i }),
    );
    await userEvent.click(
      within(view.container).getByRole("button", { name: /opt in to EURC/i }),
    );

    expect(within(view.container).getByRole("alert").textContent).toContain(
      "User rejected",
    );
  });
});