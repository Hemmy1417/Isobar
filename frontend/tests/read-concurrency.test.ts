/**
 * Studio Next's shared execution slots: a page reads concurrently but never
 * holds more than MAX_IN_FLIGHT, and a "Server busy … retry later" refusal
 * (seen live on the deployed site, 17 Sep) is retried instead of failing
 * the list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ inFlight: 0, peak: 0, busyOnce: new Set<string>(), calls: 0 }));

vi.mock("genlayer-js", () => ({
  createClient: () => ({
    readContract: async ({ args }: { args: string[] }) => {
      state.calls += 1;
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      try {
        await new Promise((r) => setTimeout(r, 600)); // real gen_calls take ~0.8 s
        const id = args[0];
        if (state.busyOnce.has(id)) {
          state.busyOnce.delete(id);
          throw new Error("GenLayer RPC error (gen_call): Server busy: all 8 execution slots occupied, retry later");
        }
        return JSON.stringify({ market_id: id });
      } finally {
        state.inFlight -= 1;
      }
    },
  }),
}));

import { isTransient } from "../lib/chain";
import { getMarkets, invalidateReads, MAX_IN_FLIGHT } from "../lib/read";

const ids = Array.from({ length: 8 }, (_, i) => `mk-00000${i + 1}`);

beforeEach(() => {
  invalidateReads();
  state.inFlight = 0;
  state.peak = 0;
  state.calls = 0;
  state.busyOnce.clear();
});

describe("reads share Studio Next's execution slots politely", () => {
  it("classifies the busy refusal as transient", () => {
    expect(isTransient(new Error("Server busy: all 8 execution slots occupied, retry later"))).toBe(true);
  });

  it("never holds more than MAX_IN_FLIGHT reads at once", async () => {
    const markets = await getMarkets(ids);
    expect(markets).toHaveLength(8);
    expect(state.peak).toBeLessThanOrEqual(MAX_IN_FLIGHT);
    expect(state.peak).toBeGreaterThan(1);
  });

  it("retries a busy refusal and still returns every market", async () => {
    state.busyOnce.add("mk-000003");
    const markets = await getMarkets(ids);
    expect(markets.map((m) => m.market_id)).toEqual(ids);
    expect(state.calls).toBe(9);
  }, 15_000);
});
