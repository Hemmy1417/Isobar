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
  const t = (text ?? "").trim();
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
  RESOLVED: "Resolved — appeal window",
  FINAL: "Final",
  VOID: "Void",
};
export const phaseLabel = (p: string) => lookup(PHASE, p);

export const phaseChip = (p: string) =>
  ({ OPEN: "open", OBSERVING: "observing", RESOLVING: "resolving",
     RESOLVED: "resolved", FINAL: "final", VOID: "void" }[p] ?? "open");

const VERDICT: Record<string, string> = {
  YES: "Yes — threshold met",
  NO: "No — threshold not met",
  VOID_CONFLICT: "Void — sources disagreed",
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
  FAST: "Fast lane — station data, resolves about 2 days after the date",
  GLOBAL: "Global lane — reanalysis data, resolves about 5 days after the date",
};
export const laneText = (l: string) => lookup(LANE, l);

/** The evidence hosts, by the names a person knows them by. */
const SOURCE_NAME: Record<string, string> = {
  "open-meteo": "Open-Meteo (ERA5 reanalysis)",
  "nasa-power": "NASA POWER (MERRA-2 reanalysis)",
  "nws": "US National Weather Service station",
};
export const sourceName = (s: string) => lookup(SOURCE_NAME, s);

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
