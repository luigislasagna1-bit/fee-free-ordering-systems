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

// ─── Committed exclusive bundle blocks standards (Fabrizio fix, 2026-07-08) ──
// A built exclusive meal_bundle is a pre-priced cart line stripped before the
// engine, so it never reached the resolver — letting a Standard (and a second
// exclusive) apply alongside it. ctx.committedExclusive re-injects the signal.
describe("resolvePromotions — committed exclusive bundle (GloriaFood parity)", () => {
  const committed = { id: "bundleX", name: "2 for 30" };

  it("Bug 1: a committed exclusive blocks a beneficial standard (offered as a switch)", () => {
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([std], mkCtx({ committedExclusive: committed }));
    expect(results.map((r) => r.promoId)).not.toContain(std.id);
    const b = blockedPromos.find((x) => x.promoId === std.id);
    expect(b?.winnerName).toBe("2 for 30");
    expect(b?.wasExclusive).toBe(false);
  });

  it("masters still stack alongside a committed exclusive", () => {
    const master = mkPromo({ stackingRule: "master", ruleConfig: { discountAmount: 2 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results } = resolvePromotions([master, std], mkCtx({ committedExclusive: committed }));
    expect(results.map((r) => r.promoId)).toEqual([master.id]);
  });

  it("Bug 3: a second qualifying exclusive is blocked (switchable) while a bundle is committed", () => {
    const ex2 = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const { results, blockedPromos } = resolvePromotions([ex2], mkCtx({ committedExclusive: committed }));
    expect(results.map((r) => r.promoId)).not.toContain(ex2.id);
    expect(blockedPromos.find((x) => x.promoId === ex2.id)?.wasExclusive).toBe(true);
  });

  it("b3d3e5ba preserved: WITHOUT the committed signal the standard is kept and the exclusive is a switch (new branch is inert)", () => {
    const ex = mkPromo({ stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = mkPromo({ stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([ex, std], mkCtx());
    expect(results.map((r) => r.promoId)).toEqual([std.id]);
    expect(blockedPromos.map((b) => b.promoId)).toContain(ex.id);
  });

  it("a COUPON-entered standard is also blocked by a committed exclusive (code surfaces in blockedPromos)", () => {
    // A typed code must not sneak past the exclusive slot — same rule as
    // auto-apply standards; the blocked entry keeps its couponCode so the UI
    // can explain which code was set aside.
    const coded = mkPromo({ autoApply: false, couponCode: "SAVE", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions(
      [coded],
      mkCtx({ committedExclusive: committed, couponCode: "SAVE" }),
    );
    expect(results.map((r) => r.promoId)).not.toContain(coded.id);
    const b = blockedPromos.find((x) => x.promoId === coded.id);
    expect(b?.winnerName).toBe("2 for 30");
    expect(b?.couponCode).toBe("SAVE");
  });

  it("the committed bundle's OWN promo auto-forming from loose items is blocked too (no double benefit)", () => {
    // The bundle line already carries the deal in its price. If the same
    // promotion would ALSO trigger from loose cart items, applying it in the
    // engine would discount twice. With the committed signal set, the engine
    // must not emit any discount for that promo id.
    const samePromo = mkPromo({
      id: "bundleX", // same id as the committed exclusive
      stackingRule: "exclusive",
      ruleConfig: { discountAmount: 8 },
    });
    const master = mkPromo({ stackingRule: "master", ruleConfig: { discountAmount: 2 } });
    const { results } = resolvePromotions([samePromo, master], mkCtx({ committedExclusive: committed }));
    expect(results.map((r) => r.promoId)).not.toContain("bundleX");
    expect(results.map((r) => r.promoId)).toContain(master.id);
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

  it("meal_bundle_speciality: the fee applies ONLY to the premium variant — base size is free (GloriaFood)", () => {
    // "Large = +$5"; a Regular/base pick in the same slot adds nothing. Luigi 2026-07-07.
    const p = mkPromo({ promotionType: "meal_bundle_speciality", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, extraFee: 5, categoryIds: ["cat1"], itemIds: [], specialityVariantIds: ["large"] },
    ] } });
    const large = mkCtx({ subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", variantId: "large", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], large)[0]?.discount).toBe(5);  // 30 - 20 - 5 (Large carries the fee)
    const regular = mkCtx({ subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", variantId: "regular", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], regular)[0]?.discount).toBe(10); // 30 - 20 - 0 (base pick is free)
  });

  it("meal_bundle_speciality: whole-item premium via specialityItemIds", () => {
    const p = mkPromo({ promotionType: "meal_bundle_speciality", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, extraFee: 5, categoryIds: ["cat1"], itemIds: [], specialityItemIds: ["premium"] },
    ] } });
    const prem = mkCtx({ subtotal: 30, items: [{ menuItemId: "premium", categoryId: "cat1", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], prem)[0]?.discount).toBe(5);   // 30 - 20 - 5
    const base = mkCtx({ subtotal: 30, items: [{ menuItemId: "basic", categoryId: "cat1", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], base)[0]?.discount).toBe(10);  // 30 - 20 - 0
  });

  it("meal_bundle_speciality: with NO speciality set, the fee still applies to every pick (backward compat)", () => {
    const p = mkPromo({ promotionType: "meal_bundle_speciality", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, extraFee: 5, categoryIds: ["cat1"], itemIds: [] },
    ] } });
    // Any variant → legacy behaviour: fee on every pick → 30 - 20 - 5.
    const ctx = mkCtx({ subtotal: 30, items: [{ menuItemId: "i1", categoryId: "cat1", variantId: "regular", price: 30, quantity: 1, subtotal: 30 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(5);
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

  it("fixed_combo exposes a grouped bundle card (GloriaFood-style combo grouping)", () => {
    const combo = mkPromo({
      promotionType: "fixed_combo", name: "combo $10",
      ruleConfig: { discountAmount: 10, groups: [
        { id: "p", categoryIds: ["cat1"], itemIds: [] },
        { id: "w", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 40,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 1, subtotal: 25, lineKey: "L0" },
        { menuItemId: "wing", categoryId: "cat2", price: 15, quantity: 1, subtotal: 15, lineKey: "L1" },
      ],
    });
    const r = resolvePromotions([combo], ctx).results.find((x) => x.type === "fixed_combo");
    expect(r?.discount).toBe(10);
    expect(r?.bundles?.length).toBe(1);
    expect(r?.bundles?.[0].saved).toBe(10);
    expect(r?.bundles?.[0].price).toBe(30); // 40 claimed − 10 off
    expect(r?.bundles?.[0].parts.map((p) => p.lineKey).sort()).toEqual(["L0", "L1"]);
  });

  it("charge == preview: applyPromotions totals the same reduced discount", () => {
    // Same call both routes make; the fix lives in the shared resolver so both agree.
    const total = totalPromoDiscount(applyPromotions([bundle2for30(), bogoPizza()], twoPizzas()), 50);
    expect(total).toBe(20);
  });

  it("bundle claims its pizzas away from a free_dish_meal on the same group (owns them)", () => {
    // free_dish_meal is the one ITEM-lane type never tested against a claim. Bundle
    // takes both pizzas → the free-dish promo (trigger + free both pizzas) finds none.
    const freeDish = mkPromo({
      promotionType: "free_dish_meal", name: "free pizza w/ meal",
      ruleConfig: { discountPercent: 100, groups: [
        { id: "t", role: "trigger", categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
      ] },
    });
    const { results } = resolvePromotions([bundle2for30(), freeDish], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "free_dish_meal")?.discount ?? 0).toBe(0);
  });

  it("bundle shrinks a buy_n_get_free's PAID group so the freebie can't unlock", () => {
    // Bundle claims the 2 pizzas → the buy_n_get_free (buy 2 pizzas, get a side)
    // has 0 paid pizzas left → its free side is never unlocked.
    const bng = mkPromo({
      promotionType: "buy_n_get_free", name: "buy 2 pizzas get a side",
      ruleConfig: { groups: [
        { id: "p", role: "paid", minCount: 2, categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 58,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "side", categoryId: "cat2", price: 8, quantity: 1, subtotal: 8, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([bundle2for30(), bng], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "buy_n_get_free")?.discount ?? 0).toBe(0);
  });

  it("percentage_combo OWNS its units vs a later BOGO on the same category", () => {
    // 20% combo (pizzas + wings) claims all its matching units; the BOGO on pizzas
    // then has none left.
    const combo = mkPromo({
      promotionType: "percentage_combo", name: "20% combo",
      ruleConfig: { discountPercent: 20, groups: [
        { id: "a", categoryIds: ["cat1"], itemIds: [] },
        { id: "b", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 60,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "wing", categoryId: "cat2", price: 10, quantity: 1, subtotal: 10, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([combo, bogoPizza()], ctx);
    expect(results.find((r) => r.type === "percentage_combo")?.discount).toBe(12); // 20% of $60
    expect(results.find((r) => r.type === "bogo")?.discount ?? 0).toBe(0);
  });

  it("percentage_combo oncePerOrder claims one-per-group; BOGO frees a leftover pizza", () => {
    // 50% once-per-order combo claims one $20 pizza + one $10 wing (−$15) and removes
    // those units. Of the 2 remaining pizzas the BOGO frees one ($20). Total $35.
    const combo = mkPromo({
      promotionType: "percentage_combo", name: "50% combo (once)",
      ruleConfig: { discountPercent: 50, oncePerOrder: true, groups: [
        { id: "a", categoryIds: ["cat1"], itemIds: [] },
        { id: "b", categoryIds: ["cat2"], itemIds: [] },
      ] },
    });
    const ctx = mkCtx({
      subtotal: 70,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 20, quantity: 3, subtotal: 60, lineKey: "L0" },
        { menuItemId: "wing", categoryId: "cat2", price: 10, quantity: 1, subtotal: 10, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([combo, bogoPizza()], ctx);
    expect(results.find((r) => r.type === "percentage_combo")?.discount).toBe(15);
    expect(results.find((r) => r.type === "bogo")?.discount).toBe(20);
    expect(totalPromoDiscount(results, 70)).toBe(35);
  });

  it("mixed-price cart: bundle claims the two $25s, BOGO frees a leftover $10 pizza", () => {
    // 2 pizzas @ $25 + 2 @ $10. The repeating "2 for $30" bundle folds the two $25s
    // (−$20); the next pass would be 2×$10 < $30, so it stops. BOGO frees one $10.
    const ctx = mkCtx({
      subtotal: 70,
      items: [
        { menuItemId: "pzA", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "pzB", categoryId: "cat1", price: 10, quantity: 2, subtotal: 20, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([bundle2for30(), bogoPizza()], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "bogo")?.discount).toBe(10);
    expect(totalPromoDiscount(results, 70)).toBe(30);
  });

  it("payment_reward base excludes bundled units (order-lane on the remainder)", () => {
    const pay = mkPromo({
      promotionType: "payment_reward", name: "10% any method",
      ruleConfig: { paymentMethod: "any", discountPercent: 10 },
    });
    const ctx = mkCtx({
      subtotal: 50, paymentMethod: "cash",
      items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" }],
    });
    const { results } = resolvePromotions([bundle2for30(), pay], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "payment_reward")?.discount ?? 0).toBe(0); // whole cart bundled
  });

  it("fixed_cart discounts only the non-bundled remainder", () => {
    const fixed = mkPromo({
      promotionType: "fixed_cart", name: "$10 off",
      ruleConfig: { discountAmount: 10 },
    });
    const ctx = mkCtx({
      subtotal: 58,
      items: [
        { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" },
        { menuItemId: "drink", categoryId: "cat3", price: 8, quantity: 1, subtotal: 8, lineKey: "L1" },
      ],
    });
    const { results } = resolvePromotions([bundle2for30(), fixed], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "fixed_cart")?.discount).toBe(8); // min($10, $8 remainder)
  });

  it("fixed_cart is $0 when the whole cart is bundled (floor protection)", () => {
    const fixed = mkPromo({
      promotionType: "fixed_cart", name: "$10 off",
      ruleConfig: { discountAmount: 10 },
    });
    const { results } = resolvePromotions([bundle2for30(), fixed], twoPizzas());
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20);
    expect(results.find((r) => r.type === "fixed_cart")?.discount ?? 0).toBe(0); // $0 remainder
    expect(50 - totalPromoDiscount(results, 50)).toBe(30); // pair holds at the $30 floor
  });
});

// ─── Strategy + once-per-order branches (bogo / buy_n_get_free / free_item) ──
// The matrix above only pins bogo fixed_percent and buy_n_get_free most_expensive.
// These lock the remaining discount-selection knobs so a strategy/cap regression
// is caught at the calc level. Luigi 2026-07-07.
describe("engine math — strategy + oncePerOrder branches", () => {
  const twoPizzas = (a: number, b: number) => mkCtx({
    subtotal: a + b,
    items: [
      { menuItemId: "pzA", categoryId: "cat1", price: a, quantity: 1, subtotal: a },
      { menuItemId: "pzB", categoryId: "cat1", price: b, quantity: 1, subtotal: b },
    ],
  });

  it("bogo most_expensive frees the pricier unit (100%)", () => {
    const p = mkPromo({ promotionType: "bogo", ruleConfig: {
      discountStrategy: "most_expensive", mostExpensiveDiscount: 100, groups: [
        { id: "p", role: "paid", categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
      ] } });
    expect(applyPromotions([p], twoPizzas(25, 18))[0]?.discount).toBe(25);
  });

  it("bogo cheapest with a PARTIAL cheapestDiscount (50%, not free)", () => {
    const p = mkPromo({ promotionType: "bogo", ruleConfig: {
      discountStrategy: "cheapest", cheapestDiscount: 50, groups: [
        { id: "p", role: "paid", categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
      ] } });
    expect(applyPromotions([p], twoPizzas(25, 18))[0]?.discount).toBe(9); // 50% of the $18
  });

  it("bogo oncePerOrder caps to ONE freed unit (not one per pair)", () => {
    const p = mkPromo({ promotionType: "bogo", ruleConfig: {
      discountStrategy: "cheapest", cheapestDiscount: 100, oncePerOrder: true, groups: [
        { id: "p", role: "paid", categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat1"], itemIds: [] },
      ] } });
    // 4 pizzas @ $20 → 2 pairs, but once-per-order → only 1 free.
    const ctx = mkCtx({ subtotal: 80, items: [{ menuItemId: "pz", categoryId: "cat1", price: 20, quantity: 4, subtotal: 80 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(20);
  });

  it("buy_n_get_free oncePerOrder caps to ONE freebie", () => {
    const p = mkPromo({ promotionType: "buy_n_get_free", ruleConfig: {
      oncePerOrder: true, cheapestDiscount: 100, groups: [
        { id: "p", role: "paid", minCount: 3, categoryIds: ["cat1"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["cat2"], itemIds: [] },
      ] } });
    // 6 pastas → 2 sets, capped to 1 → one $15 pizza free.
    const ctx = mkCtx({ subtotal: 90, items: [
      { menuItemId: "pasta", categoryId: "cat1", price: 10, quantity: 6, subtotal: 60 },
      { menuItemId: "pizza", categoryId: "cat2", price: 15, quantity: 2, subtotal: 30 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(15);
  });

  it("buy_n_get_free with TWO paid groups: the bottleneck group caps the multiplier", () => {
    const p = mkPromo({ promotionType: "buy_n_get_free", ruleConfig: { cheapestDiscount: 100, groups: [
      { id: "p", role: "paid", minCount: 2, categoryIds: ["cat1"], itemIds: [] },
      { id: "r", role: "required", minCount: 1, categoryIds: ["cat2"], itemIds: [] },
      { id: "f", role: "free", categoryIds: ["cat3"], itemIds: [] },
    ] } });
    // pizzas: floor(4/2)=2, drinks: floor(1/1)=1 → multiplier = 1 → one $6 side free.
    const ctx = mkCtx({ subtotal: 60, items: [
      { menuItemId: "pizza", categoryId: "cat1", price: 12, quantity: 4, subtotal: 48 },
      { menuItemId: "drink", categoryId: "cat2", price: 3, quantity: 1, subtotal: 3 },
      { menuItemId: "side", categoryId: "cat3", price: 6, quantity: 2, subtotal: 12 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(6);
  });

  it("free_item frees exactly ONE unit even with many eligible", () => {
    const p = mkPromo({ promotionType: "free_item", ruleConfig: { triggerAmount: 20, groups: [
      { id: "f", role: "free", categoryIds: ["cat2"], itemIds: [] },
    ] } });
    // $40 main + 3 sides @ $6 → trigger met, ONE $6 side free (not $18).
    const ctx = mkCtx({ subtotal: 58, items: [
      { menuItemId: "main", categoryId: "cat1", price: 40, quantity: 1, subtotal: 40 },
      { menuItemId: "side", categoryId: "cat2", price: 6, quantity: 3, subtotal: 18 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(6);
  });
});

// ─── Whole-cart / order-lane calculators, standalone ─────────────────────────
// %-off / fixed_cart / payment_reward are exercised through gift-card and bundle
// contexts elsewhere; these lock their headline math in isolation. Luigi 2026-07-07.
describe("engine math — whole-cart / order-lane standalone", () => {
  it("percentage_off (group-less): 15% of a clean $80 cart", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 15 } });
    const ctx = mkCtx({ subtotal: 80, items: [{ menuItemId: "i1", categoryId: "cat1", price: 80, quantity: 1, subtotal: 80 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(12);
  });

  it("fixed_cart clamps to a small discountable subtotal (non-gift path)", () => {
    const p = mkPromo({ promotionType: "fixed_cart", ruleConfig: { discountAmount: 25 } });
    const ctx = mkCtx({ subtotal: 18, items: [{ menuItemId: "i1", categoryId: "cat1", price: 18, quantity: 1, subtotal: 18 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(18); // min($25, $18)
  });

  it("percentage_off grouped, oncePerOrder OFF: 20% of every match across groups", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 20, groups: [
      { id: "a", categoryIds: ["catA"], itemIds: [] },
      { id: "b", categoryIds: ["catB"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 50, items: [
      { menuItemId: "a", categoryId: "catA", price: 10, quantity: 2, subtotal: 20 },
      { menuItemId: "b", categoryId: "catB", price: 30, quantity: 1, subtotal: 30 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(10); // 20% of $50
  });

  it("percentage_off grouped, oncePerOrder ON: 20% of one best unit PER group", () => {
    const p = mkPromo({ promotionType: "percentage_off", ruleConfig: { discountPercent: 20, oncePerOrder: true, groups: [
      { id: "a", categoryIds: ["catA"], itemIds: [] },
      { id: "b", categoryIds: ["catB"], itemIds: [] },
    ] } });
    const ctx = mkCtx({ subtotal: 80, items: [
      { menuItemId: "a", categoryId: "catA", price: 10, quantity: 2, subtotal: 20 },
      { menuItemId: "b", categoryId: "catB", price: 30, quantity: 2, subtotal: 60 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(8); // 20% of ($10 + $30)
  });

  it("payment_reward paymentMethod:'any' discounts every method", () => {
    const p = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethod: "any", discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount).toBe(5);
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount).toBe(5);
    expect(applyPromotions([p], mkCtx({ ...base }))[0]?.discount).toBe(5); // no method chosen yet
  });

  it("payment_reward returns $0 from the calc on the wrong method", () => {
    const p = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethod: "cash", discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    // Wrong method → calc 0 → no result emitted.
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount ?? 0).toBe(0);
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount).toBe(5);
  });

  it("payment_reward fails CLOSED when the restricted method is absent (no money leak)", () => {
    // A method-RESTRICTED reward must NOT apply when no payment method is present
    // (a crafted order request that omits paymentMethod, or the early cart before
    // a method is chosen). Otherwise the online-only discount leaks onto an order
    // the charge route stores as cash. Audit 2026-07-07.
    const online = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethod: "online_card", discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    expect(applyPromotions([online], mkCtx({ ...base }))[0]?.discount ?? 0).toBe(0); // no method → fail closed
    expect(applyPromotions([online], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount).toBe(5); // online → applies
    expect(applyPromotions([online], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount ?? 0).toBe(0); // cash → 0
  });

  it("payment_reward MULTI-SELECT applies to any method in the set, not others", () => {
    // "Pay online" = Card online OR PayPal, but NOT cash / card-in-person.
    // Luigi 2026-07-07 (multi-select checkboxes).
    const p = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethods: ["online_card", "paypal"], discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount).toBe(5); // online card ("card"→online_card)
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "paypal" }))[0]?.discount).toBe(5); // paypal
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount ?? 0).toBe(0); // cash → 0
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card_in_person" }))[0]?.discount ?? 0).toBe(0); // in-person → 0
    expect(applyPromotions([p], mkCtx({ ...base }))[0]?.discount ?? 0).toBe(0); // no method → fail closed
  });

  it("payment_reward MULTI-SELECT empty array = ANY method (unrestricted)", () => {
    const p = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethods: [], discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount).toBe(5);
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount).toBe(5);
    expect(applyPromotions([p], mkCtx({ ...base }))[0]?.discount).toBe(5); // no method chosen → still any
  });

  it("payment_reward MULTI-SELECT array wins over a stale legacy single value", () => {
    // Backward-compat safety: if both are present, the new array is authoritative.
    const p = mkPromo({ promotionType: "payment_reward", ruleConfig: { paymentMethods: ["cash"], paymentMethod: "online_card", discountPercent: 10 } });
    const base = { subtotal: 50, items: [{ menuItemId: "i1", categoryId: "cat1", price: 50, quantity: 1, subtotal: 50 }] };
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "cash" }))[0]?.discount).toBe(5); // array says cash → applies
    expect(applyPromotions([p], mkCtx({ ...base, paymentMethod: "card" }))[0]?.discount ?? 0).toBe(0); // legacy online ignored
  });
});

// ─── Bundle / combo determinism ──────────────────────────────────────────────
// The repeat/tie-break paths must be order-independent and repeat their per-slot
// costs on every instance. Luigi 2026-07-07.
describe("engine math — bundle/combo determinism", () => {
  it("meal_bundle_speciality: the per-slot extraFee is charged on EVERY repeat", () => {
    const p = mkPromo({ promotionType: "meal_bundle_speciality", ruleConfig: { bundlePrice: 20, groups: [
      { id: "a", minCount: 1, maxCount: 1, extraFee: 5, categoryIds: ["cat1"], itemIds: [] },
    ] } });
    // 2 units @ $30 → two bundles, each (30 - 20 - 5) = $5 → $10.
    const ctx = mkCtx({ subtotal: 60, items: [{ menuItemId: "i1", categoryId: "cat1", price: 30, quantity: 2, subtotal: 60 }] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(10);
  });

  it("multi-group meal_bundle repeats across every pair", () => {
    const p = mkPromo({ promotionType: "meal_bundle", ruleConfig: { bundlePrice: 30, groups: [
      { id: "pz", minCount: 1, maxCount: 1, categoryIds: ["cat1"], itemIds: [] },
      { id: "dr", minCount: 1, maxCount: 1, categoryIds: ["cat2"], itemIds: [] },
    ] } });
    // 4 pizzas @ $25 + 4 drinks @ $10 → four bundles, each (35 - 30) = $5 → $20.
    const ctx = mkCtx({ subtotal: 140, items: [
      { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 4, subtotal: 100 },
      { menuItemId: "drink", categoryId: "cat2", price: 10, quantity: 4, subtotal: 40 },
    ] });
    expect(applyPromotions([p], ctx)[0]?.discount).toBe(20);
  });

  it("two EQUAL bundles: only one applies, deterministic on input order", () => {
    const bundleA = mkPromo({ promotionType: "meal_bundle", name: "A", ruleConfig: { bundlePrice: 30, groups: [{ id: "g", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] }] } });
    const bundleB = mkPromo({ promotionType: "meal_bundle", name: "B", ruleConfig: { bundlePrice: 30, groups: [{ id: "g", minCount: 2, maxCount: 2, categoryIds: ["cat1"], itemIds: [] }] } });
    const ctx = mkCtx({ subtotal: 50, items: [{ menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" }] });
    const { results } = resolvePromotions([bundleA, bundleB], ctx);
    expect(totalPromoDiscount(results, 50)).toBe(20);
    const discounts = [results.find((r) => r.name === "A")?.discount ?? 0, results.find((r) => r.name === "B")?.discount ?? 0].sort();
    expect(discounts).toEqual([0, 20]); // exactly one wins the pair
  });

  it("two fixed_combos competing for one shared pizza are order-independent", () => {
    const c1 = mkPromo({ promotionType: "fixed_combo", name: "c1", ruleConfig: { discountAmount: 10, groups: [
      { id: "a", categoryIds: ["cat1"], itemIds: [] }, { id: "b", categoryIds: ["cat2"], itemIds: [] },
    ] } });
    const c2 = mkPromo({ promotionType: "fixed_combo", name: "c2", ruleConfig: { discountAmount: 15, groups: [
      { id: "a", categoryIds: ["cat1"], itemIds: [] }, { id: "b", categoryIds: ["cat3"], itemIds: [] },
    ] } });
    const ctx = () => mkCtx({ subtotal: 53, items: [
      { menuItemId: "pizza", categoryId: "cat1", price: 25, quantity: 1, subtotal: 25, lineKey: "L0" },
      { menuItemId: "wing", categoryId: "cat2", price: 20, quantity: 1, subtotal: 20, lineKey: "L1" },
      { menuItemId: "drink", categoryId: "cat3", price: 8, quantity: 1, subtotal: 8, lineKey: "L2" },
    ] });
    // c2 ($15) is the bigger deal → claims the lone pizza + a drink; c1 then starves.
    for (const order of [[c1, c2], [c2, c1]]) {
      const { results } = resolvePromotions(order, ctx());
      expect(totalPromoDiscount(results, 53)).toBe(15);
      expect(results.find((r) => r.name === "c2")?.discount).toBe(15);
      expect(results.find((r) => r.name === "c1")?.discount ?? 0).toBe(0);
    }
  });

  it("fixed_combo claims a unit off a qty>1 line at per-unit price, capped at owned value", () => {
    const combo = mkPromo({ promotionType: "fixed_combo", name: "big combo", ruleConfig: { discountAmount: 100, groups: [
      { id: "a", categoryIds: ["cat1"], itemIds: [] }, { id: "b", categoryIds: ["cat2"], itemIds: [] },
    ] } });
    // One $30 pizza + one $12 wing owned → capped at $42 (not $100, not $84).
    const ctx = mkCtx({ subtotal: 84, items: [
      { menuItemId: "pizza", categoryId: "cat1", price: 30, quantity: 2, subtotal: 60, lineKey: "L0" },
      { menuItemId: "wing", categoryId: "cat2", price: 12, quantity: 2, subtotal: 24, lineKey: "L1" },
    ] });
    expect(applyPromotions([combo], ctx)[0]?.discount).toBe(42);
  });
});

// ─── reward_credit sanitize + free_delivery emit-at-$0 ───────────────────────
describe("engine — reward_credit sanitize + free_delivery emit", () => {
  it("reward_credit sanitizes a bad creditAmount to 0 (no NaN, no negative)", () => {
    for (const bad of [-5, "abc", {}]) {
      const rc = mkPromo({ promotionType: "reward_credit", ruleConfig: { creditAmount: bad as any } });
      const r = applyPromotions([rc], mkCtx())[0];
      expect(r?.discount).toBe(0);
      expect(r?.creditAmount).toBe(0);
      expect(Number.isNaN(r?.creditAmount as number)).toBe(false);
    }
  });

  it("free_delivery on a delivery order is EMITTED even at a positive fee (discount 0)", () => {
    const fd = mkPromo({ promotionType: "free_delivery", ruleConfig: {} });
    const results = applyPromotions([fd], mkCtx({ orderType: "delivery", deliveryFee: 6, subtotal: 40 }));
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("free_delivery");
    expect(results[0].discount).toBe(0);
  });
});
