"use client";

/**
 * The dispute radar: where this market stands on its road from open
 * positions to settled money, in words, with the clock's next boundary.
 */
import { appealDeadline, resolveAfter } from "../../../lib/acts";
import { formatDateTime, formatDocDate } from "../../../lib/present";
import type { ConfigView, MarketView } from "../../../lib/types";

interface Step {
  key: string;
  title: string;
  detail?: string;
  state: "done" | "now" | "todo";
}

export function LifecycleRail({ market: m, config, nowMs }: {
  market: MarketView; config: ConfigView; nowMs: number;
}) {
  const start = Date.parse(`${m.window_date}T00:00:00Z`);
  const canResolveAt = resolveAfter(m, config);
  const appealEnd = appealDeadline(m, config);
  const settled = m.state === "FINAL" || m.state === "VOID";
  const resolved = m.state === "RESOLVED" || settled;

  const steps: Step[] = [
    {
      key: "open",
      title: "Open for positions",
      detail: `until ${formatDocDate(m.window_date)}, 00:00 UTC`,
      state: nowMs < start ? "now" : "done",
    },
    {
      key: "observe",
      title: "Observation day",
      detail: `${formatDocDate(m.window_date)}, measured in UTC`,
      state: nowMs < start ? "todo" : nowMs < start + 86_400_000 && !resolved ? "now" : "done",
    },
    {
      key: "cover",
      title: "Sources cover the date",
      detail: `both agencies publish by ${formatDateTime(new Date(canResolveAt).toISOString())}`,
      state: resolved ? "done" : nowMs >= canResolveAt ? "done" : nowMs >= start ? "now" : "todo",
    },
    {
      key: "resolve",
      title: "Resolution round",
      detail: resolved
        ? `run ${m.rounds_count}, recorded on chain`
        : m.rounds_count > 0
          ? `${m.rounds_count} round(s) retried — corroboration not yet possible`
          : "any wallet triggers it; every validator fetches both sources",
      state: resolved ? "done" : nowMs >= canResolveAt ? "now" : "todo",
    },
    {
      key: "appeal",
      title: "Appeal window",
      detail: m.appeal
        ? "the one appeal was filed and judged against the recorded evidence"
        : resolved && appealEnd
          ? settled || nowMs > appealEnd
            ? "closed with no appeal"
            : `open until ${formatDateTime(new Date(appealEnd).toISOString())}`
          : `${Math.round(config.appeal_window_seconds / 60)} minutes after resolution`,
      state: settled ? "done" : m.state === "RESOLVED" ? "now" : "todo",
    },
    {
      key: "final",
      title: m.state === "VOID" ? "Void — every stake refunded" : "Final — pools settle",
      detail: settled
        ? `${formatDateTime(m.finalized_at)}${m.void_reason ? ` · ${m.void_reason}` : ""}`
        : "settlement never front-runs the right to dispute",
      state: settled ? "done" : "todo",
    },
  ];

  return (
    <div className="card">
      <h3 style={{ marginBottom: 14 }}>Where this market stands</h3>
      <div className="rail">
        {steps.map((s) => (
          <div key={s.key} className={`rail-step ${s.state === "done" ? "done" : s.state === "now" ? "now" : ""}`}>
            <div className="rail-dot"><i /><b /></div>
            <div className="rail-body">
              <h4>{s.title}</h4>
              {s.detail ? <p className="fine">{s.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
