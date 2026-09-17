/**
 * @vitest-environment jsdom
 *
 * The live app points to the proving ground's finished rounds, opening them
 * in a new tab so they are never mistaken for live markets.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EvidencePanel } from "../app/markets/[id]/EvidencePanel";
import { ProvingGroundExamples } from "../app/components/ProvingGround";
import { DEPLOYMENT_KIND, PROVING_GROUND_APP_URL } from "../lib/config";
import type { MarketView } from "../lib/types";

afterEach(() => cleanup());

describe("links from the live app to the proving ground", () => {
  it("builds without an override read the deployment of record", () => {
    expect(DEPLOYMENT_KIND).toBe("record");
  });

  it("external examples open the proving ground's market pages in a new tab", () => {
    render(<p><ProvingGroundExamples external /></p>);
    const conflict = screen.getByRole("link", { name: "Market #2" });
    expect(conflict.getAttribute("href")).toBe(`${PROVING_GROUND_APP_URL}/markets/mk-000002`);
    expect(conflict.getAttribute("target")).toBe("_blank");
    expect(document.body.textContent).toContain("the sources disagreed, so it voided");
    expect(document.body.textContent).not.toMatch(/mk-0/);
  });

  it("a market with no rounds yet points to finished rounds on the proving ground", () => {
    render(<EvidencePanel market={{} as MarketView} rounds={[]} />);
    expect(screen.getByRole("link", { name: "proving ground" }).getAttribute("href")).toBe(PROVING_GROUND_APP_URL);
    expect(screen.getByRole("link", { name: "a market that voided" }).getAttribute("href"))
      .toBe(`${PROVING_GROUND_APP_URL}/markets/mk-000002`);
  });
});
