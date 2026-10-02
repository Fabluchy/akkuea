import "@/test/setup-dom";
import { cleanup, within } from "@testing-library/react";
import { renderWithIntl as render } from "@/test/renderWithIntl";
import {
  PilotStateBanner,
  resolveBannerState,
} from "../PilotStateBanner";

afterEach(() => {
  cleanup();
});

const exitRecord = {
  reason: "Property sold to a new owner",
  at: 1_772_323_200,
};

describe("resolveBannerState", () => {
  it("renders nothing for an active pilot", () => {
    expect(resolveBannerState(false, undefined, undefined)).toBeNull();
  });

  it("shows paused for a paused active pilot", () => {
    expect(resolveBannerState(true, undefined, undefined)).toBe("paused");
  });

  it("shows exited for a terminated pilot with nothing outstanding", () => {
    expect(resolveBannerState(false, exitRecord, undefined)).toBe("exited");
  });

  it("shows wound down when an exited pilot still owes cycles", () => {
    expect(
      resolveBannerState(false, exitRecord, { undeliveredCycleCount: 2 }),
    ).toBe("wound-down");
  });

  it("does not call it wound down when nothing is undelivered", () => {
    expect(
      resolveBannerState(false, exitRecord, { undeliveredCycleCount: 0 }),
    ).toBe("exited");
  });

  it("puts paused ahead of a terminal state, since paused is the live fact", () => {
    expect(
      resolveBannerState(true, exitRecord, { undeliveredCycleCount: 3 }),
    ).toBe("paused");
  });
});

describe("PilotStateBanner", () => {
  it("renders nothing when the pilot is active", () => {
    const view = render(
      <PilotStateBanner isPaused={false} exitStatus={undefined} />,
    );
    expect(view.container.firstChild).toBeNull();
  });

  it("renders a distinct banner for the paused state", () => {
    const view = render(
      <PilotStateBanner isPaused exitStatus={undefined} />,
    );
    const banner = within(view.container).getByTestId("pilot-state-paused");
    expect(banner.textContent).toContain("Payouts are paused");
  });

  it("renders a distinct banner for the exited state with reason and date", () => {
    const view = render(
      <PilotStateBanner isPaused={false} exitStatus={exitRecord} />,
    );
    within(view.container).getByTestId("pilot-state-exited");
    // The on-chain reason and timestamp are what make the state explicable
    // rather than just "something ended".
    expect(
      within(view.container).getByTestId("pilot-exit-reason").textContent,
    ).toContain("Property sold to a new owner");
    expect(
      within(view.container).getByTestId("pilot-exit-at").textContent,
    ).toContain("2026");
  });

  it("renders a distinct banner for the wound-down state and counts the cycles", () => {
    const view = render(
      <PilotStateBanner
        isPaused={false}
        exitStatus={exitRecord}
        woundDown={{ undeliveredCycleCount: 2 }}
      />,
    );
    const banner = within(view.container).getByTestId(
      "pilot-state-wound-down",
    );
    expect(banner.textContent).toContain("wound down");
    expect(banner.textContent).toContain("2 cycles");
  });

  it("announces state changes to assistive technology", () => {
    const view = render(
      <PilotStateBanner isPaused exitStatus={undefined} />,
    );
    const banner = within(view.container).getByRole("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });
});