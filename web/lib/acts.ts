/**
 * S40: what a visitor can do to a market, as a PURE function of the
 * record the contract returned, the deployment's config, the connected
 * account and the clock. Every act the pages offer comes from here, and a
 * blocked act is shown with its reason in words — never as a button that
 * fails. The contract enforces every rule again; this only stops a person
 * paying a fee to be told no.
 */
import { sameAddress } from "./chain";
import type { ConfigView, MarketView, PositionView, TicketView } from "./types";

export type ActId = "stake" | "resolve" | "appeal" | "finalize" | "void_timeout";

export interface Act {
  id: ActId;
  label: string;
  available: boolean;
  reason?: string;
}

const MS_DAY = 86_400_000;

function windowStart(m: MarketView): number {
  return Date.parse(`${m.window_date}T00:00:00Z`);
}

function lagDays(m: MarketView, config: ConfigView): number {
  return m.lane === "FAST" ? config.fast_lane_lag_days : config.global_lane_lag_days;
}

export function resolveAfter(m: MarketView, config: ConfigView): number {
  return windowStart(m) + (1 + lagDays(m, config)) * MS_DAY;
}

export function appealDeadline(m: MarketView, config: ConfigView): number | null {
  if (!m.resolved_at) return null;
  return Date.parse(m.resolved_at) + config.appeal_window_seconds * 1_000;
}

export function voidDeadline(m: MarketView, config: ConfigView): number {
  return resolveAfter(m, config) + config.void_timeout_seconds * 1_000;
}

export interface ActInput {
  market: MarketView;
  config: ConfigView;
  account: string;
  position: PositionView | null;
  /** Tickets the connected wallet holds (for appeal standing). */
  tickets: TicketView[];
  nowMs: number;
}

function holdsStake(i: ActInput): boolean {
  const pos = i.position;
  const staked = !!pos && Number(pos.yes) + Number(pos.no) > 0;
  const onTicket = i.tickets.some((t) => t.legs.some((l) => l.market_id === i.market.market_id));
  return staked || onTicket;
}

export function actsFor(i: ActInput): Act[] {
  const { market: m, config, account, nowMs } = i;
  const connected = !!account;
  const acts: Act[] = [];
  const phase = m.state === "OPEN"
    ? (nowMs < windowStart(m) ? "OPEN" : nowMs < resolveAfter(m, config) ? "OBSERVING" : "RESOLVING")
    : m.state;

  // Stake — before the observation date begins.
  let stakeReason: string | undefined;
  if (phase !== "OPEN") stakeReason = "positions closed when the observation date began";
  else if (!connected) stakeReason = "connect a wallet to take a position in your own name";
  else {
    const pos = i.position;
    const held = pos ? Number(pos.yes) + Number(pos.no) : 0;
    if (held >= Number(config.max_stake_per_wallet_wei))
      stakeReason = "this wallet holds its per-market maximum";
  }
  acts.push({ id: "stake", label: "Take a position", available: !stakeReason,
              ...(stakeReason ? { reason: stakeReason } : {}) });

  // Resolve — permissionless once both sources can cover the date.
  let resolveReason: string | undefined;
  if (m.state === "RESOLVED") resolveReason = "a verdict already stands; a re-judgment is an appeal";
  else if (m.state === "FINAL" || m.state === "VOID") resolveReason = "the market is settled";
  else if (phase === "OPEN") resolveReason = "the observation date has not begun";
  else if (phase === "OBSERVING")
    resolveReason = `both sources can cover the date about ${1 + lagDays(m, config)} days after it starts`;
  else if (m.rounds_count >= config.max_rounds_per_market)
    resolveReason = `the market holds the ${config.max_rounds_per_market} rounds it allows; the timeout will void it`;
  else if (!connected) resolveReason = "connect a wallet to trigger the resolution round";
  acts.push({ id: "resolve", label: "Resolve against the sources", available: !resolveReason,
              ...(resolveReason ? { reason: resolveReason } : {}) });

  // Appeal — one, by money at stake, inside the window.
  const deadline = appealDeadline(m, config);
  let appealReason: string | undefined;
  if (m.state !== "RESOLVED") appealReason = "an appeal needs a standing verdict";
  else if (m.appeal) appealReason = "the market's one appeal is already on the record";
  else if (deadline !== null && nowMs > deadline) appealReason = "the appeal window has closed; the verdict is final";
  else if (!connected) appealReason = "connect a wallet with money at stake to appeal";
  else if (!holdsStake(i)) appealReason = "only a wallet with money at stake may appeal";
  acts.push({ id: "appeal", label: "Appeal the verdict", available: !appealReason,
              ...(appealReason ? { reason: appealReason } : {}) });

  // Finalize — permissionless, after the window (or the appeal).
  let finalizeReason: string | undefined;
  if (m.state !== "RESOLVED") finalizeReason = m.state === "FINAL" || m.state === "VOID"
    ? "the market is settled" : "nothing to finalize yet";
  else if (!m.appeal && deadline !== null && nowMs <= deadline)
    finalizeReason = "the appeal window is still open; settlement never front-runs the right to dispute";
  else if (!connected) finalizeReason = "connect a wallet to finalize";
  acts.push({ id: "finalize", label: "Finalize and settle", available: !finalizeReason,
              ...(finalizeReason ? { reason: finalizeReason } : {}) });

  // The escape hatch.
  let voidReason: string | undefined;
  if (m.state === "FINAL" || m.state === "VOID") voidReason = "the market is settled";
  else if (m.state === "RESOLVED") voidReason = "a verdict stands; finalize it instead";
  else if (nowMs < voidDeadline(m, config))
    voidReason = "opens if the market is still unresolved long after its sources should have covered it";
  else if (!connected) voidReason = "connect a wallet to void the market and free every stake";
  acts.push({ id: "void_timeout", label: "Void on timeout", available: !voidReason,
              ...(voidReason ? { reason: voidReason } : {}) });

  return acts;
}

/** Ticket eligibility for the parlay builder, with the reason in words. */
export function legEligible(m: MarketView, nowMs: number): { ok: boolean; reason?: string } {
  if (m.state !== "OPEN" || nowMs >= windowStart(m))
    return { ok: false, reason: "positions closed" };
  return { ok: true };
}

/** Settlement availability for a ticket. */
export function ticketSettleable(t: TicketView, markets: Map<string, MarketView>): { ok: boolean; reason?: string } {
  if (t.state !== "LIVE") return { ok: false, reason: `the ticket is already ${t.state.toLowerCase()}` };
  for (const leg of t.legs) {
    const m = markets.get(leg.market_id);
    if (!m) return { ok: false, reason: "a leg's market could not be read" };
    if (m.state !== "FINAL" && m.state !== "VOID")
      return { ok: false, reason: `${leg.market_id} is not final yet` };
  }
  return { ok: true };
}

export { sameAddress };
