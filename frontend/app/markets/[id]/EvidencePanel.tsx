"use client";

/**
 * What the panel read and what the code derived — the round record,
 * presented for people. The raw record (urls, digests, excerpts) sits
 * behind a labeled verification fold, never on the primary surface.
 */
import { useState } from "react";

import { txUrl } from "../../../lib/chain";
import { DEPLOYMENT_KIND, PROVING_GROUND_APP_URL } from "../../../lib/config";
import {
  formatDateTime, roundExplanation, sentence, sourceName, sourceStatus, sourceStatusParts,
  sourceStatusShort,
} from "../../../lib/present";
import type { MarketView, RoundView } from "../../../lib/types";
import { ProvingGroundLink } from "../../components/ProvingGround";

export function EvidencePanel({ market: m, rounds }: { market: MarketView; rounds: RoundView[] }) {
  const [showRaw, setShowRaw] = useState(false);
  if (rounds.length === 0) {
    return (
      <div className="card">
        <h3>Evidence</h3>
        <p className="muted small" style={{ marginTop: 8 }}>
          No round has run yet. When one does, every validator fetches both sources itself,
          and what they agreed on is recorded here: readings, data-quality findings and the
          quotes they cite.
        </p>
        {DEPLOYMENT_KIND === "record" ? (
          <p className="fine" style={{ marginTop: 8 }}>
            Finished rounds on real recorded weather are on the{" "}
            <ProvingGroundLink>proving ground</ProvingGroundLink>, including{" "}
            <a href={`${PROVING_GROUND_APP_URL}/markets/mk-000002`} target="_blank" rel="noreferrer">
              a market that voided
            </a>{" "}
            when the two sources disagreed.
          </p>
        ) : null}
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
          // Sources in the market's own order, every round, so rounds compare at a glance.
          const rank = (s: string) => {
            const i = m.sources.findIndex((x) => x.source === s);
            return i < 0 ? 99 : i;
          };
          const snapshot = (r.snapshot ?? []).slice().sort((a, b) => rank(a.source) - rank(b.source));
          const names = (snapshot.length ? snapshot.map((row) => row.source) : Object.keys(r.panel.sources))
            .slice().sort((a, b) => rank(a) - rank(b));
          // An appeal record carries no snapshot of its own: it judged the reviewed round's.
          const rows = snapshot.length
            ? snapshot
            : rounds.find((x) => x.round === r.reviewed_round)?.snapshot ?? [];
          const statuses = names.map((name) => sourceStatus(
            m, r.outcome.readings?.[name], rows.find((row) => row.source === name)));
          const why = roundExplanation(m, r, statuses);
          return (
            <div key={r.round} className="panel">
              <div className="spread" style={{ flexWrap: "wrap", gap: 8 }}>
                <p className="small" style={{ fontWeight: 600 }}>
                  Round {r.round} · {r.kind === "APPEAL" ? "Appeal: re-read the recorded evidence" : "Resolution"}
                </p>
                <span className="fine">{formatDateTime(r.at)}</span>
              </div>
              {r.kind === "APPEAL" ? (
                <p className="fine" style={{ marginTop: 4 }}>
                  Judged the exact evidence round {r.reviewed_round} recorded. Nothing was refetched,
                  so the appellant argued against the same bytes the first panel saw.
                  {r.grounds ? <> Grounds: “{r.grounds}”</> : null}
                </p>
              ) : null}
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {names.map((name, i) => {
                  const finding = r.panel.sources[name];
                  const status = statuses[i];
                  const { lead, says } = sourceStatusParts(m, status);
                  return (
                    <div key={name} className="spread" style={{ flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                        <p className="small" style={{ fontWeight: 600 }}>{sourceName(name)}</p>
                        <p className="fine">
                          {says ? (
                            <>{lead}{" "}<b className={says === "YES" ? "side-yes" : "side-no"}>says {says === "YES" ? "Yes" : "No"}</b>.</>
                          ) : lead}
                        </p>
                        {finding?.anomaly ? <p className="fine">{sentence(finding.anomaly)}</p> : null}
                        {finding?.quote ? (
                          <p className="fine" style={{ fontStyle: "italic" }}>“{finding.quote}”</p>
                        ) : null}
                      </div>
                      <span className="reading">{sourceStatusShort(m, status)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="divider" />
              <p className="small">
                <b>{why.title}.</b> {why.detail}
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
        Every round is a finalized transaction on GenLayer. The readings above are what a
        majority of validators, each fetching the sources independently, agreed to record.
      </p>
    </div>
  );
}
