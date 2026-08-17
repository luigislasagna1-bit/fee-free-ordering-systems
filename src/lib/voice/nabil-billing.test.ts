/**
 * Nabil AI pricing math — US$0.60/min, US$249.99/month minimum, whichever is
 * higher; every call rounded UP to the next minute; overage = charge − minimum.
 */
import { describe, it, expect } from "vitest";
import {
  NABIL_INCLUDED_MINUTES,
  NABIL_MONTHLY_MIN_CENTS,
  NABIL_PER_MINUTE_CENTS,
  billedMinutes,
  billedMinutesForCalls,
  monthlyChargeCents,
  overageCents,
  overageMinutes,
  projectMonthEnd,
  meterSummary,
  monthWindowUtc,
  monthStartUtc,
  nextMonthStartUtc,
  previousMonthStartUtc,
  periodKey,
  parsePeriodKey,
  formatUsdCents,
} from "./nabil-billing";

describe("constants", () => {
  it("416 included minutes = floor(24999 / 60)", () => {
    expect(NABIL_PER_MINUTE_CENTS).toBe(60);
    expect(NABIL_MONTHLY_MIN_CENTS).toBe(24999);
    expect(NABIL_INCLUDED_MINUTES).toBe(416);
  });
});

describe("billedMinutes — per call, rounded UP", () => {
  it("0 / null / negative / NaN bill nothing", () => {
    expect(billedMinutes(0)).toBe(0);
    expect(billedMinutes(null)).toBe(0);
    expect(billedMinutes(undefined)).toBe(0);
    expect(billedMinutes(-5)).toBe(0);
    expect(billedMinutes(Number.NaN)).toBe(0);
  });
  it("partial minutes round up: 1 s → 1, 60 s → 1, 61 s → 2, 599 s → 10", () => {
    expect(billedMinutes(1)).toBe(1);
    expect(billedMinutes(59)).toBe(1);
    expect(billedMinutes(60)).toBe(1);
    expect(billedMinutes(61)).toBe(2);
    expect(billedMinutes(599)).toBe(10);
    expect(billedMinutes(600)).toBe(10);
  });
  it("sums per call, NOT on total seconds (two 61 s calls = 4 min, not 3)", () => {
    expect(billedMinutesForCalls([61, 61])).toBe(4);
    expect(billedMinutesForCalls([30, 30, 30])).toBe(3);
    expect(billedMinutesForCalls([])).toBe(0);
    expect(billedMinutesForCalls([null, 0, 120])).toBe(2);
  });
});

describe("monthlyChargeCents / overageCents — max(249.99, minutes × 0.60)", () => {
  it("0 minutes → the minimum, no overage", () => {
    expect(monthlyChargeCents(0)).toBe(24999);
    expect(overageCents(0)).toBe(0);
    expect(overageMinutes(0)).toBe(0);
  });
  it("exactly 416 minutes → still the minimum (416 × 60 = 24960 < 24999)", () => {
    expect(monthlyChargeCents(416)).toBe(24999);
    expect(overageCents(416)).toBe(0);
    expect(overageMinutes(416)).toBe(0);
  });
  it("417 minutes → 25020¢, overage 21¢ (the first minute past the minimum only costs the difference)", () => {
    expect(monthlyChargeCents(417)).toBe(25020);
    expect(overageCents(417)).toBe(21);
    expect(overageMinutes(417)).toBe(1);
  });
  it("500 minutes → US$300.00, overage US$50.01", () => {
    expect(monthlyChargeCents(500)).toBe(30000);
    expect(overageCents(500)).toBe(5001);
    expect(overageMinutes(500)).toBe(84);
  });
  it("never negative and ignores fractional input", () => {
    expect(monthlyChargeCents(-10)).toBe(24999);
    expect(monthlyChargeCents(416.9)).toBe(24999);
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

describe("projectMonthEnd — linear pace", () => {
  const window = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") }; // 31 days
  it("halfway through the month doubles the minutes", () => {
    const mid = new Date("2026-08-16T12:00:00.000Z"); // exactly 15.5 days in
    expect(projectMonthEnd(100, mid, window)).toBe(200);
  });
  it("at the very start (nothing elapsed) it is just the minutes so far", () => {
    expect(projectMonthEnd(0, window.start, window)).toBe(0);
    expect(projectMonthEnd(7, window.start, window)).toBe(7);
  });
  it("at / past month end it is the minutes so far (never extrapolates beyond)", () => {
    expect(projectMonthEnd(300, window.end, window)).toBe(300);
    expect(projectMonthEnd(300, new Date("2026-09-15T00:00:00.000Z"), window)).toBe(300);
  });
  it("0 minutes projects 0; negative is clamped", () => {
    expect(projectMonthEnd(0, new Date("2026-08-20T00:00:00.000Z"), window)).toBe(0);
    expect(projectMonthEnd(-5, new Date("2026-08-20T00:00:00.000Z"), window)).toBe(0);
  });
});

describe("meterSummary — what the Overview tile shows", () => {
  it("under the allowance: charge = minimum so far AND projected", () => {
    const s = meterSummary(100, new Date("2026-08-16T12:00:00.000Z"));
    expect(s.minutes).toBe(100);
    expect(s.includedMinutes).toBe(416);
    expect(s.overageMinutes).toBe(0);
    expect(s.chargeSoFarCents).toBe(24999);
    expect(s.projectedMinutes).toBe(200);
    expect(s.projectedChargeCents).toBe(24999);
  });
  it("over the allowance: projected charge scales with projected minutes", () => {
    const s = meterSummary(300, new Date("2026-08-16T12:00:00.000Z"));
    expect(s.projectedMinutes).toBe(600);
    expect(s.projectedChargeCents).toBe(36000);
    expect(s.chargeSoFarCents).toBe(24999);
    expect(s.overageMinutes).toBe(0);
    const s2 = meterSummary(500, new Date("2026-08-31T00:00:00.000Z"));
    expect(s2.chargeSoFarCents).toBe(30000);
    expect(s2.overageMinutes).toBe(84);
  });
});

describe("formatUsdCents", () => {
  it("always says US$ with two decimals", () => {
    expect(formatUsdCents(24999)).toBe("US$249.99");
    expect(formatUsdCents(60)).toBe("US$0.60");
    expect(formatUsdCents(0)).toBe("US$0.00");
  });
});
