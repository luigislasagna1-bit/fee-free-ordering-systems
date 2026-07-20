import { describe, expect, it } from "vitest";
import { pickOverridePct, earnAtPct } from "./reward-earn-rate";

/** Standing VIP/personal earn-rate overrides (Luigi 2026-07-19).
 *  The resolution + math rules the grant AND every preview rely on. */

describe("pickOverridePct", () => {
  it("personal rate beats any group rate", () => {
    expect(pickOverridePct(12, [10, 20])).toBe(12);
  });

  it("highest group rate wins when no personal rate", () => {
    expect(pickOverridePct(null, [5, 10, 7.5])).toBe(10);
    expect(pickOverridePct(undefined, [10])).toBe(10);
  });

  it("no rates anywhere → null (caller keeps the base branch untouched)", () => {
    expect(pickOverridePct(null, [])).toBeNull();
    expect(pickOverridePct(null, [null, undefined])).toBeNull();
  });

  it("zero and negative rates are treated as unset, not as overrides", () => {
    // A 0 must fall through to the base rate — 'block this person from
    // earning' is deliberately NOT this feature.
    expect(pickOverridePct(0, [0, -5])).toBeNull();
    expect(pickOverridePct(0, [0, 8])).toBe(8);
  });

  it("mixed nulls among groups don't disturb the max", () => {
    expect(pickOverridePct(null, [null, 6, undefined, 4])).toBe(6);
  });
});

describe("earnAtPct", () => {
  it("computes percent-of-basis", () => {
    expect(earnAtPct(40, 10)).toBeCloseTo(4, 10);
    expect(earnAtPct(12.34, 5)).toBeCloseTo(0.617, 10);
  });

  it("double the base rate doubles the earn on the same basis", () => {
    const basis = 27.89;
    expect(earnAtPct(basis, 10)).toBeCloseTo(earnAtPct(basis, 5) * 2, 10);
  });

  it("matches the base percent-mode formula exactly for the same pct", () => {
    // awardForOrder's untouched base branch: basis * (pct / 100). An override
    // at the SAME pct must land on the identical value, so switching a group
    // rate on at the base rate is a provable no-op.
    const basis = 19.99;
    const pct = 5;
    expect(earnAtPct(basis, pct)).toBe(basis * (pct / 100));
  });
});
