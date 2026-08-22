/**
 * A6 / C13 — spoken street vs matched address (services/nabil-voice/src/street-compare.ts).
 * Call cmt3ezxz1: "Moreland" was matched to "Rutland" and accepted as verified.
 */
import { describe, expect, it } from "vitest";
import { osaDistance, streetCoreTokens, streetMatches, streetTokens } from "../../../services/nabil-voice/src/street-compare";

describe("streetTokens / streetCoreTokens", () => {
  it("lowercases, expands abbreviations, drops numbers, units and suffix words", () => {
    expect(streetTokens("933 Maple Ave., Unit 4")).toEqual(["933", "maple", "avenue", "unit", "4"]);
    expect(streetCoreTokens("933 Maple Ave., Unit 4")).toEqual(["maple"]);
    expect(streetCoreTokens("1166 McEachern Crt")).toEqual(["mceachern"]);
    expect(streetCoreTokens("12 Moreland Cres W")).toEqual(["moreland"]);
  });
});

describe("streetMatches", () => {
  it("accepts the same street in any spelling of its suffix", () => {
    expect(streetMatches("933 Maple Avenue", "933 Maple Ave, Milton, ON L9T 4P1, Canada")).toBe(true);
    expect(streetMatches("12 Moreland Crescent", "12 Moreland Cres, Milton, ON")).toBe(true);
  });
  it("tolerates one ASR typo / transposition on a longer name", () => {
    expect(streetMatches("1166 McEachren Court", "1166 McEachern Crt, Milton, ON L9T 0A1")).toBe(true);
    expect(streetMatches("45 Thompsom Road", "45 Thompson Rd S, Milton")).toBe(true);
    expect(osaDistance("mceachren", "mceachern")).toBe(1);
  });
  it("flags a DIFFERENT street (the Moreland → Rutland class)", () => {
    expect(streetMatches("12 Moreland Crescent", "12 Rutland Crescent, Milton, ON")).toBe(false);
    expect(streetMatches("88 Main Street", "Milton, ON, Canada")).toBe(false);
  });
  it("landmarks: any identifying word in the label is enough; nothing to compare → no opinion", () => {
    expect(streetMatches("Milton Sports Center on Santa Maria Blvd", "605 Santa Maria Blvd, Milton, ON")).toBe(true);
    expect(streetMatches("Milton Sports Center", "Milton Sports Centre, 605 Santa Maria Blvd")).toBe(true);
    expect(streetMatches("12", "12 Rutland Crescent")).toBe(true);
    expect(streetMatches("unit 4", "anything")).toBe(true);
  });
  it("short words never fuzzy-match (Main vs Mann stays different)", () => {
    expect(streetMatches("5 Main St", "5 Mann Rd, Milton")).toBe(false);
  });
});
