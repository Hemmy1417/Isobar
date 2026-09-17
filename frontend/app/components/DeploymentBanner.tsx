"use client";

/**
 * Names the contract a site reads whenever it is not the deployment of
 * record, so the proving ground's resolved markets are never mistaken for
 * the live ones. The record itself shows nothing.
 */
import { LIVE_APP_URL, type DeploymentKind } from "../../lib/config";
import { ProvingGroundExamples } from "./ProvingGround";

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
        <ProvingGroundExamples external={false} />
      </p>
    </div>
  );
}
