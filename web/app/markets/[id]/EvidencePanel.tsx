"use client";

/**
 * What the panel read and what the code derived — the round record,
 * presented for people. The raw record (urls, digests, excerpts) sits
 * behind a labeled verification fold, never on the primary surface.
 */
import { useState } from "react";

import { txUrl } from "../../../lib/chain";
import { formatDateTime, readingText, sentence, sourceName, verdictLabel } from "../../../lib/present";
import type { MarketView, RoundView } from "../../../lib/types";

export function EvidencePanel({ market: m, rounds }: { market: MarketView; rounds: RoundView[] }) {
  const [showRaw, setShowRaw] = useState(false);
  if (rounds.length === 0) {
    return (
      <div className="card">
        <h3>Evidence</h3>
        <p className="muted small" style={{ marginTop: 8 }}>
          No round has run yet. When one does, every validator fetches both sources itself,
          and what they agreed on is recorded here — readings, data-quality findings and the
          quotes that back them.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="spread">
        <h3>Evidence, round by round</h3>
        <button className="btn btn-quiet small" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "Hide the raw record" : "Verification view"}
        </button>
      </div>
      <div className="stack" style={{ gap: 18, marginTop: 12 }}>
        {rounds.map((r) => {
          const snapshot = r.snapshot ?? [];
          return (
            <div key={r.round} className="panel">
              <div className="spread" style={{ flexWrap: "wrap", gap: 8 }}>
                <p className="small" style={{ fontWeight: 600 }}>
                  Round {r.round} · {r.kind === "APPEAL" ? "Appeal — re-read the recorded evidence" : "Resolution"}
                </p>
                <span className="fine">{formatDateTime(r.at)}</span>
              </div>
              {r.kind === "APPEAL" ? (
                <p className="fine" style={{ marginTop: 4 }}>
                  Judged the exact evidence round {r.reviewed_round} recorded — nothing refetched,
                  so the appellant argued against the same bytes the first panel saw.
                  {r.grounds ? <> Grounds: “{r.grounds}”</> : null}
                </p>
              ) : null}
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {(snapshot.length ? snapshot : Object.keys(r.panel.sources).map((s) => null)).map((row, i) => {
                  const name = row?.source ?? Object.keys(r.panel.sources)[i];
                  const finding = r.panel.sources[name];
                  const reading = r.outcome.readings?.[name];
                  return (
                    <div key={name} className="spread" style={{ flexWrap: "wrap", gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="small" style={{ fontWeight: 600 }}>{sourceName(name)}</p>
                        {finding?.anomaly ? <p className="fine">{sentence(finding.anomaly)}</p> : null}
                        {finding?.quote ? (
                          <p className="fine" style={{ fontStyle: "italic" }}>“{finding.quote}”</p>
                        ) : null}
                      </div>
                      <span className="reading">
                        {reading?.covered ? readingText(reading.value_x100, m.unit) : "did not cover the date"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="divider" />
              <p className="small">
                {r.outcome.kind === "VERDICT" ? (
                  <><b>{verdictLabel(r.outcome.verdict)}</b> — derived in code from the agreed readings.</>
                ) : (
                  <><b>No verdict this round.</b> {sentence(r.outcome.reason)} The round is recorded and the market stays resolvable.</>
                )}
              </p>
              {showRaw ? (
                <div className="panel" style={{ marginTop: 10, background: "var(--ground)" }}>
                  <p className="fine" style={{ marginBottom: 6 }}>
                    The consensus-agreed record: each row&apos;s digest covers exactly the stored excerpt.
                  </p>
                  {snapshot.map((row) => (
                    <div key={row.source} style={{ marginBottom: 8 }}>
                      <p className="mono" style={{ overflowWrap: "anywhere" }}>{row.url}</p>
                      <p className="mono faint" style={{ overflowWrap: "anywhere" }}>sha256 {row.digest || "(unfetched)"}</p>
                      <p className="mono faint" style={{ overflowWrap: "anywhere" }}>
                        {row.excerpt ? `${row.excerpt.slice(0, 240)}${row.excerpt.length > 240 ? "…" : ""}` : "(no excerpt)"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="fine" style={{ marginTop: 12 }}>
        Every round is a finalized transaction on GenLayer — the readings above are what a
        majority of validators, each fetching the sources independently, agreed to record.
      </p>
    </div>
  );
}
