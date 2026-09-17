/**
 * The availability decision, tested as a pure function: every status, both
 * sides of every wall-clock boundary, every role — with no browser and no
 * chain. What the pages offer is exactly what these tests pin.
 */
import { describe, expect, it } from "vitest";

import { actsFor, appealDeadline, legEligible, resolveAfter, ticketSettleable } from "../lib/acts";
import type { ConfigView, MarketView, PositionView, TicketView } from "../lib/types";

const CONFIG = {
  ruleset: "isobar-rules-1",
  owner: "0xaaa",
  min_stake_wei: "10000000000000000",
  max_stake_per_wallet_wei: "10000000000000000000",
  max_stakers_per_market: 200,
  max_markets: 500,
  max_rounds_per_market: 5,
  appeal_window_seconds: 3600,
  void_timeout_seconds: 14 * 86400,
  max_open_days_ahead: 21,
  min_legs: 2,
  max_legs: 4,
  leg_multiplier_x100: 180,
  multiplier_cap_x100: 1200,
  min_ticket_stake_wei: "10000000000000000",
  max_ticket_stake_wei: "2000000000000000000",
  max_tickets_per_market: 100,
  max_tickets_per_wallet: 50,
  fast_lane_lag_days: 1,
  global_lane_lag_days: 4,
  locations: { "panama-colon": { name: "Panama Canal — Colón", lat: 9.35, lon: -79.9, nws: null } },
  metrics: { WIND_MAX: { unit: "m/s" } },
  comparisons: ["GTE", "LT"],
  reserve_wei: "0",
  reserved_exposure_wei: "0",
} satisfies ConfigView;

const T0 = Date.parse("2026-09-20T00:00:00Z"); // the window date begins

function market(over: Partial<MarketView> = {}): MarketView {
  return {
    market_id: "mk-000001",
    ruleset: "isobar-rules-1",
    creator: "0xcreator",
    created_at: "2026-09-18T12:00:00Z",
    location_id: "panama-colon",
    metric: "WIND_MAX",
    comparison: "GTE",
    threshold_x100: 500,
    unit: "m/s",
    window_date: "2026-09-20",
    lane: "GLOBAL",
    state: "OPEN",
    phase: "OPEN",
    sources: [],
    yes_pool_wei: "0",
    no_pool_wei: "0",
    rounds_count: 0,
    verdict: null,
    resolved_at: null,
    appeal: null,
    finalized_at: null,
    void_reason: null,
    ...over,
  };
}

const noPosition: PositionView = { yes: 0, no: 0 };
const staked: PositionView = { yes: "50000000000000000", no: 0 };

function acts(m: MarketView, over: Partial<Parameters<typeof actsFor>[0]> = {}) {
  const list = actsFor({ market: m, config: CONFIG, account: "0xme",
                         position: noPosition, tickets: [], nowMs: T0 - 3600_000, ...over });
  return Object.fromEntries(list.map((a) => [a.id, a]));
}

describe("staking availability", () => {
  it("is open before the window starts and closed from its first second", () => {
    const m = market();
    expect(acts(m, { nowMs: T0 - 1 }).stake.available).toBe(true);
    const at = acts(m, { nowMs: T0 });
    expect(at.stake.available).toBe(false);
    expect(at.stake.reason).toMatch(/positions closed/);
  });

  it("asks for a wallet, in words", () => {
    const a = acts(market(), { account: "" });
    expect(a.stake.available).toBe(false);
    expect(a.stake.reason).toMatch(/connect a wallet/);
  });

  it("stops at the per-wallet cap", () => {
    const a = acts(market(), { position: { yes: CONFIG.max_stake_per_wallet_wei, no: 0 } });
    expect(a.stake.available).toBe(false);
    expect(a.stake.reason).toMatch(/per-market maximum/);
  });
});

describe("resolve availability", () => {
  it("waits for the lag, then opens to anyone connected", () => {
    const m = market();
    const ra = resolveAfter(m, CONFIG);
    expect(ra).toBe(T0 + 5 * 86400_000); // 1 + 4 lag days
    expect(acts(m, { nowMs: ra - 1 }).resolve.available).toBe(false);
    expect(acts(m, { nowMs: ra - 1 }).resolve.reason).toMatch(/cover the date/);
    expect(acts(m, { nowMs: ra }).resolve.available).toBe(true);
  });

  it("closes at the round ceiling with the timeout named", () => {
    const m = market({ rounds_count: 5 });
    const a = acts(m, { nowMs: resolveAfter(m, CONFIG) });
    expect(a.resolve.available).toBe(false);
    expect(a.resolve.reason).toMatch(/5 rounds/);
  });

  it("never offers a re-judgment of a standing verdict", () => {
    const m = market({ state: "RESOLVED", verdict: "YES", resolved_at: "2026-09-25T06:00:00Z" });
    const a = acts(m, { nowMs: Date.parse("2026-09-25T06:10:00Z") });
    expect(a.resolve.available).toBe(false);
    expect(a.resolve.reason).toMatch(/appeal/);
  });
});

describe("appeal availability", () => {
  const resolved = market({ state: "RESOLVED", verdict: "YES", resolved_at: "2026-09-25T06:00:00Z" });
  const inWindow = Date.parse("2026-09-25T06:59:59Z");
  const afterWindow = Date.parse("2026-09-25T07:00:01Z");

  it("needs money at stake", () => {
    const a = acts(resolved, { nowMs: inWindow });
    expect(a.appeal.available).toBe(false);
    expect(a.appeal.reason).toMatch(/money at stake/);
    expect(acts(resolved, { nowMs: inWindow, position: staked }).appeal.available).toBe(true);
  });

  it("a ticket on the market is standing too", () => {
    const ticket: TicketView = {
      ticket_id: "tk-000001", wallet: "0xme", stake_wei: "1", multiplier_x100: 324,
      payout_wei: "3", pricing: "DEMO_FLAT", state: "LIVE", bought_at: "", settled_at: null,
      legs: [{ market_id: "mk-000001", side: "YES", outcome: null }],
    };
    expect(acts(resolved, { nowMs: inWindow, tickets: [ticket] }).appeal.available).toBe(true);
  });

  it("closes at the window boundary, to the second", () => {
    expect(appealDeadline(resolved, CONFIG)).toBe(Date.parse("2026-09-25T07:00:00Z"));
    expect(acts(resolved, { nowMs: afterWindow, position: staked }).appeal.available).toBe(false);
    expect(acts(resolved, { nowMs: afterWindow, position: staked }).appeal.reason).toMatch(/window has closed/);
  });

  it("is spent after the one appeal", () => {
    const appealed = market({ ...resolved, appeal: { appellant: "0xother", at: "", prior_verdict: "YES", final_verdict: "YES" } });
    const a = acts(appealed, { nowMs: inWindow, position: staked });
    expect(a.appeal.available).toBe(false);
    expect(a.appeal.reason).toMatch(/one appeal/);
  });
});

describe("finalize and the escape hatch", () => {
  const resolved = market({ state: "RESOLVED", verdict: "YES", resolved_at: "2026-09-25T06:00:00Z" });

  it("finalize never front-runs the window, but follows an appeal at once", () => {
    const during = acts(resolved, { nowMs: Date.parse("2026-09-25T06:30:00Z") });
    expect(during.finalize.available).toBe(false);
    expect(during.finalize.reason).toMatch(/window is still open/);
    expect(acts(resolved, { nowMs: Date.parse("2026-09-25T07:00:01Z") }).finalize.available).toBe(true);
    const appealed = market({ ...resolved, appeal: { appellant: "0xo", at: "", prior_verdict: "YES", final_verdict: "YES" } });
    expect(acts(appealed, { nowMs: Date.parse("2026-09-25T06:30:00Z") }).finalize.available).toBe(true);
  });

  it("the void timeout opens only long after the sources should have covered", () => {
    const m = market();
    const deadline = resolveAfter(m, CONFIG) + CONFIG.void_timeout_seconds * 1000;
    expect(acts(m, { nowMs: deadline - 1 }).void_timeout.available).toBe(false);
    expect(acts(m, { nowMs: deadline }).void_timeout.available).toBe(true);
  });

  it("a settled market offers nothing but reasons", () => {
    const m = market({ state: "FINAL", verdict: "YES", resolved_at: "2026-09-25T06:00:00Z", finalized_at: "x" });
    const a = acts(m, { nowMs: Date.parse("2026-10-01T00:00:00Z"), position: staked });
    for (const id of ["stake", "resolve", "appeal", "finalize", "void_timeout"] as const) {
      expect(a[id].available).toBe(false);
      expect(a[id].reason).toBeTruthy();
    }
  });
});

describe("parlay helpers", () => {
  it("a leg is eligible only while positions are open", () => {
    const m = market();
    expect(legEligible(m, T0 - 1).ok).toBe(true);
    expect(legEligible(m, T0).ok).toBe(false);
  });

  it("a ticket settles only when every leg is final", () => {
    const final = market({ market_id: "mk-000001", state: "FINAL", verdict: "YES" });
    const open = market({ market_id: "mk-000002" });
    const t: TicketView = {
      ticket_id: "tk-000001", wallet: "0xme", stake_wei: "1", multiplier_x100: 324,
      payout_wei: "3", pricing: "DEMO_FLAT", state: "LIVE", bought_at: "", settled_at: null,
      legs: [
        { market_id: "mk-000001", side: "YES", outcome: null },
        { market_id: "mk-000002", side: "NO", outcome: null },
      ],
    };
    const both = new Map([["mk-000001", final], ["mk-000002", open]]);
    expect(ticketSettleable(t, both).ok).toBe(false);
    expect(ticketSettleable(t, both).reason).toMatch(/not final/);
    // a person reads this sentence: "Market #2", never the raw record id
    expect(ticketSettleable(t, both).reason).toMatch(/^Market #\d+ is not final yet$/);
    expect(ticketSettleable(t, both).reason).not.toMatch(/mk-/);
    const settledMap = new Map([["mk-000001", final], ["mk-000002", market({ market_id: "mk-000002", state: "VOID" })]]);
    expect(ticketSettleable(t, settledMap).ok).toBe(true);
    expect(ticketSettleable({ ...t, state: "WON" }, settledMap).ok).toBe(false);
  });
});
