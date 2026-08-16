import { describe, expect, it } from "vitest";
import { TOTALS_MISMATCH_TOLERANCE, totalsMismatch } from "./totals-mismatch";

describe("totalsMismatch — one tolerance platform-wide (> half a cent)", () => {
  it("equal / within tolerance → false", () => {
    expect(totalsMismatch(24.5, 24.5)).toBe(false);
    expect(totalsMismatch(24.5, 24.504)).toBe(false);
    expect(totalsMismatch(10, 10.004)).toBe(false); // sub-cent noise is not a mismatch
    expect(totalsMismatch(0.1 + 0.2, 0.3)).toBe(false); // float noise is not a mismatch
    expect(TOTALS_MISMATCH_TOLERANCE).toBe(0.005);
  });
  it("more than half a cent apart, either direction → true", () => {
    expect(totalsMismatch(24.5, 24.51)).toBe(true);
    expect(totalsMismatch(27.1, 24.5)).toBe(true);
    expect(totalsMismatch(23.37, 25.97)).toBe(true); // the 2026-08-13 Roya incident
  });
  it("missing or non-finite on either side → false (nothing to compare)", () => {
    expect(totalsMismatch(null, 24.5)).toBe(false);
    expect(totalsMismatch(24.5, undefined)).toBe(false);
    expect(totalsMismatch(NaN, 24.5)).toBe(false);
    expect(totalsMismatch(24.5, Infinity)).toBe(false);
  });
});
