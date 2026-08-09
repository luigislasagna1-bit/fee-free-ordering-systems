import { describe, it, expect } from "vitest";
import { calcDiscount, type PromoInput, type ApplyContext } from "@/lib/promo-engine";

/**
 * A percentage promotion configured normally must SCALE with the size the
 * customer actually picks.
 *
 * Real report (Luigi's Lasagna, VIP member Alex, 2026-08-09): the "20% OFF Menu
 * Wide - VIP MEMBERS" promo gave a **$3.40** discount on a **40-wing** order.
 * $3.40 is 20% of $17.00 — the SMALLEST wing pack.
 *
 * The promo carried `freeItemExtraChargeMode: "addons_sizes"`, which resolves
 * the discount base to `baseNoSize` (the cheapest variant). That engine
 * behaviour is INTENTIONAL and is covered by promo-bogo-extra-charges.test.ts —
 * it is how a free-item deal bills the size upgrade. The defect was that the
 * promo wizard offered that setting on percentage promos under free-item
 * wording ("Charges on the FREE item"), so an owner could not tell what he was
 * choosing. The six affected promos were corrected and the wizard now uses
 * percentage wording plus an explicit warning on the size option.
 *
 * These tests pin the behaviour a correctly-configured percentage promo must
 * have, so a future change cannot quietly stop discounts scaling with size.
 */

const WINGS_SMALL = 17.0;
const WINGS_40 = 45.0;

/** A percentage promo as the wizard now writes it — no free-item basis key. */
function vip20(extra: Record<string, unknown> = {}): PromoInput {
  return {
    id: "vip20",
    name: "20% OFF Menu Wide - VIP MEMBERS",
    description: null,
    promotionType: "percentage_off",
    isActive: true,
    stackingRule: "standard",
    orderType: "both",
    customerType: "any",
    minimumOrder: 0,
    rules: "{}",
    ruleConfig: {
      discountPercent: 20,
      groups: [{ id: "g", categoryIds: ["wings"], itemIds: [] }],
      ...extra,
    },
    usedCount: 0,
    autoApply: true,
  } as unknown as PromoInput;
}

function wings(price: number, quantity = 1): ApplyContext {
  return {
    orderType: "pickup",
    isNewCustomer: false,
    isMember: true,
    subtotal: price * quantity,
    items: [{
      menuItemId: "wings", categoryId: "wings",
      price, quantity, subtotal: price * quantity,
      sizedBase: price, baseNoSize: WINGS_SMALL,
    }],
  } as unknown as ApplyContext;
}

describe("percentage promo — correctly configured (no free-item basis)", () => {
  it("gives 20% of the 40-wing price, not 20% of the small pack", () => {
    const discount = calcDiscount(vip20(), wings(WINGS_40));
    expect(discount).toBe(9.0);
    // $3.40 is the exact amount the customer wrongly received.
    expect(discount).not.toBe(3.4);
  });

  it("SCALES with the size — the property the misconfiguration destroyed", () => {
    const small = calcDiscount(vip20(), wings(WINGS_SMALL));
    const large = calcDiscount(vip20(), wings(WINGS_40));
    expect(small).toBe(3.4);
    expect(large).toBe(9.0);
    expect(large).toBeGreaterThan(small);
  });

  it("scales with quantity too", () => {
    expect(calcDiscount(vip20(), wings(WINGS_40, 2))).toBe(18.0);
  });

  it("whole-cart percentage (no item groups) discounts the full subtotal", () => {
    const p = vip20();
    (p as unknown as { ruleConfig: Record<string, unknown> }).ruleConfig = { discountPercent: 20 };
    expect(calcDiscount(p, wings(WINGS_40))).toBe(9.0);
  });
});

describe("the free-item basis remains available and unchanged", () => {
  // Documents the behaviour that made the misconfiguration so damaging, so the
  // trade-off stays visible to whoever reads this next. The wizard now warns
  // about exactly this before an owner can choose it.
  it("addons_sizes still pins the base to the cheapest size (intentional)", () => {
    const flat40 = calcDiscount(vip20({ freeItemExtraChargeMode: "addons_sizes" }), wings(WINGS_40));
    const flatSmall = calcDiscount(vip20({ freeItemExtraChargeMode: "addons_sizes" }), wings(WINGS_SMALL));
    expect(flat40).toBe(3.4);
    expect(flatSmall).toBe(3.4);
    // Identical discount regardless of size — why it must never be the default
    // for a plain "X% off".
    expect(flat40).toBe(flatSmall);
  });
});
