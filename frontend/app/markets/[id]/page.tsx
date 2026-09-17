"use client";

import { use, useEffect, useState } from "react";

import { addressUrl } from "../../../lib/chain";
import { CONTRACT_ADDRESS, formatGen } from "../../../lib/config";
import {
  formatDocDate, laneText, marketNumber, marketQuestion, metricLabel,
  readingText, sourceName, verdictLabel,
} from "../../../lib/present";
import { Empty, ErrorNotice, Loading, PhaseChip } from "../../components/bits";
import { ActionsCard } from "./ActionsCard";
import { EvidencePanel } from "./EvidencePanel";
import { LifecycleRail } from "./LifecycleRail";
import { useMarket } from "./useMarket";

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { market: m, config, rounds, position, tickets, notFound, error, reload } = useMarket(id);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (notFound) return <Empty>No market carries that id on this deployment.</Empty>;
  if (error && !m) return <ErrorNotice error={error} />;
  if (!m || !config) return <Loading what="the market" />;

  const loc = config.locations[m.location_id];
  const yes = BigInt(m.yes_pool_wei);
  const no = BigInt(m.no_pool_wei);
  const total = yes + no;
  const yesShare = total > 0n ? Number((yes * 1000n) / total) / 10 : 50;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, maxWidth: 720 }}>
          <p className="eyebrow">{marketNumber(m.market_id)} · {loc?.name ?? m.location_id}</p>
          <h1 style={{ fontSize: "clamp(24px, 3.4vw, 34px)", marginTop: 6 }}>
            {marketQuestion(m, loc?.name ?? m.location_id)}
          </h1>
          <p className="fine" style={{ marginTop: 8 }}>
            {laneText(m.lane)}. Sources: {m.sources.map((s) => sourceName(s.source)).join(" and ")} —
            both fetched by every validator, URLs built by the contract from the catalog.
          </p>
        </div>
        <PhaseChip phase={m.phase} />
      </div>

      {m.verdict ? (
        <div className={`notice ${m.verdict === "YES" ? "notice-ok" : m.verdict === "NO" ? "notice-bad" : "notice-warn"}`}>
          <b>{verdictLabel(m.verdict)}</b>
          {rounds.length ? (() => {
            const last = rounds[rounds.length - 1];
            const readings = Object.entries(last.outcome.readings ?? {})
              .filter(([, r]) => r.covered)
              .sort(([a], [b]) => m.sources.findIndex((x) => x.source === a) - m.sources.findIndex((x) => x.source === b))
              .map(([s, r]) => `${sourceName(s)} read ${readingText(r.value_x100, m.unit)}`);
            return readings.length ? <> — {readings.join("; ")} on {formatDocDate(m.window_date)}.</> : null;
          })() : null}
        </div>
      ) : null}

      <div className="dossier">
        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>The pools</h3>
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", background: "var(--ground-2)" }}>
              <span style={{ width: `${yesShare}%`, background: "var(--good)" }} />
              <span style={{ flex: 1, background: total > 0n ? "var(--bad)" : "var(--line)" }} />
            </div>
            <div className="spread small" style={{ marginTop: 8 }}>
              <span className="side-yes">Yes · {formatGen(yes)} GEN</span>
              <span className="side-no">No · {formatGen(no)} GEN</span>
            </div>
            {position && Number(position.yes) + Number(position.no) > 0 ? (
              <p className="fine" style={{ marginTop: 8 }}>
                Your position: {Number(position.yes) > 0 ? `${formatGen(BigInt(position.yes))} GEN on Yes` : ""}
                {Number(position.yes) > 0 && Number(position.no) > 0 ? " · " : ""}
                {Number(position.no) > 0 ? `${formatGen(BigInt(position.no))} GEN on No` : ""}
              </p>
            ) : null}
            <p className="fine" style={{ marginTop: 8 }}>
              Parimutuel: winners split the losing pool in proportion to their stake. No odds,
              no maker — the pool is the price.
            </p>
          </div>
          <LifecycleRail market={m} config={config} nowMs={nowMs} />
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>The exact question</h3>
            <dl className="stack small" style={{ gap: 5, margin: 0 }}>
              <div className="spread"><dt className="muted">Metric</dt><dd style={{ margin: 0 }}>{metricLabel(m.metric)}</dd></div>
              <div className="spread"><dt className="muted">Threshold</dt>
                <dd className="reading" style={{ margin: 0 }}>{m.comparison === "GTE" ? "≥" : "<"} {readingText(m.threshold_x100, m.unit)}</dd></div>
              <div className="spread"><dt className="muted">Date (UTC)</dt><dd style={{ margin: 0 }}>{formatDocDate(m.window_date)}</dd></div>
              <div className="spread"><dt className="muted">Coordinates</dt>
                <dd className="mono" style={{ margin: 0 }}>{loc ? `${loc.lat}, ${loc.lon}` : m.location_id}</dd></div>
              <div className="spread"><dt className="muted">Record</dt>
                <dd style={{ margin: 0 }}><a className="mono" href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">{m.market_id}</a></dd></div>
            </dl>
          </div>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <ActionsCard market={m} config={config} position={position} tickets={tickets} nowMs={nowMs} onChange={reload} />
          <EvidencePanel market={m} rounds={rounds} />
        </div>
      </div>
    </div>
  );
}
