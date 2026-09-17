/**
 * @vitest-environment jsdom
 *
 * The banner that keeps the proving ground's resolved markets from being
 * mistaken for the live ones, and stays out of the way on the record.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DeploymentBanner } from "../app/components/DeploymentBanner";
import { DEPLOYMENT_OF_RECORD, LIVE_APP_URL, PROVING_GROUND, deploymentKind } from "../lib/config";

afterEach(() => cleanup());

describe("which deployment a site reads", () => {
  it("recognizes the record and the proving ground in any letter case", () => {
    expect(deploymentKind(DEPLOYMENT_OF_RECORD)).toBe("record");
    expect(deploymentKind(DEPLOYMENT_OF_RECORD.toLowerCase())).toBe("record");
    expect(deploymentKind(PROVING_GROUND.toLowerCase())).toBe("proving-ground");
    expect(deploymentKind("0x0000000000000000000000000000000000000001")).toBe("other");
  });

  it("shows nothing on the deployment of record", () => {
    const { container } = render(<DeploymentBanner kind="record" />);
    expect(container.textContent).toBe("");
  });

  it("names the proving ground and links its resolved examples by market number", () => {
    render(<DeploymentBanner kind="proving-ground" />);
    expect(screen.getByText("Proving ground.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Market #2" }).getAttribute("href")).toBe("/markets/mk-000002");
    expect(screen.getByRole("link", { name: "Market #3" }).getAttribute("href")).toBe("/markets/mk-000003");
    expect(screen.getByRole("link", { name: "iso-bar.vercel.app" }).getAttribute("href")).toBe(LIVE_APP_URL);
    // no raw identifiers on the surface
    expect(document.body.textContent).not.toMatch(/mk-0/);
  });

  it("warns on any other deployment", () => {
    render(<DeploymentBanner kind="other" />);
    expect(screen.getByText("Test deployment.")).toBeTruthy();
  });
});
