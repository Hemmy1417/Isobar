/**
 * The proving ground's resolved markets as links. Inside the proving-ground
 * build they are in-app links; from the live app they open the proving
 * ground in a new tab, so nobody mistakes them for live markets.
 */
import Link from "next/link";

import { PROVING_GROUND_APP_URL, PROVING_GROUND_EXAMPLES } from "../../lib/config";
import { marketNumber } from "../../lib/present";

export function ProvingGroundExamples({ external }: { external: boolean }) {
  return (
    <>
      {PROVING_GROUND_EXAMPLES.map((e, i) => (
        <span key={e.id}>
          {i > 0 ? " · " : ""}
          {external ? (
            <a href={`${PROVING_GROUND_APP_URL}/markets/${e.id}`} target="_blank" rel="noreferrer">
              {marketNumber(e.id)}
            </a>
          ) : (
            <Link href={`/markets/${e.id}`}>{marketNumber(e.id)}</Link>
          )}
          : {e.text}
        </span>
      ))}
    </>
  );
}

/** A link to the proving ground itself, opening in a new tab. */
export function ProvingGroundLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={PROVING_GROUND_APP_URL} target="_blank" rel="noreferrer">{children}</a>
  );
}
