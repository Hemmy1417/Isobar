/**
 * How the record's vocabulary reads on screen — the ONE place it is
 * decided. The contract speaks in identifiers (VOID_CONFLICT, GTE,
 * mk-000004); people never should. Every value that reaches a screen
 * passes through here, and every lookup falls back to words, so a value
 * added later can never surface as a raw constant.
 */

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.replace(/_/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const lookup = (map: Record<string, string>, v: string | null | undefined) =>
  v ? (map[v] ?? humanize(v)) : "";

export function sentence(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s*[—–]\s*/g, ", ").trim();
  if (!t) return "";
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…)]$/.test(capped) ? capped : `${capped}.`;
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* ── lifecycle ── */

const PHASE: Record<string, string> = {
  OPEN: "Open for positions",
  OBSERVING: "Observing",
  RESOLVING: "Ready to resolve",
  RESOLVED: "Resolved, appeal window open",
  FINAL: "Final",
  VOID: "Void",
};
export const phaseLabel = (p: string) => lookup(PHASE, p);

export const phaseChip = (p: string) =>
  ({ OPEN: "open", OBSERVING: "observing", RESOLVING: "resolving",
     RESOLVED: "resolved", FINAL: "final", VOID: "void" }[p] ?? "open");

const VERDICT: Record<string, string> = {
  YES: "Yes, threshold met",
  NO: "No, threshold not met",
  VOID_CONFLICT: "Void, sources disagreed",
};
export const verdictLabel = (v: string | null) => (v ? lookup(VERDICT, v) : "");
export const verdictShort = (v: string | null) =>
  v === "YES" ? "Yes" : v === "NO" ? "No" : v ? "Void" : "";

const TICKET_STATE: Record<string, string> = {
  LIVE: "Live",
  WON: "Won",
  LOST: "Lost",
  REFUNDED: "Refunded",
};
export const ticketStateLabel = (s: string) => lookup(TICKET_STATE, s);

/* ── the question a market asks ── */

const METRIC: Record<string, string> = {
  WIND_MAX: "Daily maximum wind",
  PRECIP_SUM: "Daily precipitation",
  TEMP_MAX: "Daily maximum temperature",
};
export const metricLabel = (m: string) => lookup(METRIC, m);

export function thresholdText(m: { metric: string; comparison: string; threshold_x100: number; unit: string }): string {
  const value = (m.threshold_x100 / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const cmp = m.comparison === "GTE" ? "reaches" : "stays under";
  return `${metricLabel(m.metric).toLowerCase()} ${cmp} ${value} ${m.unit}`;
}

/** "Will daily maximum wind reach 12 m/s at the Port of Rotterdam on 21 Sep 2026?" */
export function marketQuestion(
  m: { metric: string; comparison: string; threshold_x100: number; unit: string; window_date: string },
  locationName: string,
): string {
  const value = (m.threshold_x100 / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const cmp = m.comparison === "GTE" ? "reach" : "stay under";
  return `Will ${metricLabel(m.metric).toLowerCase()} ${cmp} ${value} ${m.unit} at ${locationName} on ${formatDocDate(m.window_date)}?`;
}

export const readingText = (x100: number | null | undefined, unit: string) =>
  x100 === null || x100 === undefined
    ? "no reading"
    : `${(x100 / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;

const LANE: Record<string, string> = {
  FAST: "Fast lane: station data, resolves about 2 days after the date",
  GLOBAL: "Global lane: reanalysis data, resolves about 5 days after the date",
};
export const laneText = (l: string) => lookup(LANE, l);

/** The evidence hosts, by the names a person knows them by. */
const SOURCE_NAME: Record<string, string> = {
  "open-meteo": "Open-Meteo (ERA5 reanalysis)",
  "nasa-power": "NASA POWER (GEOS-IT)",
  "nws": "US National Weather Service station",
};
export const sourceName = (s: string) => lookup(SOURCE_NAME, s);

/* ── what a round's evidence means ── */

type Question = { comparison: string; threshold_x100: number; unit: string };

/** Where one source stands in a round, from the agreed record. */
export type SourceStatus =
  | { kind: "reading"; x100: number; says: "YES" | "NO" }
  | { kind: "not-accepted"; x100: number }
  | { kind: "no-value" }
  | { kind: "unreachable" };

type Reading = Extract<SourceStatus, { kind: "reading" }>;

export function sourceStatus(
  m: Question,
  reading: { covered: boolean; value_x100: number | null } | undefined,
  row?: { fetched: boolean },
): SourceStatus {
  const x100 = reading?.value_x100;
  if (reading?.covered && typeof x100 === "number") {
    const met = m.comparison === "GTE" ? x100 >= m.threshold_x100 : x100 < m.threshold_x100;
    return { kind: "reading", x100, says: met ? "YES" : "NO" };
  }
  if (typeof x100 === "number") return { kind: "not-accepted", x100 };
  if (row && !row.fetched) return { kind: "unreachable" };
  return { kind: "no-value" };
}

const sideWord = (says: "YES" | "NO") => (says === "YES" ? "Yes" : "No");

/** The sentence under a source's name, split so the side can be coloured. */
export function sourceStatusParts(m: Question, s: SourceStatus): { lead: string; says: "YES" | "NO" | null } {
  switch (s.kind) {
    case "reading": {
      const where = s.x100 >= m.threshold_x100 ? "at or above" : "under";
      return {
        lead: `${readingText(s.x100, m.unit)} is ${where} ${readingText(m.threshold_x100, m.unit)}, so this source`,
        says: s.says,
      };
    }
    case "not-accepted":
      return { lead: `${readingText(s.x100, m.unit)} was read, but the data check did not accept it.`, says: null };
    case "unreachable":
      return { lead: "The source did not answer.", says: null };
    default:
      return { lead: "No usable value for the date.", says: null };
  }
}

/** "5.22 m/s is at or above 5 m/s, so this source says Yes." */
export function sourceStatusText(m: Question, s: SourceStatus): string {
  const { lead, says } = sourceStatusParts(m, s);
  return says ? `${lead} says ${sideWord(says)}.` : lead;
}

/** The short label beside a source's name. */
export function sourceStatusShort(m: Question, s: SourceStatus): string {
  switch (s.kind) {
    case "reading": return readingText(s.x100, m.unit);
    case "not-accepted": return `${readingText(s.x100, m.unit)}, not accepted`;
    case "unreachable": return "no answer";
    default: return "no value";
  }
}

/** Why a round ended the way it did, in words a person can check against the readings. */
export function roundExplanation(
  m: Question,
  r: { kind: string; outcome: { kind: string; verdict: string | null } },
  statuses: SourceStatus[],
): { title: string; detail: string } {
  const readings = statuses.filter((s): s is Reading => s.kind === "reading");
  if (r.kind === "APPEAL") {
    if (r.outcome.kind === "VERDICT") {
      return {
        title: `Upheld on appeal: ${verdictLabel(r.outcome.verdict)}`,
        detail: "The appeal re-read the recorded evidence and reached the same verdict. An appeal "
          + "can uphold or void a verdict; it can never flip Yes and No.",
      };
    }
    const why = readings.length < 2
      ? "did not accept both sources as covering the date"
      : "judged the recorded data not trustworthy enough to settle on";
    return {
      title: "Voided on appeal",
      detail: `The appeal panel ${why}, so nobody settles and every stake is refunded. An appeal `
        + "can void a verdict; it can never flip Yes and No.",
    };
  }
  if (r.outcome.kind === "VERDICT") {
    if (r.outcome.verdict === "VOID_CONFLICT" && readings.length === 2) {
      const values = readings.map((s) => s.x100);
      const lo = readingText(Math.min(...values), m.unit);
      const hi = readingText(Math.max(...values), m.unit);
      return {
        title: verdictLabel("VOID_CONFLICT"),
        detail: "One source says Yes and the other says No, so nobody settles and every stake is "
          + `refunded. On these readings, any threshold above ${lo} and up to ${hi} would void.`,
      };
    }
    if (r.outcome.verdict === "YES" || r.outcome.verdict === "NO") {
      const side = sideWord(r.outcome.verdict);
      return {
        title: verdictLabel(r.outcome.verdict),
        detail: `Both sources say ${side}, so the verdict is ${side}. Derived in code from the agreed readings.`,
      };
    }
    return { title: verdictLabel(r.outcome.verdict), detail: "Derived in code from the agreed readings." };
  }
  const why = readings.length === 0
    ? "Neither source had a usable value for the date, and a verdict needs both."
    : readings.length === 1
      ? "Only one source had a usable value for the date, and a verdict needs both: no corroboration, no settlement."
      : "Both sources had values, but the data check judged them not trustworthy enough to settle on.";
  return {
    title: "No verdict this round",
    detail: `${why} The round is recorded; the market can try again until it reaches its round limit.`,
  };
}

/** The headline and one sentence for a market's standing verdict. */
export function verdictSummary(m: {
  verdict: string | null;
  appeal: { prior_verdict: string | null; final_verdict: string } | null;
}): { title: string; sentence: string } | null {
  if (!m.verdict) return null;
  const appeal = m.appeal;
  if (appeal && m.verdict === "VOID_CONFLICT" && appeal.prior_verdict !== "VOID_CONFLICT") {
    return {
      title: "Voided on appeal",
      sentence: "The appeal did not accept the recorded evidence, so every stake is refunded.",
    };
  }
  const upheld = appeal ? " Upheld on appeal." : "";
  if (m.verdict === "YES" || m.verdict === "NO") {
    return { title: verdictLabel(m.verdict), sentence: `Both sources say ${sideWord(m.verdict)}.${upheld}` };
  }
  return {
    title: verdictLabel(m.verdict),
    sentence: `One source says Yes and the other says No, so nobody settles and every stake is refunded.${upheld}`,
  };
}

/* ── dates: spelled by hand so every browser reads the same ── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");

export function formatDocDate(ymd: string | null | undefined): string {
  const m = (ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd ?? "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}

/** "mk-000004" → "Market #4"; the raw id stays in verification views. */
export function marketNumber(id: string | null | undefined): string {
  const m = (id ?? "").match(/^mk-0*(\d+)$/);
  return m ? `Market #${m[1]}` : "";
}

export function ticketNumber(id: string | null | undefined): string {
  const m = (id ?? "").match(/^tk-0*(\d+)$/);
  return m ? `Ticket #${m[1]}` : "";
}

export const multiplierText = (x100: number) =>
  `${(x100 / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}×`;
