/** The vocabulary layer: no raw identifier ever survives to a screen. */
import { describe, expect, it } from "vitest";

import { formatGen, parseGen } from "../lib/config";
import {
  formatDocDate, marketNumber, marketQuestion, multiplierText, phaseLabel,
  readingText, roundExplanation, sentence, sourceStatus, sourceStatusShort, sourceStatusText,
  thresholdText, ticketNumber, verdictLabel, verdictSummary,
} from "../lib/present";

describe("the question a market asks", () => {
  const base = { metric: "WIND_MAX", comparison: "GTE", threshold_x100: 1250, unit: "m/s", window_date: "2026-09-21" };

  it("reads as a person would ask it", () => {
    expect(marketQuestion(base, "Port of Rotterdam"))
      .toBe("Will daily maximum wind reach 12.5 m/s at Port of Rotterdam on 21 Sep 2026?");
  });

  it("phrases the under-side without double grammar", () => {
    expect(marketQuestion({ ...base, comparison: "LT", metric: "TEMP_MAX", unit: "°C", threshold_x100: 3500 }, "Houston Ship Channel"))
      .toBe("Will daily maximum temperature stay under 35 °C at Houston Ship Channel on 21 Sep 2026?");
  });

  it("thresholdText stays declarative for detail rows", () => {
    expect(thresholdText(base)).toBe("daily maximum wind reaches 12.5 m/s");
  });
});

describe("values and identifiers", () => {
  it("readings carry their unit and never a raw x100 integer", () => {
    expect(readingText(522, "m/s")).toBe("5.22 m/s");
    expect(readingText(null, "m/s")).toBe("no reading");
  });

  it("phases and verdicts read as words with a fallback", () => {
    expect(phaseLabel("RESOLVING")).toBe("Ready to resolve");
    expect(verdictLabel("VOID_CONFLICT")).toBe("Void, sources disagreed");
    expect(phaseLabel("SOME_FUTURE_STATE")).toBe("Some future state");
  });

  it("ids become ordinals; the raw id stays for verification views", () => {
    expect(marketNumber("mk-000042")).toBe("Market #42");
    expect(ticketNumber("tk-000007")).toBe("Ticket #7");
    expect(marketNumber("garbage")).toBe("");
  });

  it("dates are spelled by hand, UTC, engine-independent", () => {
    expect(formatDocDate("2026-09-05")).toBe("5 Sep 2026");
  });

  it("multipliers and sentences", () => {
    expect(multiplierText(324)).toBe("3.24×");
    expect(sentence("the appeal window has closed")).toBe("The appeal window has closed.");
  });
});

describe("what a round's evidence means", () => {
  // The proving ground's Colón day: Open-Meteo 5.22 m/s, NASA POWER 3.84 m/s.
  const at = (threshold_x100: number, comparison = "GTE") => ({ comparison, threshold_x100, unit: "m/s" });
  const ok = (value_x100: number) => ({ covered: true, value_x100 });

  it("each source answers the question on its own, both comparisons, boundaries included", () => {
    expect(sourceStatus(at(500), ok(522))).toEqual({ kind: "reading", x100: 522, says: "YES" });
    expect(sourceStatus(at(500), ok(384))).toEqual({ kind: "reading", x100: 384, says: "NO" });
    expect(sourceStatus(at(522), ok(522))).toMatchObject({ says: "YES" });
    expect(sourceStatus(at(500, "LT"), ok(384))).toMatchObject({ says: "YES" });
    expect(sourceStatus(at(384, "LT"), ok(384))).toMatchObject({ says: "NO" });
  });

  it("tells a missing value, an unreachable source and a rejected reading apart", () => {
    expect(sourceStatus(at(500), { covered: false, value_x100: null }, { fetched: true })).toEqual({ kind: "no-value" });
    expect(sourceStatus(at(500), { covered: false, value_x100: null }, { fetched: false })).toEqual({ kind: "unreachable" });
    expect(sourceStatus(at(500), { covered: false, value_x100: 384 })).toEqual({ kind: "not-accepted", x100: 384 });
    expect(sourceStatus(at(500), undefined)).toEqual({ kind: "no-value" });
  });

  it("says why, in sentences a person can check against the numbers", () => {
    expect(sourceStatusText(at(500), sourceStatus(at(500), ok(522))))
      .toBe("5.22 m/s is at or above 5 m/s, so this source says Yes.");
    expect(sourceStatusText(at(500), sourceStatus(at(500), ok(384))))
      .toBe("3.84 m/s is under 5 m/s, so this source says No.");
    expect(sourceStatusText(at(500), { kind: "unreachable" })).toBe("The source did not answer.");
    expect(sourceStatusShort(at(500), { kind: "not-accepted", x100: 384 })).toBe("3.84 m/s, not accepted");
  });

  it("explains a conflict, the void band and the refund", () => {
    const statuses = [sourceStatus(at(500), ok(522)), sourceStatus(at(500), ok(384))];
    expect(roundExplanation(at(500), { kind: "RESOLUTION", outcome: { kind: "VERDICT", verdict: "VOID_CONFLICT" } }, statuses))
      .toEqual({
        title: "Void, sources disagreed",
        detail: "One source says Yes and the other says No, so nobody settles and every stake is refunded. "
          + "On these readings, any threshold above 3.84 m/s and up to 5.22 m/s would void.",
      });
  });

  it("explains agreement, a retry and both appeal outcomes", () => {
    const both = [sourceStatus(at(300), ok(522)), sourceStatus(at(300), ok(384))];
    expect(roundExplanation(at(300), { kind: "RESOLUTION", outcome: { kind: "VERDICT", verdict: "YES" } }, both).detail)
      .toBe("Both sources say Yes, so the verdict is Yes. Derived in code from the agreed readings.");
    const one = [sourceStatus(at(300), ok(462)), { kind: "no-value" } as const];
    expect(roundExplanation(at(300), { kind: "RESOLUTION", outcome: { kind: "RETRY", verdict: null } }, one).detail)
      .toMatch(/^Only one source had a usable value for the date, and a verdict needs both/);
    expect(roundExplanation(at(300), { kind: "RESOLUTION", outcome: { kind: "RETRY", verdict: null } }, both).detail)
      .toMatch(/^Both sources had values, but the data check judged them not trustworthy/);
    expect(roundExplanation(at(300), { kind: "APPEAL", outcome: { kind: "VERDICT", verdict: "YES" } }, both).title)
      .toBe("Upheld on appeal: Yes, threshold met");
    expect(roundExplanation(at(300), { kind: "APPEAL", outcome: { kind: "RETRY", verdict: null } }, one).title)
      .toBe("Voided on appeal");
  });

  it("summarizes a standing verdict, including one voided or upheld on appeal", () => {
    expect(verdictSummary({ verdict: null, appeal: null })).toBeNull();
    expect(verdictSummary({ verdict: "VOID_CONFLICT", appeal: null })?.sentence)
      .toBe("One source says Yes and the other says No, so nobody settles and every stake is refunded.");
    expect(verdictSummary({ verdict: "YES", appeal: { prior_verdict: "YES", final_verdict: "YES" } }))
      .toEqual({ title: "Yes, threshold met", sentence: "Both sources say Yes. Upheld on appeal." });
    expect(verdictSummary({ verdict: "VOID_CONFLICT", appeal: { prior_verdict: "YES", final_verdict: "VOID_CONFLICT" } })?.title)
      .toBe("Voided on appeal");
  });
});

describe("GEN amounts", () => {
  it("round-trips and trims", () => {
    expect(formatGen(10n ** 18n)).toBe("1");
    expect(formatGen(5n * 10n ** 16n)).toBe("0.05");
    expect(formatGen(324n * 10n ** 15n)).toBe("0.324");
    expect(parseGen("0.05")).toBe(5n * 10n ** 16n);
    expect(parseGen("2")).toBe(2n * 10n ** 18n);
    expect(parseGen("nonsense")).toBeNull();
  });
});
