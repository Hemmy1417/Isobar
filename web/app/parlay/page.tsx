"use client";

/**
 * The parlay builder: pick 2-4 open markets, a side per leg, one stake.
 * Demo pricing is stated wherever a multiplier appears; the reserve check
 * mirrors the contract's, so a ticket the reserve cannot back is never
 * offered as a button that fails.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SubmitInput } from "@genlayer/transaction-kit-react";

import { legEligible, ticketSettleable } from "../../lib/acts";
import { CONTRACT_ADDRESS, formatGen, parseGen } from "../../lib/config";
import { useTransactionKit } from "../../lib/kit";
import {
  formatDocDate, marketNumber, marketQuestion, multiplierText, plural,
  ticketNumber, ticketStateLabel, verdictShort,
} from "../../lib/present";
import { getConfig, getMarket, getTicket, invalidateReads, listMarketIds, myTicketIds } from "../../lib/read";
import { useWallet } from "../../lib/wallet";
import type { ConfigView, MarketView, TicketView } from "../../lib/types";
import { DEMO_PRICING_NOTE, Empty, ErrorNotice, Loading } from "../components/bits";
import { TxPanel } from "../components/TxPanel";

type Picked = Record<string, "YES" | "NO">;

export default function ParlayPage() {
  const { address, chainOk } = useWallet();
  const kit = useTransactionKit();
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<Picked>({});
  const [stake, setStake] = useState("0.1");
  const [reviewing, setReviewing] = useState(false);
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const nowMs = Date.now();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = await getConfig();
        if (!alive) return;
        setConfig(cfg);
        const ids = await listMarketIds(0, 50);
        const out: MarketView[] = [];
        for (const id of ids.slice().reverse()) {
          const m = await getMarket(id, tick > 0);
          if (m) out.push(m);
          if (alive) setMarkets([...out]);
        }
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    let alive = true;
    if (!address) { setTickets(null); return; }
    (async () => {
      try {
        const ids = await myTicketIds(address);
        const out: TicketView[] = [];
        for (const id of ids.slice().reverse()) {
          const t = await getTicket(id);
          if (t) out.push(t);
        }
        if (alive) setTickets(out);
      } catch {
        if (alive) setTickets([]);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  const open = markets.filter((m) => legEligible(m, nowMs).ok);
  const legs = Object.entries(picked);
  const stakeWei = parseGen(stake);

  const mult = useMemo(() => {
    if (!config) return 100;
    let x = 100;
    for (let i = 0; i < legs.length; i++) x = Math.floor((x * config.leg_multiplier_x100) / 100);
    return Math.min(x, config.multiplier_cap_x100);
  }, [legs.length, config]);

  const payoutWei = stakeWei !== null ? (stakeWei * BigInt(mult)) / 100n : null;
  const reserveShort = config && payoutWei !== null && stakeWei !== null
    ? BigInt(config.reserved_exposure_wei) + payoutWei > BigInt(config.reserve_wei) + stakeWei
    : false;

  const legsOk = config ? legs.length >= config.min_legs && legs.length <= config.max_legs : false;
  const stakeOk = config && stakeWei !== null
    && stakeWei >= BigInt(config.min_ticket_stake_wei) && stakeWei <= BigInt(config.max_ticket_stake_wei);

  const tx: SubmitInput = {
    kind: "write",
    address: CONTRACT_ADDRESS,
    method: "buy_ticket",
    args: [JSON.stringify(legs.map(([market_id, side]) => ({ market_id, side })))],
  };

  const marketById = new Map(markets.map((m) => [m.market_id, m]));

  if (!config) return error ? <ErrorNotice error={error} /> : <Loading what="the parlay board" />;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 30 }}>Parlay</h1>
        <p className="muted small" style={{ marginTop: 4, maxWidth: 640 }}>
          One ticket over {config.min_legs}–{config.max_legs} open markets. Every leg must land
          your way; a voided leg drops out of the multiplier instead of killing the ticket.
        </p>
      </div>

      <div className="dossier rev">
        <div className="stack" style={{ gap: 10 }}>
          <h3>Open legs</h3>
          {!loaded && open.length === 0 ? <Loading what="open markets" /> : null}
          {loaded && open.length === 0 ? (
            <Empty>No market is open for positions right now. <Link href="/markets/new">Open one</Link> — it becomes a leg the moment it exists.</Empty>
          ) : null}
          {open.map((m) => {
            const side = picked[m.market_id];
            const loc = config.locations[m.location_id];
            return (
              <div key={m.market_id} className={`card ${side ? "" : "card-dashed"}`} style={{ padding: "14px 16px" }}>
                <div className="spread" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="fine">{marketNumber(m.market_id)} · closes {formatDocDate(m.window_date)} 00:00 UTC</p>
                    <p className="small" style={{ fontWeight: 600, marginTop: 2 }}>
                      {marketQuestion(m, loc?.name ?? m.location_id)}
                    </p>
                  </div>
                  <div className="row" style={{ flex: "0 0 auto" }}>
                    {(["YES", "NO"] as const).map((s) => (
                      <button key={s}
                              className={`btn btn-side ${side === s ? (s === "YES" ? "picked-yes" : "picked-no") : ""}`}
                              style={{ paddingBlock: 6, minWidth: 62 }}
                              onClick={() => setPicked((p) => {
                                const next = { ...p };
                                if (next[m.market_id] === s) delete next[m.market_id];
                                else next[m.market_id] = s;
                                return next;
                              })}>
                        {s === "YES" ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Your ticket</h3>
            {legs.length === 0 ? (
              <p className="fine">Pick a side on {config.min_legs} to {config.max_legs} open markets.</p>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {legs.map(([id, side]) => {
                  const m = marketById.get(id);
                  const loc = m ? config.locations[m.location_id] : null;
                  return (
                    <div key={id} className="spread small">
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {loc?.name ?? id}
                      </span>
                      <b className={side === "YES" ? "side-yes" : "side-no"}>{side === "YES" ? "Yes" : "No"}</b>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="divider" />
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="ticket-stake">Stake in GEN</label>
              <input id="ticket-stake" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
              <span className="hint">
                {formatGen(BigInt(config.min_ticket_stake_wei))}–{formatGen(BigInt(config.max_ticket_stake_wei))} GEN per ticket.
              </span>
            </div>
            <div className="spread small">
              <span className="muted">Multiplier ({plural(legs.length, "leg")})</span>
              <span className="reading">{multiplierText(mult)}</span>
            </div>
            <div className="spread small" style={{ marginTop: 4 }}>
              <span className="muted">Pays if every leg hits</span>
              <span className="reading">{payoutWei !== null ? `${formatGen(payoutWei)} GEN` : "—"}</span>
            </div>
            <p className="fine" style={{ marginTop: 8 }}>{DEMO_PRICING_NOTE}</p>
            {reserveShort ? (
              <p className="notice notice-warn" style={{ marginTop: 8 }}>
                The on-chain reserve cannot back this payout right now — a smaller stake fits.
              </p>
            ) : null}
            <div style={{ marginTop: 10 }}>
              {!address ? (
                <p className="fine">Connect a wallet from the header to buy the ticket.</p>
              ) : reviewing && kit && stakeWei ? (
                <TxPanel kit={kit} tx={tx} value={stakeWei}
                         onDone={(ok) => { if (ok) { invalidateReads(); setPicked({}); setTick((t) => t + 1); } setReviewing(false); }}
                         confirmText={`Buy the ticket — ${stake} GEN at ${multiplierText(mult)}`} />
              ) : (
                <button className="btn btn-primary" style={{ width: "100%" }}
                        disabled={!legsOk || !stakeOk || reserveShort || !chainOk || !kit}
                        onClick={() => setReviewing(true)}>
                  Review the ticket
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Your tickets</h3>
            {!address ? <p className="fine">Connect a wallet to see them.</p>
              : tickets === null ? <p className="fine">Reading…</p>
              : tickets.length === 0 ? <p className="fine">None yet.</p>
              : (
                <div className="stack" style={{ gap: 10 }}>
                  {tickets.map((t) => {
                    const can = ticketSettleable(t, marketById);
                    return (
                      <div key={t.ticket_id} className="panel">
                        <div className="spread">
                          <b className="small">{ticketNumber(t.ticket_id)}</b>
                          <span className={`chip plain ${t.state === "WON" ? "final" : t.state === "LOST" ? "void" : t.state === "LIVE" ? "open" : "observing"}`}>
                            {ticketStateLabel(t.state)}
                          </span>
                        </div>
                        <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                          {t.legs.map((l) => (
                            <div key={l.market_id} className="spread fine">
                              <Link href={`/markets/${l.market_id}`}>{marketNumber(l.market_id)}</Link>
                              <span>
                                <b className={l.side === "YES" ? "side-yes" : "side-no"}>{l.side === "YES" ? "Yes" : "No"}</b>
                                {l.outcome ? ` · landed ${verdictShort(l.outcome) || l.outcome.toLowerCase()}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="spread fine" style={{ marginTop: 6 }}>
                          <span>{formatGen(BigInt(t.stake_wei))} GEN at {multiplierText(t.multiplier_x100)} (demo pricing)</span>
                        </div>
                        {t.state === "LIVE" ? (
                          can.ok && kit ? (
                            settling === t.ticket_id ? (
                              <div style={{ marginTop: 8 }}>
                                <TxPanel kit={kit}
                                         tx={{ kind: "write", address: CONTRACT_ADDRESS, method: "settle_ticket", args: [t.ticket_id] }}
                                         onDone={() => { invalidateReads(); setSettling(null); setTick((x) => x + 1); }}
                                         confirmText="Settle the ticket" />
                              </div>
                            ) : (
                              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setSettling(t.ticket_id)}>
                                Settle the ticket
                              </button>
                            )
                          ) : (
                            <p className="fine" style={{ marginTop: 6 }}>Waiting: {can.reason}.</p>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
