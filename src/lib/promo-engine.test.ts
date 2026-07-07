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

  it("a standard already in the cart is KEPT; the exclusive is offered as a switch (GloriaFood parity, Luigi 2026-07-07)", () => {
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([ex, std], mkCtx());
    expect(results.map((r) => r.promoId)).toEqual([std.id]);
    expect(blockedPromos.map((b) => b.promoId)).toContain(ex.id);
  });

  it("masters ALWAYS apply; with a standard present the standard is kept and the exclusive is a switch", () => {
    const master = mkPromo({ stackingRule: "master", ruleConfig: { discountAmount: 2 } });
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results } = resolvePromotions([master, ex, std], mkCtx());
    const ids = results.map((r) => r.promoId).sort();
    expect(ids).toEqual([master.id, std.id].sort());
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

  it("a free_delivery EXCLUSIVE counts as a benefit, so with a standard present it's a SWITCH, not auto-applied", () => {
    const fd = mkPromo({ stackingRule: "exclusive", promotionType: "free_delivery", ruleConfig: {} });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    // free_delivery is a real benefit at a non-$0 fee, so it's an eligible
    // exclusive — but a standard already in the cart is KEPT and the free_delivery
    // is offered as a switch (GloriaFood parity). Luigi 2026-07-07.
    const { results, blockedPromos } = resolvePromotions([fd, std], mkCtx({ orderType: "delivery", deliveryFee: 5 }));
    expect(results.map((r) => r.promoId)).toEqual([std.id]);
    expect(blockedPromos.map((b) => b.promoId)).toContain(fd.id);
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

  // B7: meal_bundle fills each group up to maxCount per bundle, and REPEATS for
  // every complete set of eligible units (GloriaFood parity, Luigi 2026-07-07) —
  // 4 pizzas at slot=2 form TWO "2 for $20" bundles, not one.
  it("meal_bundle repeats per full set (4 pizzas, slot=2 → 2 bundles)", () => {
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
    // Two bundles: 48 - 2×20 = $8 (each pair of $24 → $20).
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(8);
  });

  // Once-per-order caps a repeating bundle to a SINGLE application (only 2 of the
  // 4 pizzas fold; the other 2 stay at full price).
  it("meal_bundle honors oncePerOrder — a single bundle even with 4 eligible", () => {
    const p = mkPromo({
      promotionType: "meal_bundle",
      ruleConfig: {
        bundlePrice: 20, oncePerOrder: true,
        groups: [{ id: "g", role: "", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] }],
      },
    });
    const ctx = mkCtx({
      subtotal: 48,
      items: [{ menuItemId: "i1", categoryId: "cat1", price: 12, quantity: 4, subtotal: 48 }],
    });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(4); // one bundle: 24 - 20
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
  it("exclusive combo + standard % + master free_delivery: the % (standard) & free_delivery apply, combo is a switch (GloriaFood parity)", () => {
    const combo = mkPromo({ stackingRule: "exclusive", promotionType: "fixed_combo", ruleConfig: { discountAmount: 10, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] } });
    const pct = mkPromo({ stackingRule: "standard", promotionType: "percentage_off", ruleConfig: { discountPercent: 10 } });
    const fd = mkPromo({ stackingRule: "master", promotionType: "free_delivery", ruleConfig: {} });
    const ctx = mkCtx({ orderType: "delivery", deliveryFee: 5, subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", price: 30, quantity: 1, subtotal: 30 }] });
    const { results, blockedPromos } = resolvePromotions([combo, pct, fd], ctx);
    const types = results.map((r) => r.type);
    expect(types).toContain("percentage_off");
    expect(types).toContain("free_delivery");
    expect(blockedPromos.map((b) => b.promoId)).toContain(combo.id);
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

describe("engine breakdown — free_item / free_dish_meal name the dish", () => {
  it("free_item breakdown names the freed (cheapest eligible) dish + amount", () => {
    const p = mkPromo({ promotionType: "free_item", ruleConfig: { triggerAmount: 0, groups: [{ id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] }] } });
    const ctx = mkCtx({ subtotal: 30, items: [
      { menuItemId: "cheap", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10 },
      { menuItemId: "other", categoryId: "catX", price: 20, quantity: 1, subtotal: 20 },
    ] });
    const r = applyPromotions([p], ctx)[0];
    expect(r?.breakdown?.[0]?.menuItemId).toBe("cheap");
    expect(r?.breakdown?.[0]?.amount).toBe(10);
  });

  it("free_dish_meal breakdown reflects a PARTIAL discount (50% of the dish)", () => {
    const p = mkPromo({ promotionType: "free_dish_meal", ruleConfig: { discountPercent: 50, groups: [
      { id: "t", role: "trigger", categoryIds: ["catT"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["catF"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 40, items: [
      { menuItemId: "trig", categoryId: "catT", price: 20, quantity: 1, subtotal: 20 },
      { menuItemId: "dish", categoryId: "catF", price: 20, quantity: 1, subtotal: 20 },
    ] });
    const r = applyPromotions([p], ctx)[0];
    expect(r?.breakdown?.[0]?.menuItemId).toBe("dish");
    expect(r?.breakdown?.[0]?.amount).toBe(10); // 50% of $20
  });
});

describe("engine breakdown — per-line lineKey attribution (d, 2026-06-30)", () => {
  it("percentage_off: same dish on TWO lines → one breakdown line PER line (keyed by lineKey, not deduped)", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 50, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] } });
    const { results } = resolvePromotions([p], mkCtx({
      subtotal: 30,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10, lineKey: "0" },
        { menuItemId: "pizza", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20, lineKey: "2" }, // same dish, different line (e.g. extra mods)
      ],
    }));
    const bd = results.find((r) => r.type === "percentage_off")?.breakdown ?? [];
    expect(bd.length).toBe(2); // ← the bug: this used to be 1 (deduped by menuItemId)
    expect(bd.map((b) => b.lineKey).sort()).toEqual(["0", "2"]);
    expect(bd.find((b) => b.lineKey === "0")?.amount).toBe(5);  // 50% of 10
    expect(bd.find((b) => b.lineKey === "2")?.amount).toBe(10); // 50% of 20
  });

  it("percentage_off: legacy carts WITHOUT a lineKey keep the old dedup-by-dish behaviour", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 50, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] } });
    const { results } = resolvePromotions([p], mkCtx({
      items: [{ menuItemId: "pizza", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }],
    }));
    const bd = results.find((r) => r.type === "percentage_off")?.breakdown ?? [];
    expect(bd.length).toBe(1);
    expect(bd[0].lineKey).toBeUndefined();
    expect(bd[0].amount).toBe(10);
  });

  it("bogo: each freed unit's breakdown carries its source line's lineKey", () => {
    const p = mkPromo({ promotionType: "bogo", ruleConfig: { groups: [
      { id: "p", role: "paid", categoryIds: ["cat1"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] } });
    const { results } = resolvePromotions([p], mkCtx({
      subtotal: 30,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20, lineKey: "0" },
        { menuItemId: "pizza", categoryId: "cat1", price: 10, quantity: 1, subtotal: 10, lineKey: "1" },
      ],
    }));
    const bd = results.find((r) => r.type === "bogo")?.breakdown ?? [];
    expect(bd.length).toBeGreaterThanOrEqual(1);
    // every breakdown line is pinned to one of the two real cart lines
    for (const b of bd) expect(["0", "1"]).toContain(b.lineKey);
  });
});

describe("resolvePromotions — reward_credit (earn, not discount)", () => {
  it("is included with 0 discount + its type, so it snapshots into appliedPromos", () => {
    const rc = mkPromo({ promotionType: "reward_credit", stackingRule: "standard", ruleConfig: { creditAmount: 5 } });
    const { results } = resolvePromotions([rc], mkCtx());
    const hit = results.find((r) => r.type === "reward_credit");
    expect(hit).toBeTruthy();
    expect(hit!.discount).toBe(0);
    expect(hit!.creditAmount).toBe(5); // surfaced from ruleConfig for the cart "Earn $X"
  });

  it("creditAmount is set only for reward_credit (undefined for a normal discount)", () => {
    const fixed = mkPromo({ promotionType: "fixed_cart", ruleConfig: { discountAmount: 5 } });
    const r = applyPromotions([fixed], mkCtx())[0];
    expect(r.creditAmount).toBeUndefined();
  });

  it("always stacks — a winning exclusive does NOT block it", () => {
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const rc = mkPromo({ promotionType: "reward_credit", stackingRule: "standard", ruleConfig: { creditAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([ex, rc], mkCtx());
    expect(results.some((r) => r.type === "reward_credit")).toBe(true); // not blocked
    expect(results.some((r) => r.type === "fixed_cart")).toBe(true);    // exclusive still applies
    expect(blockedPromos.some((b) => b.promoId === rc.id)).toBe(false);
  });

  it("contributes nothing to the discount total", () => {
    const rc = mkPromo({ promotionType: "reward_credit", ruleConfig: { creditAmount: 99 } });
    const results = applyPromotions([rc], mkCtx());
    expect(totalPromoDiscount(results, 20)).toBe(0);
  });
});

// ─── Bundle / combo OWN their items — no double-discount with another item promo ─
// Luigi 2026-07-07: a screenshot showed 2 loose pizzas ($73.23) getting BOTH a
// "2 pizzas for $30" auto meal_bundle AND a BOGO on the SAME pizzas, netting far
// below the $30 bundle floor. Both were "standard" (the default), so the engine
// stacked them: each promo's calcDiscount ran over the SAME untouched ctx.items
// with no cross-promo unit accounting. A bundle/combo must CLAIM the units it
// prices so another item-targeting promo can't discount them a second time.
// Decision (Luigi): bundle/combo owns its items — the claiming promo keeps its
// units; the other item promo only sees what's left.
describe("bundle/combo claims its units (no double-discount)", () => {
  // "2 pizzas for $30" bundle: 2 pizzas @ $25 = $50 → bundle discount $20 (pair → $30).
  const bundle2for30 = () => mkPromo({
    promotionType: "meal_bundle",
    name: "2 pizzas for $30",
    ruleConfig: { bundlePrice: 30, groups: [
      { id: "g", role: "", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] },
    ] },
  });
  // BOGO on any pizza (cheapest 100% off) → frees one $25 pizza = $25 off.
  const bogoPizza = () => mkPromo({
    promotionType: "bogo",
    name: "BOGO pizza",
    ruleConfig: { discountStrategy: "cheapest", cheapestDiscount: 100, groups: [
      { id: "paid", role: "paid", categoryIds: ["cat1"], itemIds: [] },
      { id: "free", role: "free", categoryIds: ["cat1"], itemIds: [] },
    ] },
  });
  const twoPizzas = () => mkCtx({
    subtotal: 50,
    items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" }],
  });

  it("meal_bundle + BOGO on the SAME pizzas do not stack (bundle owns them)", () => {
    const { results } = resolvePromotions([bundle2for30(), bogoPizza()], twoPizzas());
    // The bundle claims both pizzas → BOGO has nothing left to free.
    const total = totalPromoDiscount(results, 50);
    expect(total).toBe(20);                       // bundle only, NOT 20 + 25 = 45
    const bogo = results.find((r) => r.type === "bogo");
    expect(bogo?.discount ?? 0).toBe(0);          // BOGO suppressed on claimed units
    expect(50 - total).toBeGreaterThanOrEqual(30); // pair never nets below the $30 floor
  });

  it("bundle on pizzas + BOGO on wings BOTH apply (disjoint items — no regression)", () => {
    const bogoWings = mkPromo({
      promotionType: "bogo", name: "BOGO wings",
      ruleConfig: { discountStrategy: "cheapest", cheapestDiscount: 100, groups: [
        { id: "paid", role: "paid", categoryIds: ["cat2"], itemIds: [] },
        { id: "free", role: "free", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 70,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "wings", categoryId: "cat2", price: 10, quantity: 2, subtotal: 20, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([bundle2for30(), bogoWings], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20); // 50 - 30
    expect(results.find((r) => r.type === "bogo")?.discount).toBe(10);        // one $10 wing free
  });

  it("bundle that gives no benefit does NOT block a BOGO (claims nothing when discount is 0)", () => {
    // Pizzas cost $28 total (< $30 bundle price) → bundle discount 0 → shouldn't claim.
    const ctx = mkCtx({
      subtotal: 28,
      items: [{ menuItemId: "pizza", categoryId: "cat1", price: 14, quantity: 2, subtotal: 28, lineKey: "L0" }],
    });
    const { results } = resolvePromotions([bundle2for30(), bogoPizza()], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount ?? 0).toBe(0);
    expect(results.find((r) => r.type === "bogo")?.discount).toBe(14); // BOGO still frees one $14 pizza
  });

  it("4 eligible pizzas: a repeating bundle claims all 4 → nothing left for BOGO", () => {
    // 4 pizzas @ $25 → TWO "2 for $30" bundles (−$20 each = −$40), all 4 claimed.
    const ctx = mkCtx({
      subtotal: 100,
      items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 4, subtotal: 100, lineKey: "L0" }],
    });
    const { results } = resolvePromotions([bundle2for30(), bogoPizza()], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(40); // 2 bundles
    expect(results.find((r) => r.type === "bogo")?.discount ?? 0).toBe(0);    // no pizzas left
    expect(totalPromoDiscount(results, 100)).toBe(40);
  });

  it("partial overlap with oncePerOrder: bundle takes 2 of 4, BOGO frees 1 of the leftover 2", () => {
    // Bundle once-per-order folds 2 pizzas ($50 → $30, −$20). 2 loose pizzas remain
    // → BOGO frees one ($25). Total $45; the 4 pizzas net $100 − 45 = $55.
    const bundleOnce = mkPromo({
      promotionType: "meal_bundle", name: "2 pizzas for $30 (once)",
      ruleConfig: { bundlePrice: 30, oncePerOrder: true, groups: [
        { id: "g", role: "", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 100,
      items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 4, subtotal: 100, lineKey: "L0" }],
    });
    const { results } = resolvePromotions([bundleOnce, bogoPizza()], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "bogo")?.discount).toBe(25);
    expect(totalPromoDiscount(results, 100)).toBe(45);
  });

  it("bundle claims its pizzas away from a grouped %-off (owns them)", () => {
    const pctPizza = mkPromo({
      promotionType: "percentage_off", name: "20% pizzas",
      ruleConfig: { discountPercent: 20, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] },
    });
    const { results } = resolvePromotions([bundle2for30(), pctPizza], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "percentage_off")?.discount ?? 0).toBe(0); // no pizzas left to %-off
  });

  it("whole-cart %-off skips fully-bundled items — never below the floor (Defect 1)", () => {
    const pctCart = mkPromo({
      promotionType: "percentage_off", name: "10% off order",
      ruleConfig: { discountPercent: 10 }, // no groups → whole cart
    });
    const { results } = resolvePromotions([bundle2for30(), pctCart], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    // The whole cart is one bundle → nothing left for the coupon → pair holds at $30.
    expect(results.find((r) => r.type === "percentage_off")?.discount ?? 0).toBe(0);
    expect(50 - totalPromoDiscount(results, 50)).toBe(30);
  });

  it("whole-cart %-off DOES apply to the non-bundled remainder", () => {
    const pctCart = mkPromo({
      promotionType: "percentage_off", name: "10% off order",
      ruleConfig: { discountPercent: 10 },
    });
    const ctx = mkCtx({
      subtotal: 60,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "drink", categoryId: "cat3", price: 10, quantity: 1, subtotal: 10, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([bundle2for30(), pctCart], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "percentage_off")?.discount).toBe(1); // 10% of the $10 drink only
  });

  it("bundle claims its pizza away from a free_item on the same group (owns it)", () => {
    const freePizza = mkPromo({
      promotionType: "free_item", name: "free pizza",
      ruleConfig: { groups: [{ id: "g", role: "free", categoryIds: ["cat1"], itemIds: [] }] },
    });
    const { results } = resolvePromotions([bundle2for30(), freePizza], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "free_item")?.discount ?? 0).toBe(0);
  });

  it("meal_bundle_speciality also owns its units vs a BOGO", () => {
    const spec = mkPromo({
      promotionType: "meal_bundle_speciality", name: "spec bundle",
      ruleConfig: { bundlePrice: 30, groups: [{ id: "g", minCount: 2, maxCount: 2, extraFee: 0, categoryIds: ["cat1"], itemIds: [] }] },
    });
    const { results } = resolvePromotions([spec, bogoPizza()], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle_speciality")?.discount).toBe(20);
    expect(results.find((r) => r.type === "bogo")?.discount ?? 0).toBe(0);
  });

  it("fixed_combo owns its combo items vs a BOGO on the same category", () => {
    // $10-off combo needs one pizza + one wing. It claims one of each; the BOGO on
    // pizzas then has only 1 pizza left → not enough for a pair → $0.
    const combo = mkPromo({
      promotionType: "fixed_combo", name: "$10 combo",
      ruleConfig: { discountAmount: 10, groups: [
        { id: "p", categoryIds: ["cat1"], itemIds: [] },
        { id: "w", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 45,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 1, subtotal: 25, lineKey: "L0" },
        { menuItemId: "wing", categoryId: "cat2", price: 20, quantity: 1, subtotal: 20, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([combo, bogoPizza()], ctx);
    expect(results.find((r) => r.type === "fixed_combo")?.discount).toBe(10);
    expect(results.find((r) => r.type === "bogo")?.discount ?? 0).toBe(0); // only 1 pizza left
  });

  it("two overlapping bundles: the better repeating deal claims every pair", () => {
    // 4 pizzas @ $25. bundleA "2 for $20" repeats twice (−$60, claims all 4) and,
    // being the bigger deal, goes first — bundleB "2 for $30" then finds nothing.
    const bundleA = mkPromo({ promotionType: "meal_bundle", name: "2 for $20", ruleConfig: { bundlePrice: 20, groups: [{ id: "g", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] }] } });
    const bundleB = bundle2for30();
    const ctx = mkCtx({ subtotal: 100, items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 4, subtotal: 100, lineKey: "L0" }] });
    const { results } = resolvePromotions([bundleB, bundleA], ctx);
    expect(results.find((r) => r.name === "2 for $20")?.discount).toBe(60); // 100 - 2×20
    expect(results.find((r) => r.name === "2 pizzas for $30")?.discount ?? 0).toBe(0); // no pizzas left
    expect(totalPromoDiscount(results, 100)).toBe(60);
  });

  it("fixed_combo discount can't exceed the value of the units it owns (adversarial Defect 3)", () => {
    // $60 combo claims one $20 pizza + one $5 wing = $25 owned. A grouped 100%-off
    // on pizzas then frees the OTHER pizza. The combo must not reach past its $25.
    const combo = mkPromo({
      promotionType: "fixed_combo", name: "$60 combo",
      ruleConfig: { discountAmount: 60, groups: [
        { id: "p", categoryIds: ["cat1"], itemIds: [] },
        { id: "w", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const pctPizza = mkPromo({
      promotionType: "percentage_off", name: "100% pizzas",
      ruleConfig: { discountPercent: 100, groups: [{ id: "g", categoryIds: ["cat1"], itemIds: [] }] },
    });
    const ctx = mkCtx({
      subtotal: 45,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 20, quantity: 2, subtotal: 40, lineKey: "L0" },
        { menuItemId: "wing", categoryId: "cat2", price: 5, quantity: 1, subtotal: 5, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([combo, pctPizza], ctx);
    expect(results.find((r) => r.type === "fixed_combo")?.discount).toBe(25); // capped at claimed $25, NOT $60
  });

  it("charge == preview: applyPromotions totals the same reduced discount", () => {
    // Same call both routes make; the fix lives in the shared resolver so both agree.
    const total = totalPromoDiscount(applyPromotions([bundle2for30(), bogoPizza()], twoPizzas()), 50);
    expect(total).toBe(20);
  });
});
