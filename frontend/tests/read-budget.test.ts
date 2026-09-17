/**
 * The read budget: Studio Next allows 30 gen_call starts per rolling
 * minute per IP (measured 17 Sep). The planner must let a fresh page read
 * at once, never plan more than READ_BUDGET starts inside any 60 s window,
 * and wait exactly for the window to roll rather than guessing.
 */
import { describe, expect, it } from "vitest";

import { planStart, READ_BUDGET, READ_WINDOW_MS } from "../lib/read";

function maxInAnyWindow(starts: number[]): number {
  let best = 0;
  for (let i = 0; i < starts.length; i++) {
    let n = 0;
    for (let j = i; j < starts.length && starts[j] < starts[i] + READ_WINDOW_MS; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

describe("the rolling read budget", () => {
  it("lets a fresh page's reads start almost at once", () => {
    const starts: number[] = [];
    const planned = Array.from({ length: 10 }, () => planStart(starts, 1_000));
    expect(planned[0]).toBe(1_000);
    expect(planned[9] - planned[0]).toBeLessThan(2_000);
  });

  it("never plans more than the budget inside any rolling minute", () => {
    const starts: number[] = [];
    const all: number[] = [];
    for (let i = 0; i < 100; i++) all.push(planStart(starts, 5_000));
    expect(maxInAnyWindow(all)).toBeLessThanOrEqual(READ_BUDGET);
    expect(READ_BUDGET).toBeLessThan(30);
  });

  it("waits exactly for the oldest start in the window to leave it", () => {
    const starts: number[] = [];
    const first = Array.from({ length: READ_BUDGET }, () => planStart(starts, 0));
    const next = planStart(starts, 0);
    expect(next).toBe(first[0] + READ_WINDOW_MS);
  });

  it("forgets starts that have rolled out of the window", () => {
    const starts: number[] = [];
    for (let i = 0; i < READ_BUDGET; i++) planStart(starts, 0);
    const later = planStart(starts, 10 * READ_WINDOW_MS);
    expect(later).toBe(10 * READ_WINDOW_MS);
    expect(starts.length).toBe(1);
  });
});

describe("refused reads carry the contract's own sentence", () => {
  const encode = (text: string) => btoa(String.fromCharCode(1, ...new TextEncoder().encode(text)));

  it("decodes the base64 receipt viem buries in the cause chain", async () => {
    const { contractRefusal } = await import("../lib/read");
    const err = {
      message: "Missing or invalid parameters.\nDetails: execution failed",
      cause: { message: "execution failed", data: { receipt: { result: encode("[EXPECTED] unknown market") } } },
    };
    expect(contractRefusal(err)).toBe("[EXPECTED] unknown market");
  });

  it("returns null for a transport failure with no receipt", async () => {
    const { contractRefusal } = await import("../lib/read");
    expect(contractRefusal(new Error("fetch failed"))).toBeNull();
  });
});
