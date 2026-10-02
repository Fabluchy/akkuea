import "@/test/setup-dom";
import { cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@/test/renderWithIntl";
import { WithheldFundsCard } from "../WithheldFundsCard";

afterEach(() => {
  cleanup();
});

const baseProps = {
  isLoading: false,
  canClaim: true,
};

describe("WithheldFundsCard", () => {
  it("renders nothing when the contract holds nothing for this holder", () => {
    const view = render(
      <WithheldFundsCard {...baseProps} balance={BigInt(0)} onClaim={async () => {}} />,
    );
    expect(view.container.firstChild).toBeNull();
  });

  it("shows the contract's reserved balance and a claim action", () => {
    const view = render(
      <WithheldFundsCard
        {...baseProps}
        balance={BigInt(450_000000)}
        onClaim={async () => {}}
      />,
    );
    const balance = within(view.container).getByTestId("withheld-balance");
    expect(balance.textContent).toContain("45.00 USDC");
    expect(
      within(view.container).getByRole("button", { name: /claim/i }),
    ).not.toBeNull();
  });

  it("explains why the funds are held", () => {
    const view = render(
      <WithheldFundsCard
        {...baseProps}
        balance={BigInt(450_000000)}
        onClaim={async () => {}}
      />,
    );
    expect(view.container.textContent).toContain("reserved");
  });

  it("invokes the claim when clicked", async () => {
    let claimed = 0;
    const view = render(
      <WithheldFundsCard
        {...baseProps}
        balance={BigInt(450_000000)}
        onClaim={async () => {
          claimed += 1;
        }}
      />,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: /claim/i }),
    );
    expect(claimed).toBe(1);
  });

  it("asks for a wallet instead of a broken button when disconnected", () => {
    const view = render(
      <WithheldFundsCard
        {...baseProps}
        canClaim={false}
        balance={BigInt(450_000000)}
        onClaim={async () => {}}
      />,
    );
    expect(
      within(view.container).queryByRole("button", { name: /claim/i }),
    ).toBeNull();
    expect(view.container.textContent).toContain("Connect your wallet");
  });

  it("surfaces a failed claim rather than swallowing it", async () => {
    const view = render(
      <WithheldFundsCard
        {...baseProps}
        balance={BigInt(450_000000)}
        onClaim={async () => {
          throw new Error("Transaction failed");
        }}
      />,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: /claim/i }),
    );

    const alert = within(view.container).getByRole("alert");
    expect(alert.textContent).toContain("Transaction failed");
  });
});