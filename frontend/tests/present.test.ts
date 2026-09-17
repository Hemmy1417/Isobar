/** The vocabulary layer: no raw identifier ever survives to a screen. */
import { describe, expect, it } from "vitest";

import { formatGen, parseGen } from "../lib/config";
import {
  formatDocDate, marketNumber, marketQuestion, multiplierText, phaseLabel,
  readingText, sentence, thresholdText, ticketNumber, verdictLabel,
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
    expect(verdictLabel("VOID_CONFLICT")).toBe("Void — sources disagreed");
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
