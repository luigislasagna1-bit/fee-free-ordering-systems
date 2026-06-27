import { describe, it, expect } from "vitest";
import {
  resolvePromotions,
  applyPromotions,
  totalPromoDiscount,
  type PromoInput,
  type ApplyContext,
} from "@/lib/promo-engine";

// ─── Factories ─────────────────────────────────────────────────────────────
// Safety-net coverage for the stacking resolver + eligibility gates BEFORE the
// promotions overhaul (coupon retirement, Visible/Hidden, targeting) touches
// this engine. The engine is the single discount authority for all 13 promo
// types, so these lock the cross-cutting behaviour.

let _seq = 0;
function mkPromo(o: Partial<PromoInput> = {}): PromoInput {
  return {
    id: `p${++_seq}`,
    name: "Promo",
    description: null,
    promotionType: "fixed_cart",
    isActive: true,
    stackingRule: "standard",
    orderType: "both",
    customerType: "any",
    minimumOrder: 0,
    rules: "{}",
    ruleConfig: { discountAmount: 5 },
    usedCount: 0,
    autoApply: true,
    couponCode: null,
    ...o,
  };
}

function mkCtx(o: Partial<ApplyContext> = {}): ApplyContext {
  return {
    orderType: "pickup",
    isNewCustomer: true,
    isMember: false,
    subtotal: 20,
    items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }],
    ...o,
  };
}

// ─── Stacking: Standard / Exclusive / Master ───────────────────────────────
describe("resolvePromotions — stacking matrix", () => {
  it("stacks two standard promos together", () => {
    const a = mkPromo({ ruleConfig: { discountAmount: 5 } });
    const b = mkPromo({ ruleConfig: { discountAmount: 3 } });
    const { results } = resolvePromotions([a, b], mkCtx());
    expect(results).toHaveLength(2);
  });

  it("an exclusive blocks standards (best exclusive wins)", () => {
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([ex, std], mkCtx());
    expect(results.map((r) => r.promoId)).toEqual([ex.id]);
    expect(blockedPromos.map((b) => b.promoId)).toContain(std.id);
  });

  it("masters ALWAYS apply alongside the winning exclusive", () => {
    const master = mkPromo({ stackingRule: "master", ruleConfig: { discountAmount: 2 } });
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results } = resolvePromotions([master, ex, std], mkCtx());
    const ids = results.map((r) => r.promoId).sort();
    expect(ids).toEqual([master.id, ex.id].sort());
  });

  it("between two exclusives the larger discount wins", () => {
    const small = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 3 } });
    const big = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 9 } });
    const { results } = resolvePromotions([small, big], mkCtx());
    expect(results.map((r) => r.promoId)).toEqual([big.id]);
  });

  it("a $0 exclusive (no matching items) must NOT block a real standard", () => {
    const inert = mkPromo({
      stackingRule: "exclusive",
      promotionType: "percentage_off",
      ruleConfig: { discountPercent: 50, groups: [{ id: "g", label: "", categoryIds: ["catNOPE"], itemIds: [] }] },
    });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results } = resolvePromotions([inert, std], mkCtx());
    expect(results.map((r) => r.promoId)).toEqual([std.id]);
  });

  it("a free_delivery exclusive DOES occupy the slot (counts as a benefit)", () => {
    const fd = mkPromo({ stackingRule: "exclusive", promotionType: "free_delivery", ruleConfig: {} });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    // free_delivery is delivery-only (B4) AND only occupies the exclusive slot
    // when it has real value (a non-$0 delivery fee) — so set a fee here.
    const { results, blockedPromos } = resolvePromotions([fd, std], mkCtx({ orderType: "delivery", deliveryFee: 5 }));
    expect(results.map((r) => r.type)).toContain("free_delivery");
    expect(blockedPromos.map((b) => b.promoId)).toContain(std.id);
  });

  it("a $0-fee free_delivery exclusive does NOT block a real standard discount", () => {
    const fd = mkPromo({ stackingRule: "exclusive", promotionType: "free_delivery", ruleConfig: {} });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    // Delivery order but $0 fee → free_delivery is worth nothing → std applies.
    const { results } = resolvePromotions([fd, std], mkCtx({ orderType: "delivery", deliveryFee: 0 }));
    expect(results.map((r) => r.promoId)).toEqual([std.id]);
  });
});

// ─── Coupon-gating split (autoApply vs coupon code) ─────────────────────────
describe("resolvePromotions — coupon code gating", () => {
  const coded = () => mkPromo({ autoApply: false, couponCode: "SAVE", ruleConfig: { discountAmount: 5 } });

  it("a code-gated promo applies ONLY when the matching code is entered", () => {
    expect(applyPromotions([coded()], mkCtx({ couponCode: "SAVE" }))).toHaveLength(1);
    expect(applyPromotions([coded()], mkCtx())).toHaveLength(0);
    expect(applyPromotions([coded()], mkCtx({ couponCode: "WRONG" }))).toHaveLength(0);
  });

  it("code match is case-insensitive", () => {
    expect(applyPromotions([coded()], mkCtx({ couponCode: "save" }))).toHaveLength(1);
  });

  it("an auto-apply promo applies with no code", () => {
    expect(applyPromotions([mkPromo()], mkCtx())).toHaveLength(1);
  });
});

// ─── isEligible restrictions (exercised through the resolver) ────────────────
describe("resolvePromotions — eligibility restrictions", () => {
  it("minimum order", () => {
    expect(applyPromotions([mkPromo({ minimumOrder: 50 })], mkCtx({ subtotal: 20 }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ minimumOrder: 50 })], mkCtx({ subtotal: 50 }))).toHaveLength(1);
  });

  it("order channel", () => {
    expect(applyPromotions([mkPromo({ orderType: "delivery" })], mkCtx({ orderType: "pickup" }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ orderType: "pickup" })], mkCtx({ orderType: "pickup" }))).toHaveLength(1);
  });

  it("customer type new / returning / member", () => {
    expect(applyPromotions([mkPromo({ customerType: "new" })], mkCtx({ isNewCustomer: false }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ customerType: "returning" })], mkCtx({ isNewCustomer: true }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ customerType: "member" })], mkCtx({ isMember: false }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ customerType: "member" })], mkCtx({ isMember: true }))).toHaveLength(1);
  });

  it("payment method (with card→online_card mapping)", () => {
    const p = () => mkPromo({ paymentMethodSlugs: '["online_card"]' });
    expect(applyPromotions([p()], mkCtx({ paymentMethod: "cash" }))).toHaveLength(0);
    expect(applyPromotions([p()], mkCtx({ paymentMethod: "card" }))).toHaveLength(1); // "card" maps to online_card
  });

  it("delivery zone", () => {
    const p = () => mkPromo({ deliveryZoneIds: '["z1"]' });
    expect(applyPromotions([p()], mkCtx({ orderType: "delivery", deliveryZoneId: "z2" }))).toHaveLength(0);
    expect(applyPromotions([p()], mkCtx({ orderType: "delivery", deliveryZoneId: "z1" }))).toHaveLength(1);
    expect(applyPromotions([p()], mkCtx({ orderType: "pickup" }))).toHaveLength(0); // zone-restricted ⇒ non-delivery fails
  });

  it("global usage limit", () => {
    expect(applyPromotions([mkPromo({ usageLimit: 5, usedCount: 5 })], mkCtx())).toHaveLength(0);
    expect(applyPromotions([mkPromo({ usageLimit: 5, usedCount: 4 })], mkCtx())).toHaveLength(1);
  });

  it("once-per-lifetime via hasUsedLifetime", () => {
    const p = mkPromo({ onceLifetimePerClient: true });
    expect(applyPromotions([p], mkCtx({ hasUsedLifetime: { [p.id]: true } }))).toHaveLength(0);
    expect(applyPromotions([p], mkCtx({ hasUsedLifetime: {} }))).toHaveLength(1);
  });

  it("expiration window", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(applyPromotions([mkPromo({ endsAt: new Date("2026-05-01") })], mkCtx({ now }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ startsAt: new Date("2026-07-01") })], mkCtx({ now }))).toHaveLength(0);
    expect(applyPromotions([mkPromo({ startsAt: new Date("2026-05-01"), endsAt: new Date("2026-07-01") })], mkCtx({ now }))).toHaveLength(1);
  });

  it("inactive promos never apply", () => {
    expect(applyPromotions([mkPromo({ isActive: false })], mkCtx())).toHaveLength(0);
  });
});

// ─── Dead-field + dedup guards ──────────────────────────────────────────────
describe("resolvePromotions — guards", () => {
  it("limitedShowtimeSchedules does NOT gate eligibility (it is a render-only/dead field)", () => {
    const p = mkPromo({ limitedShowtimeSchedules: [{ dayOfWeek: 0, hourStart: 0, hourEnd: 1 }] as any });
    expect(applyPromotions([p], mkCtx())).toHaveLength(1);
  });

  it("the same promo passed twice is applied once (seen-set dedup)", () => {
    const p = mkPromo({ ruleConfig: { discountAmount: 5 } });
    expect(applyPromotions([p, p], mkCtx())).toHaveLength(1);
  });

  it("totalPromoDiscount caps at the subtotal", () => {
    const huge = mkPromo({ ruleConfig: { discountAmount: 9999 } });
    const results = applyPromotions([huge], mkCtx({ subtotal: 20 }));
    expect(totalPromoDiscount(results, 20)).toBe(20);
  });
});

// ─── Discount-math fixes (audit Batch A) ────────────────────────────────────
describe("engine math — Batch A correctness fixes", () => {
  // B1: "Fixed discount percentage" strategy must apply the typed percent, not
  // silently give the item away free (cheapestDiscount ?? 100).
  it("bogo fixed_percent applies discountPercent (50% off the unit, not free)", () => {
    const p = mkPromo({
      promotionType: "bogo",
      ruleConfig: {
        discountStrategy: "fixed_percent",
        discountPercent: 50,
        groups: [
          { id: "p", role: "paid", categoryIds: ["cat1"], itemIds: [] },
          { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
        ],
      },
    });
    const ctx = mkCtx({
      subtotal: 20,
      items: [{ menuItemId: "i1", categoryId: "cat1", price: 10, quantity: 2, subtotal: 20 }],
    });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(5); // 50% of one $10 unit, NOT $10 free
  });

  it("buy_n_get_free fixed_percent applies discountPercent to the freebie", () => {
    const p = mkPromo({
      promotionType: "buy_n_get_free",
      ruleConfig: {
        discountStrategy: "fixed_percent",
        discountPercent: 50,
        groups: [
          { id: "p", role: "paid", minCount: 1, categoryIds: ["cat1"], itemIds: [] },
          { id: "f", role: "free", categoryIds: ["cat2"], itemIds: [] },
        ],
      },
    });
    const ctx = mkCtx({
      subtotal: 18,
      items: [
        { menuItemId: "i1", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10 },
        { menuItemId: "i2", categoryId: "cat2", price: 8, quantity: 1, subtotal: 8 },
      ],
    });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(4); // 50% of the $8 freebie
  });

  // B7: meal_bundle must cap each group at maxCount units — extra qualifying
  // items beyond the slot size stay at full price, not folded into bundlePrice.
  it("meal_bundle caps the bundle at group.maxCount units (4 pizzas, slot=2)", () => {
    const p = mkPromo({
      promotionType: "meal_bundle",
      ruleConfig: {
        bundlePrice: 20,
        groups: [{ id: "g", role: "", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] }],
      },
    });
    const ctx = mkCtx({
      subtotal: 48,
      items: [{ menuItemId: "i1", categoryId: "cat1", price: 12, quantity: 4, subtotal: 48 }],
    });
    // Only the 2 slot units ($24) form the bundle → 24 - 20 = $4, NOT 48 - 20 = $28.
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(4);
  });

  // B4: free_delivery is delivery-only (forcedOrderTypes) — must not apply to
  // (or occupy an exclusive slot on) pickup/dine-in.
  it("free_delivery never applies on a pickup order, applies on delivery", () => {
    const fd = mkPromo({ promotionType: "free_delivery", ruleConfig: {} });
    expect(applyPromotions([fd], mkCtx({ orderType: "pickup" }))).toHaveLength(0);
    expect(applyPromotions([fd], mkCtx({ orderType: "delivery" })).map((r) => r.type)).toContain("free_delivery");
  });

  it("free_delivery exclusive on pickup does NOT block a real standard discount", () => {
    const fd = mkPromo({ stackingRule: "exclusive", promotionType: "free_delivery", ruleConfig: {} });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const res = applyPromotions([fd, std], mkCtx({ orderType: "pickup" }));
    expect(res.map((r) => r.promoId)).toEqual([std.id]); // fd ineligible on pickup → std applies
  });

  // B10: a free_delivery exclusive must win the slot at its real fee value, not $0.
  it("free_delivery exclusive beats a smaller exclusive at the delivery fee", () => {
    const fd = mkPromo({ stackingRule: "exclusive", promotionType: "free_delivery", ruleConfig: {} });
    const small = mkPromo({ stackingRule: "exclusive", promotionType: "fixed_cart", ruleConfig: { discountAmount: 2 } });
    const { results } = resolvePromotions([fd, small], mkCtx({ orderType: "delivery", deliveryFee: 7, subtotal: 30 }));
    expect(results.map((r) => r.type)).toContain("free_delivery");
    expect(results.map((r) => r.promoId)).not.toContain(small.id);
  });
});

// ─── Cross-TYPE stacking (audit M2) ─────────────────────────────────────────
// The prior matrix only mixed fixed_cart promos. These lock the stacking rules
// across DIFFERENT promo types, where the type-specific calcs are non-zero.
describe("resolvePromotions — cross-type stacking", () => {
  it("exclusive combo + standard % + master free_delivery: combo & free_delivery apply, % is blocked", () => {
    const combo = mkPromo({ stackingRule: "exclusive", promotionType: "fixed_combo", ruleConfig: { discountAmount: 10, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] } });
    const pct = mkPromo({ stackingRule: "standard", promotionType: "percentage_off", ruleConfig: { discountPercent: 10 } });
    const fd = mkPromo({ stackingRule: "master", promotionType: "free_delivery", ruleConfig: {} });
    const ctx = mkCtx({ orderType: "delivery", deliveryFee: 5, subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", price: 30, quantity: 1, subtotal: 30 }] });
    const { results, blockedPromos } = resolvePromotions([combo, pct, fd], ctx);
    const types = results.map((r) => r.type);
    expect(types).toContain("fixed_combo");
    expect(types).toContain("free_delivery");
    expect(blockedPromos.map((b) => b.promoId)).toContain(pct.id);
  });

  it("two exclusives of different types: the larger real discount wins", () => {
    const big = mkPromo({ stackingRule: "exclusive", promotionType: "percentage_off", ruleConfig: { discountPercent: 50 } }); // 50% of 20 = 10
    const small = mkPromo({ stackingRule: "exclusive", promotionType: "fixed_cart", ruleConfig: { discountAmount: 3 } });
    const ctx = mkCtx({ subtotal: 20, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }] });
    expect(resolvePromotions([big, small], ctx).results.map((r) => r.promoId)).toEqual([big.id]);
  });
});

// ─── Per-type debug fixes (group overlap, combos, bundles, free_item) ────────
describe("engine math — per-type debug fixes", () => {
  it("percentage_off: overlapping groups count each item ONCE (no double-discount)", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 20, groups: [
      { id: "a", categoryIds: ["cat1"], itemIds: [] },
      { id: "b", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 100, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 2, subtotal: 100 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(20); // 20% of $100, NOT $200
  });

  it("percentage_combo: overlapping groups don't double-count the combo value", () => {
    const p = mkPromo({ promotionType: "percentage_combo", ruleConfig: { discountPercent: 50, groups: [
      { id: "a", categoryIds: ["cat1"], itemIds: [] },
      { id: "b", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 40, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 2, subtotal: 40 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(20); // 50% of $40, NOT $80
  });

  it("fixed_combo / percentage_combo with NO groups never act as a whole-cart discount", () => {
    expect(applyPromotions([mkPromo({ promotionType: "fixed_combo", ruleConfig: { discountAmount: 5, groups: [] } })], mkCtx())).toHaveLength(0);
    expect(applyPromotions([mkPromo({ promotionType: "percentage_combo", ruleConfig: { discountPercent: 50, groups: [] } })], mkCtx())).toHaveLength(0);
  });

  it("meal_bundle: overlapping slots can't claim the same unit twice", () => {
    const p = mkPromo({ promotionType: "meal_bundle", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, categoryIds: ["cat1"], itemIds: [] },
      { id: "b", minCount: 1, maxCount: 1, categoryIds: ["cat1"], itemIds: [] },
    ] } });
    // 1 unit can't fill 2 distinct slots → no bundle.
    expect(applyPromotions([p], mkCtx({ subtotal: 24, items: [{ menuItemId: "i1", categoryId: "cat1", price: 24, quantity: 1, subtotal: 24 }] }))).toHaveLength(0);
    // 2 units → both slots fill → eligible $48 - $20 = $28.
    expect(applyPromotions([p], mkCtx({ subtotal: 48, items: [{ menuItemId: "i1", categoryId: "cat1", price: 24, quantity: 2, subtotal: 48 }] }))[0]?.discount).toBe(28);
  });

  it("meal_bundle: minCount 0 is clamped to 1 (no auto-satisfy on an empty slot)", () => {
    const p = mkPromo({ promotionType: "meal_bundle", ruleConfig: { bundlePrice: 5, groups: [
      { id: "a", minCount: 0, maxCount: 1, categoryIds: ["cat1"], itemIds: [] },
    ] } });
    expect(applyPromotions([p], mkCtx({ subtotal: 10, items: [{ menuItemId: "x", categoryId: "catOTHER", price: 10, quantity: 1, subtotal: 10 }] }))).toHaveLength(0);
  });

  it("meal_bundle_speciality: per-slot extraFee reduces the savings", () => {
    const p = mkPromo({ promotionType: "meal_bundle_speciality", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, extraFee: 5, categoryIds: ["cat1"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(5); // 30 - 20 - 5 fee
  });

  it("free_dish_meal: an overlapping trigger+free needs 2 units (a dish can't free itself)", () => {
    const p = mkPromo({ promotionType: "free_dish_meal", ruleConfig: { discountPercent: 100, groups: [
      { id: "t", role: "trigger", categoryIds: ["cat1"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    expect(applyPromotions([p], mkCtx({ subtotal: 20, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }] }))).toHaveLength(0);
    expect(applyPromotions([p], mkCtx({ subtotal: 40, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 2, subtotal: 40 }] }))[0]?.discount).toBe(20);
  });

  it("free_item: the freed unit can't unlock its own trigger (no $0 self-bootstrap)", () => {
    const p = mkPromo({ promotionType: "free_item", ruleConfig: { triggerAmount: 20, groups: [
      { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    // Only the freebie in cart → 20 - 20 = 0 < 20 → not applied.
    expect(applyPromotions([p], mkCtx({ subtotal: 20, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }] }))).toHaveLength(0);
    // Plus a $25 non-eligible item → 45 - 20 = 25 ≥ 20 → free $20.
    expect(applyPromotions([p], mkCtx({ subtotal: 45, items: [
      { menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 },
      { menuItemId: "i2", categoryId: "catOTHER", price: 25, quantity: 1, subtotal: 25 },
    ] }))[0]?.discount).toBe(20);
  });

  it("free_item: frees the CLAIMED freebie, not just the cheapest match", () => {
    const p = mkPromo({ promotionType: "free_item", ruleConfig: { triggerAmount: 0, groups: [
      { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 28, items: [
      { menuItemId: "cheap", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10 },
      { menuItemId: "claimed", categoryId: "cat1", price: 18, quantity: 1, subtotal: 18, isFreebie: true },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(18); // the claimed $18, not the $10
  });

  it("buy_n_get_free: overlapping paid+free reserves a unit (not the whole qty free)", () => {
    const p = mkPromo({ promotionType: "buy_n_get_free", ruleConfig: { groups: [
      { id: "p", role: "paid", minCount: 1, categoryIds: ["cat1"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    // 2 pizzas, overlap → 1 set (1 paid + 1 free) → 1 free ($20), NOT both free.
    expect(applyPromotions([p], mkCtx({ subtotal: 40, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 2, subtotal: 40 }] }))[0]?.discount).toBe(20);
    // 1 pizza → can't both buy and free it → nothing.
    expect(applyPromotions([p], mkCtx({ subtotal: 20, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }] }))).toHaveLength(0);
  });
});

describe("engine math — buy_n_get_free most-expensive default", () => {
  it("'most expensive' strategy defaults to 100% off (not $0)", () => {
    const p = mkPromo({ promotionType: "buy_n_get_free", ruleConfig: { discountStrategy: "most_expensive", groups: [
      { id: "p", role: "paid", minCount: 1, categoryIds: ["cat1"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["cat2"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 28, items: [
      { menuItemId: "paid", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10 },
      { menuItemId: "free", categoryId: "cat2", price: 18, quantity: 1, subtotal: 18 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(18);
  });
});
