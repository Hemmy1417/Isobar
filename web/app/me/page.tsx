"use client";

/** My positions: every market this wallet touched, every ticket, and the
 *  claimable balance — with the claim itself, the only way value leaves. */
import Link from "next/link";
import { useEffect, useState } from "react";

import { CONTRACT_ADDRESS, formatGen } from "../../lib/config";
import { useTransactionKit } from "../../lib/kit";
import { formatDocDate, marketNumber, marketQuestion, multiplierText, ticketNumber, ticketStateLabel } from "../../lib/present";
import { getBalance, getConfig, getMarket, getPosition, getTicket, invalidateReads, myMarketIds, myTicketIds } from "../../lib/read";
import { useWallet } from "../../lib/wallet";
import type { BalanceView, ConfigView, MarketView, PositionView, TicketView } from "../../lib/types";
import { Empty, ErrorNotice, Loading, PhaseChip } from "../components/bits";
import { TxPanel } from "../components/TxPanel";
import { WalletChoices } from "../components/WalletButton";

interface Row { market: MarketView; position: PositionView }

export default function MePage() {
  const { address, wallets, connect, error: walletError } = useWallet();
  const kit = useTransactionKit();
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    if (!address) return;
    (async () => {
      try {
        setError(null);
        const [cfg, bal, mids, tids] = await Promise.all([
          getConfig(), getBalance(address), myMarketIds(address), myTicketIds(address),
        ]);
        if (!alive) return;
        setConfig(cfg);
        setBalance(bal);
        const [found, ts] = await Promise.all([
          Promise.all(mids.slice().reverse().map(async (id): Promise<Row | null> => {
            const [m, position] = await Promise.all([getMarket(id, tick > 0), getPosition(id, address)]);
            return m ? { market: m, position } : null;
          })),
          Promise.all(tids.slice().reverse().map((id) => getTicket(id))),
        ]);
        if (!alive) return;
        setRows(found.filter((r): r is Row => !!r));
        setTickets(ts.filter((t): t is TicketView => !!t));
      } catch (e) {
        // A failed read is never shown as "no positions".
        if (alive) setError(e);
      }
    })();
    return () => { alive = false; };
  }, [address, tick]);

  if (!address) {
    return (
      <div style={{ maxWidth: 460, margin: "40px auto" }}>
        <div className="card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Your positions live in your wallet</h2>
          <p className="fine" style={{ marginBottom: 12 }}>
            There is no account here. Connect and this page assembles your record from the chain.
          </p>
          <WalletChoices wallets={wallets} error={walletError} connect={connect} />
        </div>
      </div>
    );
  }

  const claimable = balance ? BigInt(balance.claimable) : 0n;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1 style={{ fontSize: 30 }}>My positions</h1>
      <ErrorNotice error={error} />

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="spread">
          <div>
            <p className="eyebrow">Claimable</p>
            <p className="reading" style={{ fontSize: 24, marginTop: 4 }}>
              {balance ? `${formatGen(claimable)} GEN` : error ? "unavailable" : "…"}
            </p>
          </div>
          {claimable > 0n && kit ? (
            claiming ? null : (
              <button className="btn btn-primary" onClick={() => setClaiming(true)}>Claim to wallet</button>
            )
          ) : (
            <p className="fine" style={{ maxWidth: 200 }}>
              Winnings and refunds land here first; claiming moves them to your wallet.
            </p>
          )}
        </div>
        {claiming && kit ? (
          <div style={{ marginTop: 10 }}>
            <TxPanel kit={kit} tx={{ kind: "write", address: CONTRACT_ADDRESS, method: "claim", args: [] }}
                     onDone={() => { invalidateReads(); setClaiming(false); setTick((t) => t + 1); }}
                     confirmText={`Claim ${formatGen(claimable)} GEN`} />
          </div>
        ) : null}
        {balance && Number(balance.claimed) > 0 ? (
          <p className="fine" style={{ marginTop: 8 }}>Already claimed over this wallet&apos;s lifetime: {formatGen(BigInt(balance.claimed))} GEN.</p>
        ) : null}
      </div>

      <div>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Markets</h2>
        {rows === null ? (error ? null : <Loading what="your markets" />) : rows.length === 0 ? (
          <Empty>No positions yet. <Link href="/markets">The docket</Link> has open questions.</Empty>
        ) : (
          <div className="grid-2">
            {rows.map(({ market: m, position }) => {
              const loc = config?.locations[m.location_id];
              return (
                <Link key={m.market_id} href={`/markets/${m.market_id}`} className="card" style={{ color: "inherit", textDecoration: "none" }}>
                  <div className="spread">
                    <p className="fine">{marketNumber(m.market_id)} · {formatDocDate(m.window_date)}</p>
                    <PhaseChip phase={m.phase} />
                  </div>
                  <p className="small" style={{ fontWeight: 600, marginTop: 6 }}>
                    {loc ? marketQuestion(m, loc.name) : m.market_id}
                  </p>
                  <p className="fine" style={{ marginTop: 8 }}>
                    {Number(position.yes) > 0 ? `${formatGen(BigInt(position.yes))} GEN on Yes` : ""}
                    {Number(position.yes) > 0 && Number(position.no) > 0 ? " · " : ""}
                    {Number(position.no) > 0 ? `${formatGen(BigInt(position.no))} GEN on No` : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Tickets</h2>
        {tickets === null ? (error ? null : <Loading what="your tickets" />) : tickets.length === 0 ? (
          <Empty>No parlay tickets. <Link href="/parlay">The builder</Link> chains open markets into one.</Empty>
        ) : (
          <div className="grid-2">
            {tickets.map((t) => (
              <div key={t.ticket_id} className="card">
                <div className="spread">
                  <b className="small">{ticketNumber(t.ticket_id)}</b>
                  <span className={`chip plain ${t.state === "WON" ? "final" : t.state === "LOST" ? "void" : t.state === "LIVE" ? "open" : "observing"}`}>
                    {ticketStateLabel(t.state)}
                  </span>
                </div>
                <p className="fine" style={{ marginTop: 6 }}>
                  {formatGen(BigInt(t.stake_wei))} GEN at {multiplierText(t.multiplier_x100)} — demo pricing.
                  Manage it from <Link href="/parlay">the parlay page</Link>.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
