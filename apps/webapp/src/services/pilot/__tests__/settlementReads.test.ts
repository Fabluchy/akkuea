import { nativeToScVal } from "@stellar/stellar-sdk";
import {
  readCurrencyPreference,
  readDistributionSummary,
  readSettlement,
  readWithheldBalance,
  type PilotPayoutSplitClientInterface,
} from "@akkuea/shared";

/**
 * Settlement reads.
 *
 * These tests stand in for the acceptance criterion that matters most here:
 * the investor view must show what was paid from persisted contract state, and
 * must still do so when the RPC returns no events at all. Nothing in this layer
 * fetches events, and every mock here offers an event read returning an empty
 * array - if a read ever started depending on it, these tests would fail.
 *
 * Return values are real `ScVal`s round-tripped through `nativeToScVal`,
 * because the read layer decodes with `scValToNative`. Hand-built plain objects
 * would pass a mock that never exercised the actual conversion.
 */

type SimulationResult = { simulationData?: { result?: { retval?: unknown } } };

/** Wraps a native value as the ScVal the RPC would actually return. */
function retval(value: unknown): SimulationResult {
  return {
    simulationData: { result: { retval: nativeToScVal(value) } },
  };
}

const EURC_SETTLEMENT = {
  holder: "GHOST",
  currency: ["Eurc"],
  amount: BigInt(4_293_000000),
  withheld_usdc: BigInt(0),
  settled_at: BigInt(1_775_836_800),
};

const SUMMARY = {
  cycle_id: "2026-09",
  total_income: BigInt(10_000_000000),
  platform_fee: BigInt(1_000_000000),
  holder_amount: BigInt(9_000_000000),
  holder_count: 5,
  distributed_total: BigInt(4_500_000000),
  dust: BigInt(0),
  eurc_distributed_total: BigInt(4_293_000000),
  swaps_failed: 0,
  undistributed_failed_swaps: BigInt(0),
};

function stubbedClient(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const client = {
    get_settlement: (args: { cycle_id: string; holder: string }) => {
      calls.push(`get_settlement:${args.cycle_id}:${args.holder}`);
      return Promise.resolve(retval(EURC_SETTLEMENT));
    },
    get_distribution_summary: (args: { cycle_id: string }) => {
      calls.push(`get_distribution_summary:${args.cycle_id}`);
      return Promise.resolve(retval(SUMMARY));
    },
    withheld_balance: () =>
      Promise.resolve({ result: BigInt(4_500_000000) }),
    get_currency_preference: () =>
      Promise.resolve({ result: { tag: "Eurc", values: undefined } }),
    // Present so a read that reached for events would show up in `calls`.
    getEvents: () => {
      calls.push("getEvents");
      return Promise.resolve({ result: { events: [] } });
    },
    ...overrides,
  };
  return { client: client as unknown as PilotPayoutSplitClientInterface, calls };
}

describe("readSettlement", () => {
  it("reads the persisted amount and currency for a holder", async () => {
    const { client, calls } = stubbedClient();
    const record = await readSettlement(client, "2026-09", "GHOST");

    expect(record?.currency).toBe("EURC");
    expect(record?.amount).toBe(BigInt(4_293_000000));
    expect(record?.cycleId).toBe("2026-09");
    expect(record?.settledAt).toBe(1_775_836_800);
    // Storage only: the empty event response is never consulted.
    expect(calls).toEqual(["get_settlement:2026-09:GHOST"]);
  });

  it("normalizes a withheld leg as held rather than as a zero payment", async () => {
    const { client } = stubbedClient({
      get_settlement: () =>
        Promise.resolve(
          retval({ ...EURC_SETTLEMENT, amount: BigInt(0), withheld_usdc: BigInt(4_500_000000) }),
        ),
    });

    const record = await readSettlement(client, "2026-10", "GHOST");
    expect(record?.amount).toBe(BigInt(0));
    expect(record?.withheldUsdc).toBe(BigInt(4_500_000000));
  });

  it("reads a USDC leg as USDC", async () => {
    const { client } = stubbedClient({
      get_settlement: () =>
        Promise.resolve(
          retval({
            ...EURC_SETTLEMENT,
            currency: ["Usdc"],
            amount: BigInt(900_000000),
          }),
        ),
    });

    const record = await readSettlement(client, "2026-08", "GHOST");
    expect(record?.currency).toBe("USDC");
    expect(record?.amount).toBe(BigInt(900_000000));
  });

  it("returns undefined for a cycle that was never settled", async () => {
    const { client } = stubbedClient({
      get_settlement: () => Promise.resolve({ simulationData: {} }),
    });
    expect(await readSettlement(client, "2026-11", "GHOST")).toBeUndefined();
  });
});

describe("readDistributionSummary", () => {
  it("reads the persisted summary including the withheld total", async () => {
    const { client, calls } = stubbedClient();
    const summary = await readDistributionSummary(client, "2026-09");

    expect(summary?.platformFee).toBe(BigInt(1_000_000000));
    expect(summary?.holderCount).toBe(5);
    expect(summary?.eurcDistributedTotal).toBe(BigInt(4_293_000000));
    expect(calls).toEqual(["get_distribution_summary:2026-09"]);
  });

  it("returns undefined for a cycle that has not been distributed", async () => {
    const { client } = stubbedClient({
      get_distribution_summary: () => Promise.resolve({ simulationData: {} }),
    });
    expect(
      await readDistributionSummary(client, "2026-11"),
    ).toBeUndefined();
  });
});

describe("readWithheldBalance", () => {
  it("reads the holder's reserved balance", async () => {
    const { client } = stubbedClient();
    expect(await readWithheldBalance(client, "GHOST")).toBe(
      BigInt(4_500_000000),
    );
  });
});

describe("readCurrencyPreference", () => {
  it("maps the contract's tagged enum to a plain currency", async () => {
    const { client } = stubbedClient();
    expect(await readCurrencyPreference(client, "GHOST")).toBe("EURC");
  });

  it("defaults to USDC when the contract reports no tag", async () => {
    const { client } = stubbedClient({
      get_currency_preference: () => Promise.resolve({ result: undefined }),
    });
    expect(await readCurrencyPreference(client, "GHOST")).toBe("USDC");
  });
});