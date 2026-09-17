"use client";

import { phaseChip, phaseLabel, sentence } from "../../lib/present";
import { useEffect, useState } from "react";

import { ReadError, readWaitMs } from "../../lib/read";

/** Seconds this page still waits for the shared read budget, when it matters. */
function useBudgetWait(): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS(Math.ceil(readWaitMs() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

function BudgetNote() {
  const s = useBudgetWait();
  if (s < 3) return null;
  return (
    <span className="fine" style={{ display: "block", marginTop: 4 }}>
      Studio Next allows 30 reads a minute per visitor, so the next one starts in {s} seconds.
    </span>
  );
}

export function PhaseChip({ phase }: { phase: string }) {
  return <span className={`chip ${phaseChip(phase)}`}>{phaseLabel(phase)}</span>;
}

export function Loading({ what = "the record" }: { what?: string }) {
  return <div className="muted small" style={{ paddingBlock: 30 }}>Reading {what} from the chain…<BudgetNote /></div>;
}

export function ReadProgress({ answered, total, noun = "markets" }: { answered: number; total: number; noun?: string }) {
  if (total === 0 || answered >= total) return null;
  return <div className="fine" role="status">Read {answered} of {total} {noun} from the chain…<BudgetNote /></div>;
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
  "Multipliers are flat demo pricing, not market odds. Every surface says so, because pretending otherwise would be the real gamble.";
