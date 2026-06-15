import { describe, it, expect } from "vitest";
import { evaluateApplicableFees, sumAppliedFees } from "@/lib/service-fees";

const baseFee = {
  id: "f1",
  name: "Service fee",
  feeType: "fixed",
  amount: 2,
  appliesTo: "both",
  daysOfWeek: null,
  publicHolidaysOnly: false,
  countryCode: "US",
  isActive: true,
};

describe("evaluateApplicableFees", () => {
  it("applies a fixed fee for a matching order type", () => {
    const out = evaluateApplicableFees([baseFee], { subtotal: 100, type: "pickup", at: new Date(2026, 6, 5) });
    expect(out).toEqual([{ name: "Service fee", amount: 2 }]);
  });
  it("computes a percent fee off the subtotal", () => {
    const fee = { ...baseFee, feeType: "percent", amount: 10 };
    const out = evaluateApplicableFees([fee], { subtotal: 50, type: "delivery", at: new Date(2026, 6, 5) });
    expect(out).toEqual([{ name: "Service fee", amount: 5 }]);
  });
  it("skips inactive fees and non-matching order types", () => {
    expect(
      evaluateApplicableFees([{ ...baseFee, isActive: false }], { subtotal: 100, type: "pickup", at: new Date() }),
    ).toEqual([]);
    expect(
      evaluateApplicableFees([{ ...baseFee, appliesTo: "delivery" }], { subtotal: 100, type: "pickup", at: new Date() }),
    ).toEqual([]);
  });
  it("honours a day-of-week restriction", () => {
    const day = new Date(2026, 5, 21); // some specific day
    const dow = day.getDay();
    expect(
      evaluateApplicableFees([{ ...baseFee, daysOfWeek: String(dow) }], { subtotal: 100, type: "pickup", at: day }),
    ).toHaveLength(1);
    expect(
      evaluateApplicableFees([{ ...baseFee, daysOfWeek: String((dow + 1) % 7) }], { subtotal: 100, type: "pickup", at: day }),
    ).toHaveLength(0);
  });
  it("applies a holidays-only fee only on a public holiday", () => {
    const fee = { ...baseFee, publicHolidaysOnly: true };
    expect(
      evaluateApplicableFees([fee], { subtotal: 100, type: "pickup", at: new Date(2026, 6, 4) }),
    ).toHaveLength(1); // Jul 4
    expect(
      evaluateApplicableFees([fee], { subtotal: 100, type: "pickup", at: new Date(2026, 6, 5) }),
    ).toHaveLength(0); // Jul 5
  });
});

describe("sumAppliedFees", () => {
  it("sums and rounds to cents", () => {
    expect(sumAppliedFees([{ name: "a", amount: 2.5 }, { name: "b", amount: 1.25 }])).toBe(3.75);
  });
});
