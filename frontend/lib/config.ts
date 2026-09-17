/**
 * The deployment this build serves. One address, stated once: the app
 * reads and writes ONLY the deployment of record (or the env override a
 * developer sets for a disposable probe).
 */

/** isobar-rules-2, deployed 16 Sep 2026, tx 0x172624ca…, byte-verified against this repo. */
export const DEPLOYMENT_OF_RECORD = "0x169cE1cD5aAa013adee55a4B3ed86752cc999375";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  DEPLOYMENT_OF_RECORD) as `0x${string}`;

export const CONTRACT_CONFIGURED = CONTRACT_ADDRESS.length === 42;

/**
 * The disposable the resolved scenes ran on (16 Sep 2026): isobar-rules-1
 * with its date gates opened. Resolution, appeal and settlement code is the
 * same as the record's; rules-2 changed only how refused payments return.
 */
export const PROVING_GROUND = "0xFF60C795c1e449e7DA99dd1b7726e064ba426CE2";

/** Where the live markets are, for pages served from any other deployment. */
export const LIVE_APP_URL = "https://iso-bar.vercel.app";

/** The same frontend built against PROVING_GROUND, so finished rounds are browsable. */
export const PROVING_GROUND_APP_URL = "https://isobar-frontend-i1kv.vercel.app";

/** The proving ground's resolved markets, each named by what its record shows. */
export const PROVING_GROUND_EXAMPLES = [
  { id: "mk-000002", text: "the sources disagreed, so it voided" },
  { id: "mk-000001", text: "Yes, upheld on appeal" },
  { id: "mk-000004", text: "No" },
  { id: "mk-000003", text: "NASA POWER had no value yet, so the round retried" },
] as const;

export type DeploymentKind = "record" | "proving-ground" | "other";

export function deploymentKind(address: string): DeploymentKind {
  const a = address.toLowerCase();
  if (a === DEPLOYMENT_OF_RECORD.toLowerCase()) return "record";
  if (a === PROVING_GROUND.toLowerCase()) return "proving-ground";
  return "other";
}

/** Which deployment this build reads, fixed at build time. */
export const DEPLOYMENT_KIND = deploymentKind(CONTRACT_ADDRESS);

export const APP_NAME = "Isobar";

const GEN = 10n ** 18n;

/** "1.25" — GEN with up to 4 meaningful decimals, trailing zeros trimmed. */
export function formatGen(wei: bigint): string {
  const neg = wei < 0n ? "-" : "";
  const abs = wei < 0n ? -wei : wei;
  const whole = abs / GEN;
  const frac = abs % GEN;
  if (frac === 0n) return `${neg}${whole}`;
  let f = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  if (!f) f = "0001";
  return `${neg}${whole}.${f}`;
}

export function parseGen(text: string): bigint | null {
  const m = text.trim().match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(18, "0") || "0");
  return whole * GEN + frac;
}
