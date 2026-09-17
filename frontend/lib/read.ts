/**
 * The typed read layer. Every contract view returns canonical JSON;
 * callers get parsed objects, null for absent records, or a ReadError a
 * person can act on.
 *
 * Reads go straight from this browser to Studio Next, BUDGETED: gen_call
 * allows 30 calls per rolling minute per IP (measured 17 Sep: a burst of
 * 40 got 10 through, then "Rate limit exceeded: 30 requests per minute"),
 * and the wallet's fee estimates spend from the same bucket. Reads run
 * concurrently up to a rolling budget with headroom left for the wallet,
 * retry transient failures, and cache what cannot change.
 */
import { createClient } from "genlayer-js";

import { isTransient, STUDIO_NEXT } from "./chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED } from "./config";
import type {
  BalanceView, ConfigView, MarketView, PositionView, RoundView, StatsView, TicketView,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export class ReadError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = "ReadError";
    this.transient = transient;
  }
}

let client: Client | null = null;
function readClient(): Client {
  if (!CONTRACT_CONFIGURED) {
    throw new ReadError("No deployment is configured for this build.", false);
  }
  // No account: reads are unsigned — requiring a wallet to LOOK at a
  // public record would be a fake gate.
  client ??= createClient({ chain: STUDIO_NEXT });
  return client;
}

/* ── budget: at most READ_BUDGET call starts in any rolling minute ── */

export const READ_WINDOW_MS = 60_000;
export const READ_BUDGET = 22;
const MIN_GAP_MS = 120;

/**
 * When may the next call start, given the (ascending) start times already
 * planned? Pure, so the budget is testable to the millisecond. Mutates
 * `starts`: drops starts that left the window, appends the planned one.
 */
export function planStart(starts: number[], now: number): number {
  while (starts.length && starts[0] <= now - READ_WINDOW_MS) starts.shift();
  let at = Math.max(now, (starts[starts.length - 1] ?? -Infinity) + MIN_GAP_MS);
  if (starts.length >= READ_BUDGET) {
    at = Math.max(at, starts[starts.length - READ_BUDGET] + READ_WINDOW_MS);
  }
  starts.push(at);
  return at;
}

// The bucket is per IP, so the starts that actually HAPPENED are shared by
// every tab and survive reloads. Plans this document has not begun yet stay
// in memory: a page someone navigated away from must not keep holding
// budget for reads that will never run.
const STARTS_KEY = "isobar.read-starts";
let memoryStarts: number[] = [];
const pending: number[] = [];

function recordedStarts(): number[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STARTS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : memoryStarts;
  } catch {
    return memoryStarts;
  }
}

function recordStart(at: number): void {
  const keep = (t: number) => t > at - READ_WINDOW_MS;
  memoryStarts = [...memoryStarts.filter(keep), at];
  try {
    const next = [...recordedStarts().filter(keep), at].sort((a, b) => a - b);
    window.localStorage.setItem(STARTS_KEY, JSON.stringify(next));
  } catch {
    /* memory only */
  }
}

function paced<T>(work: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const plan = [...new Set([...recordedStarts(), ...memoryStarts, ...pending])].sort((a, b) => a - b);
  const at = planStart(plan, now);
  pending.push(at);
  const begin = () => {
    pending.splice(pending.indexOf(at), 1);
    recordStart(Date.now());
    return work();
  };
  const wait = at - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)).then(begin) : begin();
}

/** How long this page's next queued read still waits for the budget. */
export function readWaitMs(): number {
  return pending.length ? Math.max(0, Math.min(...pending) - Date.now()) : 0;
}

// Studio Next runs gen_calls in a small pool of execution slots shared by
// every visitor (8, measured 17 Sep: "all 8 execution slots occupied").
// One page never holds more than half of them.
export const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight += 1;
  try {
    return await work();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

const isRateLimited = (e: unknown) => /rate limit|429|-32029/i.test(String((e as Error)?.message ?? e));

/**
 * The contract's own sentence from a refused read. genlayer-js surfaces
 * gen_call refusals as viem's generic "Missing or invalid parameters";
 * the contract's text rides base64-encoded (one tag byte first) at
 * `cause.data.receipt.result`, so walk the chain for it.
 */
export function contractRefusal(e: unknown): string | null {
  let x: unknown = e;
  for (let depth = 0; x && depth < 8; depth++) {
    const node = x as { data?: { receipt?: { result?: unknown } }; message?: unknown; cause?: unknown };
    const b64 = node.data?.receipt?.result;
    if (typeof b64 === "string") {
      try {
        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const text = new TextDecoder().decode(bytes).replace(/^[\u0000-\u001f]+/, "").trim();
        if (text) return text;
      } catch {
        /* not base64: keep walking */
      }
    }
    if (typeof node.message === "string" && node.message.includes("[EXPECTED]")) return node.message;
    x = node.cause;
  }
  return null;
}

async function view<T>(functionName: string, args: unknown[], { tries = 3 } = {}): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await withSlot(() => paced(() =>
        readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args }),
      ));
      return JSON.parse(String(raw)) as T;
    } catch (e) {
      lastErr = e;
      const refusal = contractRefusal(e);
      if (refusal) {
        throw new ReadError(refusal.split("[EXPECTED]").pop()?.trim() || refusal, false);
      }
      if (!isTransient(e) || i === tries - 1) break;
      // Another tab or the wallet spent the shared bucket: wait for the window to roll.
      await new Promise((r) => setTimeout(r, (isRateLimited(e) ? 15_000 : 2_500) * (i + 1)));
    }
  }
  throw new ReadError(
    isTransient(lastErr)
      ? "Studio Next is not answering right now; it usually recovers in a moment."
      : "The chain could not answer this read. Reload in a moment; if it persists, the record may not exist.",
    isTransient(lastErr),
  );
}

/* ── caches ── */

// Memory for this page; session storage so a reload inside the TTL spends
// no budget. Keys carry the deployment address.
const TTL = 30_000;
const STASH = `isobar.${CONTRACT_ADDRESS}.`;
const memo = new Map<string, { at: number; value: unknown }>();
let configFlight: Promise<ConfigView> | null = null;

function cached<T>(key: string): T | undefined {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  try {
    const raw = window.sessionStorage.getItem(STASH + key);
    if (raw) {
      const { at, value } = JSON.parse(raw) as { at: number; value: T };
      if (Date.now() - at < TTL) {
        memo.set(key, { at, value });
        return value;
      }
    }
  } catch {
    /* no session storage: memory only */
  }
  return undefined;
}

function remember<T>(key: string, value: T): T {
  const at = Date.now();
  memo.set(key, { at, value });
  try { window.sessionStorage.setItem(STASH + key, JSON.stringify({ at, value })); } catch { /* memory only */ }
  return value;
}

export function invalidateReads(): void {
  memo.clear();
  configFlight = null;
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(STASH)) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* memory only */
  }
}

/* ── typed getters ── */

/** The contract's rules and catalog (immutable) plus the live reserve
 *  figures (not): pass `fresh` wherever the reserve decides a button. */
export async function getConfig(fresh = false): Promise<ConfigView> {
  if (!fresh) {
    const hit = cached<ConfigView>("config");
    if (hit) return hit;
  } else {
    configFlight = null;
  }
  // One in-flight read shared by every caller; a failure is not cached.
  configFlight ??= view<ConfigView>("get_config", [])
    .then((c) => remember("config", c))
    .finally(() => { configFlight = null; });
  return configFlight;
}

export async function getMarket(id: string, fresh = false): Promise<MarketView | null> {
  if (!fresh) {
    const hit = cached<MarketView>(`market.${id}`);
    if (hit) return hit;
  }
  try {
    return remember(`market.${id}`, await view<MarketView>("get_market", [id]));
  } catch (e) {
    if (e instanceof ReadError && !e.transient && /unknown market/i.test(e.message)) return null;
    throw e;
  }
}

export async function listMarketIds(offset = 0, limit = 50, fresh = false): Promise<string[]> {
  if (offset !== 0 || limit !== 50) return view<string[]>("list_markets", [offset, limit]);
  if (!fresh) {
    const hit = cached<string[]>("ids");
    if (hit) return hit;
  }
  return remember("ids", await view<string[]>("list_markets", [offset, limit]));
}

/**
 * Many markets at once, concurrently within the read budget. `onProgress`
 * sees the markets read so far in the ORDER OF `ids` (cards never jump)
 * and how many of the ids have answered.
 */
export async function getMarkets(
  ids: string[],
  { fresh = false, onProgress }: {
    fresh?: boolean;
    onProgress?: (markets: MarketView[], answered: number, total: number) => void;
  } = {},
): Promise<MarketView[]> {
  const slots: (MarketView | null | undefined)[] = ids.map(() => undefined);
  const present = () => slots.filter((m): m is MarketView => !!m);
  let answered = 0;
  await Promise.all(ids.map(async (id, i) => {
    slots[i] = await getMarket(id, fresh);
    answered += 1;
    onProgress?.(present(), answered, ids.length);
  }));
  return present();
}

export async function getStats(): Promise<StatsView> {
  return view<StatsView>("get_stats", []);
}

export async function getRound(id: string, n: number): Promise<RoundView | null> {
  try {
    return await view<RoundView>("get_round", [id, n]);
  } catch (e) {
    if (e instanceof ReadError && !e.transient && /no round/i.test(e.message)) return null;
    throw e;
  }
}

export async function getTicket(id: string): Promise<TicketView | null> {
  try {
    return await view<TicketView>("get_ticket", [id]);
  } catch (e) {
    if (e instanceof ReadError && !e.transient && /unknown ticket/i.test(e.message)) return null;
    throw e;
  }
}

export async function getPosition(id: string, addr: string): Promise<PositionView> {
  return view<PositionView>("get_position", [id, addr]);
}

export async function getStakers(id: string): Promise<string[]> {
  return view<string[]>("get_stakers", [id]);
}

export async function myMarketIds(addr: string): Promise<string[]> {
  return view<string[]>("my_markets", [addr]);
}

export async function myTicketIds(addr: string): Promise<string[]> {
  return view<string[]>("my_tickets", [addr]);
}

export async function getBalance(addr: string): Promise<BalanceView> {
  return view<BalanceView>("get_balance", [addr]);
}

/** Poll a predicate after a write until the state shows it (or tries end). */
export async function pollUntil(
  predicate: () => Promise<boolean>,
  { tries = 30, gapMs = 4_000 } = {},
): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if (await predicate()) return true;
    } catch {
      /* transient reads never abort a poll */
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return false;
}
