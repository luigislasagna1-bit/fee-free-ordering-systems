import { describe, it, expect } from "vitest";
import {
  clampMin,
  normalizeOrderType,
  normalizeCustomerType,
  normalizeStackingRule,
  normalizeChannel,
  normalizeNonNegativeFloat,
  normalizeImageUrl,
  normalizeJsonStringList,
} from "@/lib/promo-fields";

describe("promo-fields normalisers (trust-but-verify wizard input)", () => {
  it("clampMin clamps to 0..1440, floors, nulls empty/invalid", () => {
    expect(clampMin(600)).toBe(600);
    expect(clampMin(-5)).toBe(0);
    expect(clampMin(2000)).toBe(1440);
    expect(clampMin(10.9)).toBe(10);
    expect(clampMin("")).toBe(null);
    expect(clampMin("abc")).toBe(null);
  });

  it("normalizeOrderType keeps a single value, sorts a multi-select, defaults to both", () => {
    expect(normalizeOrderType("pickup")).toBe("pickup");
    expect(normalizeOrderType("both")).toBe("both");
    expect(normalizeOrderType('["delivery","pickup"]')).toBe('["delivery","pickup"]');
    expect(normalizeOrderType(["pickup", "delivery"])).toBe('["delivery","pickup"]');
    expect(normalizeOrderType("garbage")).toBe("both");
  });

  it("normalizeOrderType collapses ALL channels selected back to 'both' (unrestricted)", () => {
    // Selecting every channel = no restriction → "both" (Luigi 2026-06-27).
    expect(normalizeOrderType(["pickup", "delivery", "dine_in", "take_out", "catering"])).toBe("both");
    expect(normalizeOrderType('["catering","delivery","dine_in","pickup","take_out"]')).toBe("both");
    // A subset stays a real restriction.
    expect(normalizeOrderType(["pickup", "dine_in", "take_out", "catering"])).not.toBe("both");
  });

  it("enum normalisers fall back to their default on junk", () => {
    expect(normalizeCustomerType("returning")).toBe("returning");
    expect(normalizeCustomerType("nope")).toBe("any");
    expect(normalizeStackingRule("exclusive")).toBe("exclusive");
    expect(normalizeStackingRule("nope")).toBe("standard");
    expect(normalizeChannel("marketplace")).toBe("marketplace");
    expect(normalizeChannel("nope")).toBe("website");
  });

  it("normalizeNonNegativeFloat rejects negatives and junk", () => {
    expect(normalizeNonNegativeFloat(12.5)).toBe(12.5);
    expect(normalizeNonNegativeFloat(-1)).toBe(null);
    expect(normalizeNonNegativeFloat("")).toBe(null);
  });

  it("normalizeImageUrl trims, caps, nulls empty/non-string", () => {
    expect(normalizeImageUrl("  https://x.com/a.png  ")).toBe("https://x.com/a.png");
    expect(normalizeImageUrl("")).toBe(null);
    expect(normalizeImageUrl(123)).toBe(null);
  });

  it("normalizeJsonStringList parses + bounds a slug array", () => {
    expect(normalizeJsonStringList('["cash","card"]')).toBe('["cash","card"]');
    expect(normalizeJsonStringList(["cash"])).toBe('["cash"]');
    expect(normalizeJsonStringList("[]")).toBe(null);
    expect(normalizeJsonStringList("notjson")).toBe(null);
  });
});
