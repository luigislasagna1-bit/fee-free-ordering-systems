/**
 * Gift-card promo exclusion (launch-readiness HIGH, Luigi 2026-07-01).
 *
 * A cart line flagged `promoExcluded` (MenuItem.promoExcluded OR its
 * category's flag — resolved by the routes) must never be discounted by ANY
 * promo type, never count toward a promo's minimum order / trigger, and cap
 * the whole-cart discountable base — otherwise a $10 coupon buys a $10 gift
 * card for $0 and mints free store credit.
 */
import { describe, it, expect } from "vitest";
import { applyPromotions, totalPromoDiscount, discountableSubtotal, type ApplyContext, type CartItem } from "./promo-engine";

const promo = (over: Partial<any>) => ({
  id: "p1",
  name: "Test promo",
  promotionType: "fixed_cart",
  isActive: true,
  stackingRule: "standard",
  orderType: "both",
  customerType: "any",
  minimumOrder: 0,
  rules: "{}",
  usedCount: 0,
  autoApply: true,
  ...over,
});

const pizza: CartItem = { menuItemId: "pizza", categoryId: "mains", price: 15, quantity: 1, subtotal: 15 };
const soda: CartItem = { menuItemId: "soda", categoryId: "drinks", price: 5, quantity: 1, subtotal: 5 };
const giftCard: CartItem = { menuItemId: "gift10", categoryId: "giftcards", price: 10, quantity: 1, subtotal: 10, promoExcluded: true };

const ctx = (items: CartItem[], over: Partial<ApplyContext> = {}): ApplyContext => ({
  orderType: "pickup",
  isNewCustomer: true,
  subtotal: items.reduce((s, i) => s + i.subtotal, 0),
  items,
  ...over,
});

describe("gift-card promo exclusion", () => {
  it("discountableSubtotal excludes flagged lines (and falls back to subtotal when none)", () => {
    expect(discountableSubtotal(ctx([pizza, giftCard]))).toBe(15);
    expect(discountableSubtotal(ctx([pizza, soda]))).toBe(20);
    expect(discountableSubtotal(ctx([giftCard]))).toBe(0);
  });

  it("fixed_cart: a $10 coupon can NOT buy a $10 gift card for free", () => {
    const p = promo({ promotionType: "fixed_cart", ruleConfig: { discountAmount: 10 }, couponCode: "TEN", autoApply: false });
    // Gift-card-only cart → $0 discount (was $10 → free store credit).
    const only = applyPromotions([p as any], ctx([giftCard], { couponCode: "TEN" }));
    expect(totalPromoDiscount(only, discountableSubtotal(ctx([giftCard])))).toBe(0);
    // Mixed cart → capped at the discountable (non-gift) part.
    const mixed = applyPromotions([promo({ promotionType: "fixed_cart", ruleConfig: { discountAmount: 20 }, couponCode: "TWENTY", autoApply: false }) as any],
      ctx([pizza, giftCard], { couponCode: "TWENTY" }));
    expect(totalPromoDiscount(mixed, discountableSubtotal(ctx([pizza, giftCard])))).toBe(15);
  });

  it("whole-cart percentage_off skips gift-card lines in its base", () => {
    const p = promo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 10 } });
    const results = applyPromotions([p as any], ctx([pizza, giftCard]));
    expect(results[0]?.discount).toBe(1.5); // 10% of $15, not of $25
  });

  it("grouped percentage_off never matches an excluded line even when targeted directly", () => {
    const p = promo({
      promotionType: "percentage_off",
      ruleConfig: { discountPercent: 50, groups: [{ itemIds: ["gift10"], categoryIds: ["giftcards"] }] },
    });
    const results = applyPromotions([p as any], ctx([pizza, giftCard]));
    expect(totalPromoDiscount(results, 15)).toBe(0);
  });

  it("minimumOrder counts gift cards as REAL spend for cart-discount promos (but still only discounts food) — Luigi 2026-07-06", () => {
    const p = promo({ promotionType: "percentage_off", minimumOrder: 20, ruleConfig: { discountPercent: 10 } });
    // $15 pizza + $10 gift = $25 spent → meets the $20 threshold (a gift card is
    // a real purchase). The discount is still 10% of the discountable $15 = $1.50
    // — the gift card is never discounted.
    const withGift = applyPromotions([p as any], ctx([pizza, giftCard]));
    expect(withGift).toHaveLength(1);
    expect(withGift[0]?.discount).toBe(1.5);
    // $15 pizza + $5 soda = $20 discountable → 10% of $20 = $2.
    expect(applyPromotions([p as any], ctx([pizza, soda]))[0]?.discount).toBe(2);
  });

  it("free_delivery: a gift-card purchase DOES count toward the spend minimum — the bug Luigi caught 2026-07-06", () => {
    const p = promo({ promotionType: "free_delivery", minimumOrder: 30, orderType: "delivery", ruleConfig: {} });
    // 3× $10 gift card = $30 delivery order → meets "$30+ = free delivery".
    const at = ctx([{ ...giftCard, quantity: 3, subtotal: 30 }], { orderType: "delivery", deliveryFee: 7.99 });
    expect(applyPromotions([p as any], at)).toHaveLength(1);
    // 2× $10 gift card = $20 → falls short of the $30 minimum.
    const under = ctx([{ ...giftCard, quantity: 2, subtotal: 20 }], { orderType: "delivery", deliveryFee: 7.99 });
    expect(applyPromotions([p as any], under)).toHaveLength(0);
  });

  it("free_item + reward_credit stay STRICT — gift-card spend can't mint free product or store credit", () => {
    // "Free soda when you spend $16", configured via the generic minimumOrder.
    const fi = promo({ promotionType: "free_item", minimumOrder: 16, ruleConfig: { groups: [{ role: "free", itemIds: ["soda"] }] } });
    // $30 gift + $5 soda: only $5 is discountable food → still blocked.
    expect(applyPromotions([fi as any], ctx([{ ...giftCard, quantity: 3, subtotal: 30 }, soda]))).toHaveLength(0);
    // "Spend $30 → earn store credit": a gift-card-only cart can't earn it.
    const rc = promo({ promotionType: "reward_credit", minimumOrder: 30, ruleConfig: {} });
    expect(applyPromotions([rc as any], ctx([{ ...giftCard, quantity: 3, subtotal: 30 }]))).toHaveLength(0);
  });

  it("free_item: a gift card can't unlock the trigger and can't be the freed item", () => {
    const p = promo({
      promotionType: "free_item",
      ruleConfig: { triggerAmount: 16, groups: [{ role: "free", itemIds: ["soda"] }] },
    });
    // pizza(15) + soda(5) + gift(10): discountable 20 − freed 5 = 15 < 16 → blocked.
    expect(applyPromotions([p as any], ctx([pizza, soda, giftCard]))).toHaveLength(0);
    // Same cart without the gift flagged (2 pizzas + soda): 30 − 5 = 25 ≥ 16 → frees the soda.
    const okCart = [pizza, { ...pizza, menuItemId: "pizza2" }, soda];
    const ok = applyPromotions([p as any], ctx(okCart));
    expect(ok[0]?.discount).toBe(5);
    // Free group targeting the gift card itself → nothing to free.
    const giftFree = promo({
      promotionType: "free_item",
      ruleConfig: { triggerAmount: 10, groups: [{ role: "free", itemIds: ["gift10"] }] },
    });
    expect(applyPromotions([giftFree as any], ctx([pizza, giftCard]))).toHaveLength(0);
  });

  it("bogo never frees a gift-card line", () => {
    const p = promo({
      promotionType: "bogo",
      ruleConfig: { groups: [{ itemIds: ["gift10", "pizza"], categoryIds: [] }] },
    });
    // Two qualifying units needed; the gift line is invisible to the group, so
    // one pizza alone can't trigger and the gift card is never the freebie.
    const results = applyPromotions([p as any], ctx([pizza, giftCard]));
    expect(totalPromoDiscount(results, 15)).toBe(0);
  });

  it("payment_reward base excludes gift-card lines", () => {
    const p = promo({ promotionType: "payment_reward", ruleConfig: { discountPercent: 10, paymentMethod: "online_card" } });
    const results = applyPromotions([p as any], ctx([pizza, giftCard], { paymentMethod: "card" }));
    expect(results[0]?.discount).toBe(1.5);
  });

  it("legacy carts without the flag behave exactly as before", () => {
    const p = promo({ promotionType: "fixed_cart", ruleConfig: { discountAmount: 10 } });
    const results = applyPromotions([p as any], ctx([pizza, soda]));
    expect(results[0]?.discount).toBe(10);
  });
});
