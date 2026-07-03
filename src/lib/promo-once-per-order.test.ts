/**
 * "Only allowed once per order" on percentage promos (Fabrizio cmqtmfp2n
 * follow-up, 2026-07-02). With the flag ON, a grouped %-off discounts ONE
 * unit — the single most expensive qualifying item (oneComboValue). That's
 * by design, but the cart must still NAME that item: the engine used to
 * return an empty breakdown for this path, so "20% ASPORTO −1,20 €" on a
 * €102 cart looked like broken math with no explanation.
 */
import { describe, it, expect } from "vitest";
import { resolvePromotions, type ApplyContext, type CartItem } from "./promo-engine";

const promo = (oncePerOrder: boolean) => ({
  id: "p1",
  name: "20% ASPORTO",
  promotionType: "percentage_off",
  isActive: true,
  stackingRule: "standard",
  orderType: "pickup",
  customerType: "any",
  minimumOrder: 25,
  rules: "{}",
  ruleConfig: { discountPercent: 20, oncePerOrder, groups: [{ id: "g1", itemIds: [], variantIds: [], categoryIds: ["cat-sushi"] }] },
  usedCount: 0,
  autoApply: true,
});

// Fabrizio's exact cart: 17× Salmon Chips @ €6.00 = €102.00.
const salmonChips: CartItem = { menuItemId: "salmon-chips", categoryId: "cat-sushi", price: 6, quantity: 17, subtotal: 102, lineKey: "0" };
const ctx: ApplyContext = { orderType: "pickup", isNewCustomer: false, subtotal: 102, items: [salmonChips] };

describe("percentage_off × oncePerOrder", () => {
  it("ON: discounts exactly ONE unit and the breakdown NAMES it (no more unexplained −1.20)", () => {
    const { results } = resolvePromotions([promo(true) as any], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].discount).toBe(1.2); // 20% of one €6 unit — by design
    // The cart can now show WHICH item carried the discount.
    expect(results[0].breakdown).toEqual([{ menuItemId: "salmon-chips", amount: 1.2, lineKey: "0" }]);
  });

  it("OFF: discounts every qualifying item — what Fabrizio expected (€20.40)", () => {
    const { results } = resolvePromotions([promo(false) as any], ctx);
    expect(results[0].discount).toBe(20.4); // 20% of €102
    expect(results[0].breakdown).toEqual([{ menuItemId: "salmon-chips", amount: 20.4, lineKey: "0" }]);
  });

  it("ON with multiple groups: one named unit per group, lines sum to the headline discount", () => {
    const twoGroups = {
      ...promo(true),
      ruleConfig: {
        discountPercent: 20,
        oncePerOrder: true,
        groups: [
          { id: "g1", itemIds: [], variantIds: [], categoryIds: ["cat-sushi"] },
          { id: "g2", itemIds: [], variantIds: [], categoryIds: ["cat-drinks"] },
        ],
      },
    };
    const drink: CartItem = { menuItemId: "sake", categoryId: "cat-drinks", price: 8, quantity: 2, subtotal: 16, lineKey: "1" };
    const { results } = resolvePromotions([twoGroups as any], { ...ctx, subtotal: 118, items: [salmonChips, drink] });
    const lines = results[0].breakdown ?? [];
    expect(lines).toHaveLength(2);
    const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    expect(sum).toBe(results[0].discount); // breakdown always reconciles to the headline
  });
});
