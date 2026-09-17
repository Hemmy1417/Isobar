"use client";

/**
 * Names the contract a site reads whenever it is not the deployment of
 * record, so the proving ground's resolved markets are never mistaken for
 * the live ones. The record itself shows nothing.
 */
import Link from "next/link";

import { LIVE_APP_URL, type DeploymentKind } from "../../lib/config";
import { marketNumber } from "../../lib/present";

const EXAMPLES = [
  { id: "mk-000002", text: "the sources disagreed, so it voided" },
  { id: "mk-000001", text: "Yes, upheld on appeal" },
  { id: "mk-000004", text: "No" },
  { id: "mk-000003", text: "NASA POWER had no value yet, so the round retried" },
];

const liveHost = LIVE_APP_URL.replace(/^https?:\/\//, "");

export function DeploymentBanner({ kind }: { kind: DeploymentKind }) {
  if (kind === "record") return null;
  const live = <a href={LIVE_APP_URL}>{liveHost}</a>;

  if (kind === "other") {
    return (
      <div className="notice notice-warn" style={{ marginBottom: 18 }}>
        <b>Test deployment.</b> This site reads a contract other than Isobar&apos;s deployment
        of record. The live markets are at {live}.
      </div>
    );
  }

  return (
    <div className="notice notice-info" style={{ marginBottom: 18 }}>
      <p>
        <b>Proving ground.</b> This site reads a test copy of Isobar&apos;s contract with its
        date checks opened, so markets could resolve against the real recorded weather at
        Colón, Panama. Resolution and appeal work exactly as on the live markets at {live}.
      </p>
      <p style={{ marginTop: 6 }}>
        {EXAMPLES.map((e, i) => (
          <span key={e.id}>
            {i > 0 ? " · " : ""}
            <Link href={`/markets/${e.id}`}>{marketNumber(e.id)}</Link>: {e.text}
          </span>
        ))}
      </p>
    </div>
  );
}
