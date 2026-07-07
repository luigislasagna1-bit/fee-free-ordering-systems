import { describe, it, expect } from "vitest";
import { fixedDiscountMinError, isFixedDiscountType } from "@/lib/promo-validation";

describe("fixedDiscountMinError — min cart ≥ fixed discount (Luigi 2026-07-07)", () => {
  it("blocks a fixed_cart whose discount exceeds the minimum cart", () => {
    const err = fixedDiscountMinError("fixed_cart", { discountAmount: 30 }, 20);
    expect(err?.code).toBe("min_below_discount");
    expect(err?.discount).toBe(30);
  });

  it("blocks a fixed dollar discount with NO minimum set (0 / undefined)", () => {
    expect(fixedDiscountMinError("fixed_cart", { discountAmount: 30 }, 0)).not.toBeNull();
    expect(fixedDiscountMinError("fixed_cart", { discountAmount: 30 }, undefined)).not.toBeNull();
  });

  it("allows when the minimum meets or exceeds the discount", () => {
    expect(fixedDiscountMinError("fixed_cart", { discountAmount: 30 }, 30)).toBeNull();
    expect(fixedDiscountMinError("fixed_cart", { discountAmount: 30 }, 50)).toBeNull();
  });

  it("applies to fixed_combo as well", () => {
    expect(fixedDiscountMinError("fixed_combo", { discountAmount: 25 }, 10)).not.toBeNull();
    expect(fixedDiscountMinError("fixed_combo", { discountAmount: 25 }, 25)).toBeNull();
  });

  it("ignores non-fixed-dollar types (%-off, bundles, bogo)", () => {
    expect(fixedDiscountMinError("percentage_off", { discountPercent: 50 }, 0)).toBeNull();
    expect(fixedDiscountMinError("meal_bundle", { bundlePrice: 30 }, 0)).toBeNull();
    expect(fixedDiscountMinError("bogo", {}, 0)).toBeNull();
  });

  it("no-ops when there is no discount amount", () => {
    expect(fixedDiscountMinError("fixed_cart", {}, 0)).toBeNull();
    expect(fixedDiscountMinError("fixed_cart", { discountAmount: 0 }, 0)).toBeNull();
    expect(fixedDiscountMinError("fixed_cart", null, 0)).toBeNull();
  });

  it("isFixedDiscountType flags only the fixed-dollar types", () => {
    expect(isFixedDiscountType("fixed_cart")).toBe(true);
    expect(isFixedDiscountType("fixed_combo")).toBe(true);
    expect(isFixedDiscountType("percentage_off")).toBe(false);
    expect(isFixedDiscountType("meal_bundle")).toBe(false);
  });
});
