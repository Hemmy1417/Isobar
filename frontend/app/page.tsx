"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatGen } from "../lib/config";
import { getStats } from "../lib/read";
import type { StatsView } from "../lib/types";

function IsobarField() {
  // Ambient pressure lines behind the hero — drawn, not fetched.
  return (
    <svg className="hero-iso" viewBox="0 0 1100 420" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i}
              d={`M -40 ${70 + i * 52} q 200 ${-46 + i * 8} 420 ${-8 + i * 4} q 260 ${34 - i * 6} 480 ${-22 + i * 5} q 140 ${-18} 280 ${6}`}
              fill="none" stroke="var(--data)" strokeOpacity={0.10 - i * 0.011} strokeWidth="1.1" />
      ))}
      <circle cx="820" cy="120" r="60" fill="none" stroke="var(--accent)" strokeOpacity="0.15" />
      <circle cx="820" cy="120" r="86" fill="none" stroke="var(--accent)" strokeOpacity="0.09" />
      <circle cx="820" cy="120" r="114" fill="none" stroke="var(--accent)" strokeOpacity="0.05" />
    </svg>
  );
}

export default function Landing() {
  const [stats, setStats] = useState<StatsView | null>(null);
  useEffect(() => { getStats().then(setStats).catch(() => {}); }, []);

  return (
    <div>
      <section className="hero">
        <IsobarField />
        <p className="eyebrow">Weather risk, adjudicated on GenLayer</p>
        <h1 style={{ marginTop: 12 }}>The weather will settle this.</h1>
        <p className="lede">
          Isobar is a market for falsifiable weather questions at the world&apos;s shipping
          choke points — canals, straits, ports. Stake GEN on whether a daily threshold is
          crossed. Once the data is published — about 2 days after the date at US ports, 5
          elsewhere — any wallet can trigger the verdict: every validator fetches two
          independent public data sources itself, agrees on the evidence line by line, and
          contract code turns the agreed readings into the verdict. Disagree? One appeal
          re-reads the recorded evidence before anything pays out.
        </p>
        <div className="row" style={{ marginTop: 26, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/markets">See the markets</Link>
          <Link className="btn btn-ghost" href="/map">Open the map</Link>
        </div>
        <p className="fine" style={{ marginTop: 14, maxWidth: 620 }}>
          Try it: connect a wallet, grab 10 test GEN on any market page, and take a
          position — it&apos;s all test money on GenLayer Studio Next.
        </p>
        {stats ? (
          <div className="row" style={{ marginTop: 34, gap: 34, flexWrap: "wrap" }}>
            <div className="stat"><b>{stats.markets}</b><span>markets on the record</span></div>
            <div className="stat"><b>{stats.tickets}</b><span>parlay tickets</span></div>
            <div className="stat"><b>{formatGen(BigInt(stats.reserve_wei))}</b><span>GEN in the parlay reserve</span></div>
          </div>
        ) : null}
      </section>

      <section className="grid-3" style={{ marginTop: 10 }}>
        <div className="card">
          <p className="eyebrow">Evidence</p>
          <h3 style={{ marginTop: 8 }}>Nobody supplies a source</h3>
          <p className="small muted" style={{ marginTop: 8 }}>
            A market is a catalog location, a metric, a threshold and a UTC date. The contract
            builds both source URLs in code — Open-Meteo (Copernicus ERA5) and NASA POWER
            worldwide; at four US ports, the National Weather Service station plus Open-Meteo
            for wind and temperature. Two different organizations, two different data lineages.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Consensus</p>
          <h3 style={{ marginTop: 8 }}>Validators fetch, code decides</h3>
          <p className="small muted" style={{ marginTop: 8 }}>
            Every validator fetches the sources itself and must agree on the recorded readings.
            The AI panel judges only data quality — with quotes that must appear in the fetched
            payload. The payout math never touches a model&apos;s opinion. If the sources
            disagree, nobody settles: the market voids and every stake is refunded.
          </p>
        </div>
        <div className="card">
          <p className="eyebrow">Dispute</p>
          <h3 style={{ marginTop: 8 }}>One appeal, on the record</h3>
          <p className="small muted" style={{ marginTop: 8 }}>
            A wallet with money at stake can force one fresh panel that re-reads the exact
            evidence the first round recorded. It can uphold the verdict or void the market,
            never invent one. Payouts wait for the 60-minute appeal window to close.
          </p>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="spread" style={{ flexWrap: "wrap", gap: 12 }}>
          <div style={{ maxWidth: 620 }}>
            <p className="eyebrow">Parlay</p>
            <h3 style={{ marginTop: 8 }}>Chain the world&apos;s weather</h3>
            <p className="small muted" style={{ marginTop: 8 }}>
              Combine two to four open markets into one ticket — Panama wind, a Hamburg gale.
              Every leg must hit; a voided leg drops out rather than killing the ticket.
              Multipliers are flat demo pricing — 1.8× per leg, capped at 12× — labeled as such
              on every surface, and every ticket&apos;s full payout is reserved from a visible
              on-chain reserve the moment it is bought.
            </p>
          </div>
          <Link className="btn btn-ghost" href="/parlay">Build a ticket</Link>
        </div>
      </section>

      <p className="fine" style={{ marginTop: 22 }}>
        Test GEN only, on GenLayer Studio Next. The full mechanism — sources, floors, appeal
        rules, what is demo-priced — is written out on <Link href="/how">how it works</Link>.
      </p>
    </div>
  );
}
