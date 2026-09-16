"use client";

import { useCallback, useEffect, useState } from "react";

import { getConfig, getMarket, getPosition, getRound, getTicket, myTicketIds, ReadError } from "../../../lib/read";
import { useWallet } from "../../../lib/wallet";
import type { ConfigView, MarketView, PositionView, RoundView, TicketView } from "../../../lib/types";

export function useMarket(id: string) {
  const { address } = useWallet();
  const [market, setMarket] = useState<MarketView | null>(null);
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [position, setPosition] = useState<PositionView | null>(null);
  const [tickets, setTickets] = useState<TicketView[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError(null);
        const [cfg, m] = await Promise.all([getConfig(), getMarket(id, tick > 0)]);
        if (!alive) return;
        setConfig(cfg);
        if (!m) { setNotFound(true); return; }
        setMarket(m);
        const rs: RoundView[] = [];
        for (let n = 1; n <= m.rounds_count; n++) {
          const r = await getRound(id, n);
          if (r) rs.push(r);
        }
        if (alive) setRounds(rs);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => { alive = false; };
  }, [id, tick]);

  useEffect(() => {
    let alive = true;
    if (!address) { setPosition(null); setTickets([]); return; }
    (async () => {
      try {
        const pos = await getPosition(id, address);
        if (alive) setPosition(pos);
        const tids = await myTicketIds(address);
        const ts: TicketView[] = [];
        for (const tid of tids.slice(-20)) {
          const t = await getTicket(tid);
          if (t && t.legs.some((l) => l.market_id === id)) ts.push(t);
        }
        if (alive) setTickets(ts);
      } catch {
        /* the acts fall back to connect-first reasons */
      }
    })();
    return () => { alive = false; };
  }, [id, address, tick]);

  return { market, config, rounds, position, tickets, notFound, error, reload,
           isReadError: error instanceof ReadError };
}
