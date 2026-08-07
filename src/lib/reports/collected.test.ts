import { describe, it, expect } from "vitest";
import {
  collectedOf,
  splitMoney,
  splitFromSums,
  addSplit,
  showsCredit,
  EMPTY_SPLIT,
} from "@/lib/reports/collected";

/**
 * Store credit is a TENDER, not income. These lock down the one rule every
 * report now depends on: collected = total − creditApplied, never negative,
 * never double-subtracted.
 */

describe("collectedOf", () => {
  it("returns the full total when no credit was used", () => {
    expect(collectedOf({ total: 26.01, creditApplied: 0 })).toBe(26.01);
    expect(collectedOf({ total: 26.01 })).toBe(26.01);
    expect(collectedOf({ total: 26.01, creditApplied: null })).toBe(26.01);
  });

  it("collects NOTHING on an order paid entirely with Luigi Bucks", () => {
    // The restaurant handed over $40 of food and received $0 of real money.
    expect(collectedOf({ total: 40, creditApplied: 40 })).toBe(0);
  });

  it("collects only the cash part of a partially-credited order", () => {
    expect(collectedOf({ total: 50, creditApplied: 12.5 })).toBe(37.5);
  });

  it("never goes negative even if credit somehow exceeds the total", () => {
    expect(collectedOf({ total: 10, creditApplied: 25 })).toBe(0);
  });

  it("rounds to cents rather than leaking float dust", () => {
    expect(collectedOf({ total: 19.99, creditApplied: 0.1 })).toBe(19.89);
  });

  it("treats a null total as zero", () => {
    expect(collectedOf({ total: null, creditApplied: 0 })).toBe(0);
  });
});

describe("splitMoney", () => {
  it("keeps order value, credit and collected as three separate figures", () => {
    const split = splitMoney([
      { total: 26.01, creditApplied: 0 }, // cash order
      { total: 40, creditApplied: 40 }, // fully paid with Luigi Bucks
      { total: 50, creditApplied: 12.5 }, // partially paid with Luigi Bucks
    ]);
    expect(split.orderValue).toBe(116.01);
    expect(split.creditSpent).toBe(52.5);
    expect(split.collected).toBe(63.51);
    // The invariant every report leans on (the helper rounds; raw float
    // subtraction here would carry dust, which is exactly why it rounds).
    expect(split.collected).toBeCloseTo(split.orderValue - split.creditSpent, 10);
  });

  it("is empty for no rows", () => {
    expect(splitMoney([])).toEqual(EMPTY_SPLIT);
  });

  it("does not double-subtract when fed already-collected rows by mistake", () => {
    // Guard for the one dangerous misuse: passing a row whose `total` was
    // already reduced. Credit is clamped to the gross so collected stays >= 0.
    const split = splitMoney([{ total: 0, creditApplied: 40 }]);
    expect(split.creditSpent).toBe(0);
    expect(split.collected).toBe(0);
  });
});

describe("splitFromSums", () => {
  it("matches splitMoney for the same data", () => {
    const rows = [
      { total: 12.34, creditApplied: 2.34 },
      { total: 7.66, creditApplied: 0 },
    ];
    const fromRows = splitMoney(rows);
    const fromSums = splitFromSums(20, 2.34);
    expect(fromSums).toEqual(fromRows);
  });

  it("handles the nulls Prisma returns for an empty aggregate", () => {
    expect(splitFromSums(null, null)).toEqual(EMPTY_SPLIT);
  });
});

describe("addSplit", () => {
  it("rolls locations up without losing the credit breakdown", () => {
    const a = splitMoney([{ total: 100, creditApplied: 25 }]);
    const b = splitMoney([{ total: 60, creditApplied: 0 }]);
    const sum = addSplit(a, b);
    expect(sum).toEqual({ orderValue: 160, creditSpent: 25, collected: 135 });
  });
});

describe("showsCredit", () => {
  it("stays off for a restaurant that never redeemed credit", () => {
    // Guarantees a rewards-off store's reports render exactly as before.
    expect(showsCredit(splitMoney([{ total: 26.01, creditApplied: 0 }]))).toBe(false);
    expect(showsCredit(EMPTY_SPLIT)).toBe(false);
  });

  it("turns on as soon as any credit was redeemed", () => {
    expect(showsCredit(splitMoney([{ total: 26.01, creditApplied: 0.5 }]))).toBe(true);
  });
});
