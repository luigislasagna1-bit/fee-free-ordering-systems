/**
 * Nabil AI pricing math — US$0.50/min billed by the SECOND, US$249.99/month
 * minimum, whichever is higher. No per-call rounding.
 */
import { describe, it, expect } from "vitest";
import {
  NABIL_INCLUDED_MINUTES,
  NABIL_INCLUDED_SECONDS,
  NABIL_MONTHLY_MIN_CENTS,
  NABIL_PER_MINUTE_CENTS,
  billedSeconds,
  billedSecondsForCalls,
  monthlyChargeCents,
  overageCents,
  overageSeconds,
  projectMonthEnd,
  meterSummary,
  monthWindowUtc,
  monthStartUtc,
  nextMonthStartUtc,
  previousMonthStartUtc,
  periodKey,
  parsePeriodKey,
  formatUsdCents,
  formatSecondsAsMinSec,
} from "./nabil-billing";

describe("constants", () => {
  it("US$0.50/min, 29998 included seconds ≈ 499 min", () => {
    expect(NABIL_PER_MINUTE_CENTS).toBe(50);
    expect(NABIL_MONTHLY_MIN_CENTS).toBe(24999);
    // floor(24999 × 60 / 50) = 29998
    expect(NABIL_INCLUDED_SECONDS).toBe(29998);
    // floor(29998 / 60) = 499
    expect(NABIL_INCLUDED_MINUTES).toBe(499);
  });
});

describe("billedSeconds — per call, ceiled to whole seconds", () => {
  it("0 / null / negative / NaN bill nothing", () => {
    expect(billedSeconds(0)).toBe(0);
    expect(billedSeconds(null)).toBe(0);
    expect(billedSeconds(undefined)).toBe(0);
    expect(billedSeconds(-5)).toBe(0);
    expect(billedSeconds(Number.NaN)).toBe(0);
  });
  it("fractional seconds ceil: 0.1 → 1, 59.1 → 60, 60 → 60", () => {
    expect(billedSeconds(0.1)).toBe(1);
    expect(billedSeconds(59.1)).toBe(60);
    expect(billedSeconds(60)).toBe(60);
    expect(billedSeconds(61)).toBe(61);
  });
  it("sums per call with no per-call minute rounding", () => {
    expect(billedSecondsForCalls([61, 61])).toBe(122);
    expect(billedSecondsForCalls([30, 30, 30])).toBe(90);
    expect(billedSecondsForCalls([])).toBe(0);
    expect(billedSecondsForCalls([null, 0, 120])).toBe(120);
  });
});

describe("monthlyChargeCents / overageCents — max(249.99, ceil(seconds × 50/60))", () => {
  it("0 seconds → the minimum, no overage", () => {
    expect(monthlyChargeCents(0)).toBe(24999);
    expect(overageCents(0)).toBe(0);
    expect(overageSeconds(0)).toBe(0);
  });
  it("exactly 29998 seconds (included allowance) → still the minimum", () => {
    // ceil(29998 × 50 / 60) = ceil(24998.333) = 24999 = the minimum
    expect(monthlyChargeCents(29998)).toBe(24999);
    expect(overageCents(29998)).toBe(0);
    expect(overageSeconds(29998)).toBe(0);
  });
  it("29999 seconds → 1¢ overage", () => {
    // ceil(29999 × 50 / 60) = ceil(24999.166) = 25000
    expect(monthlyChargeCents(29999)).toBe(25000);
    expect(overageCents(29999)).toBe(1);
    expect(overageSeconds(29999)).toBe(1);
  });
  it("36000 seconds (600 min) → 30000¢, overage 5001¢", () => {
    // ceil(36000 × 50 / 60) = 30000
    expect(monthlyChargeCents(36000)).toBe(30000);
    expect(overageCents(36000)).toBe(5001);
    expect(overageSeconds(36000)).toBe(6002);
  });
  it("never negative and ignores fractional input", () => {
    expect(monthlyChargeCents(-10)).toBe(24999);
    // ceil(25000) = 25000; ceil(25000 × 50/60) = ceil(20833.33) = 20834 < 24999
    expect(monthlyChargeCents(24999.9)).toBe(24999);
    expect(overageCents(-1)).toBe(0);
  });
});

describe("month window (UTC calendar month)", () => {
  it("monthWindowUtc / monthStartUtc / next / previous", () => {
    const d = new Date("2026-08-17T14:03:00.000Z");
    expect(monthStartUtc(d).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(nextMonthStartUtc(d).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(previousMonthStartUtc(d).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    const w = monthWindowUtc(d);
    expect(w.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("year boundaries", () => {
    expect(previousMonthStartUtc(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(nextMonthStartUtc(new Date("2026-12-31T23:59:59.000Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("periodKey / parsePeriodKey round-trip; malformed → null", () => {
    expect(periodKey(new Date("2026-07-01T00:00:00.000Z"))).toBe("2026-07");
    expect(parsePeriodKey("2026-07")?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(parsePeriodKey("2026-13")).toBeNull();
    expect(parsePeriodKey("2026-7")).toBeNull();
    expect(parsePeriodKey("")).toBeNull();
    expect(parsePeriodKey(null)).toBeNull();
  });
});

describe("projectMonthEnd — linear pace (now takes seconds)", () => {
  const window = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };
  it("halfway through the month doubles the seconds", () => {
    const mid = new Date("2026-08-16T12:00:00.000Z");
    expect(projectMonthEnd(6000, mid, window)).toBe(12000);
  });
  it("at the very start it is just the seconds so far", () => {
    expect(projectMonthEnd(0, window.start, window)).toBe(0);
    expect(projectMonthEnd(7, window.start, window)).toBe(7);
  });
  it("at / past month end it is the seconds so far", () => {
    expect(projectMonthEnd(18000, window.end, window)).toBe(18000);
    expect(projectMonthEnd(18000, new Date("2026-09-15T00:00:00.000Z"), window)).toBe(18000);
  });
  it("0 seconds projects 0; negative is clamped", () => {
    expect(projectMonthEnd(0, new Date("2026-08-20T00:00:00.000Z"), window)).toBe(0);
    expect(projectMonthEnd(-5, new Date("2026-08-20T00:00:00.000Z"), window)).toBe(0);
  });
});

describe("meterSummary — what the Overview tile shows", () => {
  it("under the allowance: charge = minimum", () => {
    const s = meterSummary(6000, new Date("2026-08-16T12:00:00.000Z"));
    expect(s.seconds).toBe(6000);
    expect(s.minutes).toBe(100);
    expect(s.includedSeconds).toBe(29998);
    expect(s.includedMinutes).toBe(499);
    expect(s.overageSeconds).toBe(0);
    expect(s.overageMinutes).toBe(0);
    expect(s.chargeSoFarCents).toBe(24999);
    expect(s.projectedSeconds).toBe(12000);
    expect(s.projectedChargeCents).toBe(24999);
  });
  it("over the allowance: projected charge scales with projected seconds", () => {
    const s = meterSummary(18000, new Date("2026-08-16T12:00:00.000Z"));
    expect(s.projectedSeconds).toBe(36000);
    // ceil(36000 × 50/60) = 30000
    expect(s.projectedChargeCents).toBe(30000);
    // 18000 still under 29998 included
    expect(s.chargeSoFarCents).toBe(24999);
    expect(s.overageSeconds).toBe(0);
    expect(s.overageMinutes).toBe(0);
    // 60000 seconds (well over allowance) near end of month
    const s2 = meterSummary(60000, new Date("2026-08-31T00:00:00.000Z"));
    // ceil(60000 × 50/60) = 50000
    expect(s2.chargeSoFarCents).toBe(50000);
    expect(s2.overageSeconds).toBe(30002);
    expect(s2.overageMinutes).toBe(500);
  });
});

describe("formatUsdCents", () => {
  it("always says US$ with two decimals", () => {
    expect(formatUsdCents(24999)).toBe("US$249.99");
    expect(formatUsdCents(50)).toBe("US$0.50");
    expect(formatUsdCents(0)).toBe("US$0.00");
  });
});

describe("formatSecondsAsMinSec", () => {
  it("formats seconds as Xm Ys", () => {
    expect(formatSecondsAsMinSec(0)).toBe("0s");
    expect(formatSecondsAsMinSec(30)).toBe("30s");
    expect(formatSecondsAsMinSec(60)).toBe("1m");
    expect(formatSecondsAsMinSec(91)).toBe("1m 31s");
    expect(formatSecondsAsMinSec(29998)).toBe("499m 58s");
  });
});
