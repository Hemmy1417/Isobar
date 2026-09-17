/**
 * @vitest-environment jsdom
 *
 * The evidence card explains each round in words: what each source says
 * against the threshold, and why the round ended as it did. Rounds are the
 * proving ground's real records for Colón, 11 and 15 Sep 2026.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EvidencePanel } from "../app/markets/[id]/EvidencePanel";
import type { MarketView, RoundView } from "../lib/types";

afterEach(() => cleanup());

const market = (threshold_x100: number) => ({
  market_id: "mk-000002", comparison: "GTE", threshold_x100, unit: "m/s",
  sources: [
    { source: "open-meteo", url: "https://archive-api.open-meteo.com/v1/archive" },
    { source: "nasa-power", url: "https://power.larc.nasa.gov/api/temporal/daily/point" },
  ],
}) as unknown as MarketView;

const row = (source: string, fetched: boolean, covered: boolean, value_x100: number | null) => ({
  source, url: "https://example.invalid", fetched, covered, value_x100, excerpt: "{}", digest: "",
});

const finding = (covered: boolean) => ({ covered, anomaly: "", quote: "" });

const resolution = (om: number | null, power: number | null, kind: "VERDICT" | "RETRY",
                    verdict: string | null, powerFetched = true): RoundView => ({
  round: 1, kind: "RESOLUTION", market_id: "mk-000002", at: "2026-09-16T19:07:45Z", ruleset: "isobar-rules-1",
  snapshot: [row("open-meteo", true, om !== null, om), row("nasa-power", powerFetched, power !== null, power)],
  panel: { sources: { "open-meteo": finding(om !== null), "nasa-power": finding(power !== null) }, sufficient: true },
  outcome: { kind, verdict, reason: null, readings: {
    "open-meteo": { covered: om !== null, value_x100: om },
    "nasa-power": { covered: power !== null, value_x100: power },
  } },
});

describe("the evidence card explains each round", () => {
  it("a conflict: one source says Yes, the other says No, and every stake is refunded", () => {
    render(<EvidencePanel market={market(500)} rounds={[resolution(522, 384, "VERDICT", "VOID_CONFLICT")]} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("5.22 m/s is at or above 5 m/s, so this source says Yes.");
    expect(text).toContain("3.84 m/s is under 5 m/s, so this source says No.");
    expect(text).toContain("Void, sources disagreed.");
    expect(text).toContain("any threshold above 3.84 m/s and up to 5.22 m/s would void");
    expect(screen.getByText("says Yes").className).toBe("side-yes");
    expect(screen.getByText("says No").className).toBe("side-no");
  });

  it("a retry names the missing source instead of a generic 'did not cover'", () => {
    render(<EvidencePanel market={market(300)} rounds={[resolution(462, null, "RETRY", null, false)]} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("The source did not answer.");
    expect(text).toContain("no answer");
    expect(text).toContain("No verdict this round.");
    expect(text).toContain("Only one source had a usable value for the date");
  });

  it("an appeal reads the reviewed round's record and says it cannot flip the verdict", () => {
    const first = resolution(522, 384, "VERDICT", "YES");
    const appeal: RoundView = {
      ...first, round: 2, kind: "APPEAL", snapshot: undefined, reviewed_round: 1,
      grounds: "The POWER reading looks low; please re-check the record.",
    };
    render(<EvidencePanel market={market(300)} rounds={[first, appeal]} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Upheld on appeal: Yes, threshold met.");
    expect(text).toContain("it can never flip Yes and No");
  });

  it("an appeal that does not accept the record voids the market", () => {
    const first = resolution(522, 384, "VERDICT", "YES");
    const appeal: RoundView = {
      ...first, round: 2, kind: "APPEAL", snapshot: undefined, reviewed_round: 1,
      panel: { sources: { "open-meteo": finding(true), "nasa-power": finding(false) }, sufficient: true },
      outcome: { kind: "RETRY", verdict: null, reason: null, readings: {
        "open-meteo": { covered: true, value_x100: 522 },
        "nasa-power": { covered: false, value_x100: 384 },
      } },
    };
    render(<EvidencePanel market={market(300)} rounds={[first, appeal]} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("3.84 m/s was read, but the data check did not accept it.");
    expect(text).toContain("Voided on appeal.");
    expect(text).not.toContain("the market can try again");
  });
});
