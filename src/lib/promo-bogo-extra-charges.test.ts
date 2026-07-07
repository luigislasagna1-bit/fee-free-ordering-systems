import { describe, it, expect } from "vitest";
import { applyPromotions, type PromoInput, type ApplyContext } from "@/lib/promo-engine";

/**
 * GloriaFood-parity BOGO "extra charges" option (Luigi 2026-07-07). The free
 * item can free the WHOLE unit, just the sized base (charge toppings), or just
 * the un-sized base (charge size upgrade + toppings). Locks the money math for
 * all three modes + backward compatibility.
 *
 * Two pizzas, "buy one get one free" (cheapest 100% off) on a $43 cart:
 *   Pizza A (pricier): price 25 · sizedBase 20 · baseNoSize 15
 *   Pizza B (cheaper): price 18 · sizedBase 16 · baseNoSize 13   ← the freed one
 * So the freed amount is B's, split by mode:
 *   none         → 18 (whole pizza free)
 *   addons       → 16 (sized base free; the $2 of toppings still charged)
 *   addons_sizes → 13 (base free; the $3 size upgrade + $2 toppings charged)
 */
let _seq = 0;
const bogo = (mode?: string): PromoInput => ({
  id: `p${++_seq}`, name: "BOGO", description: null, promotionType: "bogo",
  isActive: true, stackingRule: "standard", orderType: "both", customerType: "any",
  minimumOrder: 0, rules: "{}", usedCount: 0, autoApply: true, couponCode: null,
  ruleConfig: {
    groups: [
      { id: "g1", role: "paid", categoryIds: ["pizzas"], itemIds: [] },
      { id: "g2", role: "free", categoryIds: ["pizzas"], itemIds: [] },
    ],
    discountStrategy: "cheapest",
    cheapestDiscount: 100,
    ...(mode ? { freeItemExtraChargeMode: mode } : {}),
  },
});

const twoPizzas = (withBreakdown = true): ApplyContext => ({
  orderType: "pickup", isNewCustomer: true, isMember: false, subtotal: 43,
  items: [
    { menuItemId: "pA", categoryId: "pizzas", price: 25, quantity: 1, subtotal: 25, ...(withBreakdown ? { sizedBase: 20, baseNoSize: 15 } : {}) },
    { menuItemId: "pB", categoryId: "pizzas", price: 18, quantity: 1, subtotal: 18, ...(withBreakdown ? { sizedBase: 16, baseNoSize: 13 } : {}) },
  ],
});

const discountOf = (p: PromoInput, ctx: ApplyContext) => applyPromotions([p], ctx)[0]?.discount ?? 0;

describe("BOGO extra-charges modes (GloriaFood parity)", () => {
  it("No extra charges (default) → frees the WHOLE cheaper pizza (−$18)", () => {
    expect(discountOf(bogo(), twoPizzas())).toBe(18);
    expect(discountOf(bogo("none"), twoPizzas())).toBe(18);
  });

  it("Charge extra for Choices/Add-ons → frees only the sized base (−$16, toppings still charged)", () => {
    expect(discountOf(bogo("addons"), twoPizzas())).toBe(16);
  });

  it("Charge extra for Choices/Add-ons & Sizes → frees only the un-sized base (−$13, size + toppings charged)", () => {
    expect(discountOf(bogo("addons_sizes"), twoPizzas())).toBe(13);
  });

  it("legacy carts without the breakdown fall back to the whole unit (no regression)", () => {
    // Even with a charge-extra mode set, a cart that doesn't send sizedBase/
    // baseNoSize frees the full price — behaviour is unchanged for old clients.
    expect(discountOf(bogo("addons"), twoPizzas(false))).toBe(18);
    expect(discountOf(bogo("addons_sizes"), twoPizzas(false))).toBe(18);
  });

  it("buy_n_get_free honors the same mode (shared freeing path)", () => {
    const bn = (mode?: string): PromoInput => ({
      ...bogo(mode), promotionType: "buy_n_get_free",
      ruleConfig: {
        groups: [
          { id: "g1", role: "required", categoryIds: ["pizzas"], itemIds: [], minCount: 1 },
          { id: "g2", role: "free", categoryIds: ["pizzas"], itemIds: [] },
        ],
        discountStrategy: "cheapest", cheapestDiscount: 100,
        ...(mode ? { freeItemExtraChargeMode: mode } : {}),
      },
    });
    expect(discountOf(bn("addons"), twoPizzas())).toBe(16);
  });
});
