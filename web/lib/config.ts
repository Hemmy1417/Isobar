/**
 * The deployment this build serves. One address, stated once: the app
 * reads and writes ONLY the deployment of record (or the env override a
 * developer sets for a disposable probe).
 */

/** Deployed 16 Sep 2026, tx 0x57416a60…, byte-verified against this repo. */
export const DEPLOYMENT_OF_RECORD = "0x85328a61Dc0d7630BdFcd3dC536e1d159Ef527b5";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  DEPLOYMENT_OF_RECORD) as `0x${string}`;

export const CONTRACT_CONFIGURED = CONTRACT_ADDRESS.length === 42;

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
