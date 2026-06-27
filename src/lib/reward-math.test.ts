import { describe, it, expect } from "vitest";
import { computeApplied } from "@/lib/reward-math";

const base = { requested: 1000, balance: 50, orderTotal: 40, minRedeemBalance: 0, maxRedeemPercent: 100 };

describe("reward-math — computeApplied", () => {
  it("no balance / no order → noop", () => {
    expect(computeApplied({ ...base, balance: 0 })).toEqual({ applied: 0, code: "noop" });
    expect(computeApplied({ ...base, orderTotal: 0 })).toEqual({ applied: 0, code: "noop" });
  });

  it("below minimum redeem balance → below_min", () => {
    expect(computeApplied({ ...base, balance: 5, minRedeemBalance: 10 })).toEqual({ applied: 0, code: "below_min" });
  });

  it("clamps to the order total (can't apply more than owed)", () => {
    expect(computeApplied({ ...base, balance: 50, orderTotal: 40 }).applied).toBe(40);
  });

  it("clamps to the balance", () => {
    expect(computeApplied({ ...base, balance: 12, orderTotal: 40 }).applied).toBe(12);
  });

  it("honours the requested amount when below the ceiling", () => {
    expect(computeApplied({ ...base, requested: 7, balance: 50, orderTotal: 40 }).applied).toBe(7);
  });

  it("clamps to the max-redeem-percent cap", () => {
    // 50% of a $40 order = $20 max
    expect(computeApplied({ ...base, balance: 50, orderTotal: 40, maxRedeemPercent: 50 }).applied).toBe(20);
  });

  it("min-charge floor: leaves at least the processor minimum on the card", () => {
    // order $20, balance $19.50 → naive applied 19.50 leaves $0.50 < $1 min →
    // nudge so residual = $1 (apply $19.00)
    const r = computeApplied({ requested: 1000, balance: 19.5, orderTotal: 20, minRedeemBalance: 0, maxRedeemPercent: 100, minCharge: 1 });
    expect(r.applied).toBe(19);
  });

  it("min-charge floor: full-cover when balance ≥ total (no card charge)", () => {
    // order $20, balance $20, min charge $1 → fully cover, residual $0 (allowed)
    const r = computeApplied({ requested: 1000, balance: 20, orderTotal: 20, minRedeemBalance: 0, maxRedeemPercent: 100, minCharge: 1 });
    expect(r.applied).toBe(20);
  });
});
