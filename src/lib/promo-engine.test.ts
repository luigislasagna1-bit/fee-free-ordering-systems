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
    const { results, blockedPromos } = resolvePromotions([fd, std], mkCtx());
    expect(results.map((r) => r.type)).toContain("free_delivery");
    expect(blockedPromos.map((b) => b.promoId)).toContain(std.id);
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
