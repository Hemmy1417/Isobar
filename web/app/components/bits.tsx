"use client";

import { phaseChip, phaseLabel, sentence } from "../../lib/present";
import { ReadError } from "../../lib/read";

export function PhaseChip({ phase }: { phase: string }) {
  return <span className={`chip ${phaseChip(phase)}`}>{phaseLabel(phase)}</span>;
}

export function Loading({ what = "the record" }: { what?: string }) {
  return <p className="muted small" style={{ paddingBlock: 30 }}>Reading {what} from the chain…</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card-dashed" style={{ textAlign: "center", paddingBlock: 34 }}>
    <p className="muted">{children}</p>
  </div>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const text = error instanceof ReadError || error instanceof Error ? error.message : String(error);
  return <div className="notice notice-bad" style={{ marginTop: 10 }}>{sentence(text)}</div>;
}

export function ActBlocked({ label, reason }: { label: string; reason?: string }) {
  return (
    <p className="act-blocked">
      <b>{label}</b>
      <span>{sentence(reason)}</span>
    </p>
  );
}

export const DEMO_PRICING_NOTE =
  "Multipliers are flat demo pricing, not market odds — every surface says so, because pretending otherwise would be the real gamble.";
