/**
 * The typed read layer. Every contract view returns canonical JSON;
 * callers get parsed objects, null for absent records, or a ReadError a
 * person can act on.
 *
 * Reads go straight from this browser to Studio Next, PACED: gen_call
 * shares a 30-per-minute bucket per IP (measured on a sibling build,
 * 14 Sep), and the wallet's fee estimates spend from the same bucket. A
 * queue holds each read until the pace allows it, retries transient
 * failures, and caches what cannot change.
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

/* ── pacing: at most one read every 2.2s, bursts absorbed by the queue ── */

const GAP_MS = 2_200;
let lastAt = 0;
let chainTail: Promise<unknown> = Promise.resolve();

function paced<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return work();
  };
  const next = chainTail.then(run, run);
  chainTail = next.catch(() => undefined);
  return next;
}

async function view<T>(functionName: string, args: unknown[], { tries = 3 } = {}): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await paced(() =>
        readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args }),
      );
      return JSON.parse(String(raw)) as T;
    } catch (e) {
      lastErr = e;
      const text = String((e as Error)?.message ?? e);
      if (text.includes("[EXPECTED]")) {
        throw new ReadError(text.split("[EXPECTED]")[1]?.trim() ?? text, false);
      }
      if (!isTransient(e) || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, 2_500 * (i + 1)));
    }
  }
  throw new ReadError(
    isTransient(lastErr)
      ? "Studio Next is not answering right now; it usually recovers in a moment."
      : `The chain read failed: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 160)}`,
    isTransient(lastErr),
  );
}

/* ── caches ── */

let configCache: ConfigView | null = null;
const marketCache = new Map<string, { at: number; value: MarketView }>();
const MARKET_TTL = 15_000;

export function invalidateReads(): void {
  marketCache.clear();
}

/* ── typed getters ── */

/** The contract's own rules and catalog; immutable per deployment. */
export async function getConfig(): Promise<ConfigView> {
  configCache ??= await view<ConfigView>("get_config", []);
  return configCache;
}

export async function getMarket(id: string, fresh = false): Promise<MarketView | null> {
  const hit = marketCache.get(id);
  if (!fresh && hit && Date.now() - hit.at < MARKET_TTL) return hit.value;
  try {
    const value = await view<MarketView>("get_market", [id]);
    marketCache.set(id, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (e instanceof ReadError && !e.transient && /unknown market/i.test(e.message)) return null;
    throw e;
  }
}

export async function listMarketIds(offset = 0, limit = 50): Promise<string[]> {
  return view<string[]>("list_markets", [offset, limit]);
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
