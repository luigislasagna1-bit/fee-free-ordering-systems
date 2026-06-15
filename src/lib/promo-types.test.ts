import { describe, it, expect } from "vitest";
import { getPromoTypeMeta, isLockedType, PROMO_TYPES, LOCKED_PROMO_SLUGS } from "@/lib/promo-types";

describe("promo-types catalog", () => {
  it("looks up a type by slug", () => {
    expect(getPromoTypeMeta("percentage_off")?.tier).toBe("free");
    expect(getPromoTypeMeta("meal_bundle")?.tier).toBe("locked");
    expect(getPromoTypeMeta("does-not-exist")).toBeUndefined();
  });
  it("gates the advanced (locked) types behind the add-on", () => {
    expect(isLockedType("percentage_off")).toBe(false);
    expect(isLockedType("free_delivery")).toBe(false);
    expect(isLockedType("payment_reward")).toBe(true);
    expect(isLockedType("meal_bundle_speciality")).toBe(true);
  });
  it("forces delivery-only on the free-delivery promo", () => {
    expect(getPromoTypeMeta("free_delivery")?.forcedOrderTypes).toEqual(["delivery"]);
  });
  it("keeps the first four types free and the rest gated", () => {
    const free = PROMO_TYPES.filter((t) => t.tier === "free").map((t) => t.slug);
    expect(free).toEqual(["percentage_off", "free_delivery", "bogo", "fixed_cart"]);
    expect(LOCKED_PROMO_SLUGS.has("free_item")).toBe(true);
  });
});
