import { describe, it, expect } from "vitest";
import { resolvePromotions, totalPromoDiscount, type PromoInput, type ApplyContext } from "@/lib/promo-engine";

/**
 * GloriaFood-parity stacking matrix (Luigi 2026-07-06). Encodes the EXACT
 * combinations from the manual test protocol on a fixed $100 cart so the
 * "FeeFree" column of the comparison sheet is machine-verified. Any failure
 * here means the engine diverges from the documented Standard/Exclusive/Master
 * spec — investigate before trusting the live UI.
 *
 * Base promos (all whole-order, all auto-apply, all eligible on the $100 cart):
 *   A = Standard  $20 off      B = Standard  $5 off
 *   X = Exclusive $30 off      Y = Exclusive $15 off
 *   M = Master    $10 off      N = Master    $5 off
 *   Z = Exclusive but $0 benefit (targets a category not in the cart)
 */
let _seq = 0;
const P = (o: Partial<PromoInput> = {}): PromoInput => ({
  id: `p${++_seq}`, name: "Promo", description: null, promotionType: "fixed_cart",
  isActive: true, stackingRule: "standard", orderType: "both", customerType: "any",
  minimumOrder: 0, rules: "{}", ruleConfig: { discountAmount: 5 }, usedCount: 0,
  autoApply: true, couponCode: null, ...o,
});
const CART = (): ApplyContext => ({
  orderType: "pickup", isNewCustomer: true, isMember: false, subtotal: 100,
  items: [{ menuItemId: "i1", categoryId: "cat1", price: 100, quantity: 1, subtotal: 100 }],
});

const A = () => P({ name: "A std $20", stackingRule: "standard", ruleConfig: { discountAmount: 20 } });
const B = () => P({ name: "B std $5", stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
const X = () => P({ name: "X excl $30", stackingRule: "exclusive", ruleConfig: { discountAmount: 30 } });
const Y = () => P({ name: "Y excl $15", stackingRule: "exclusive", ruleConfig: { discountAmount: 15 } });
const M = () => P({ name: "M master $10", stackingRule: "master", ruleConfig: { discountAmount: 10 } });
const N = () => P({ name: "N master $5", stackingRule: "master", ruleConfig: { discountAmount: 5 } });
// Exclusive that TRIGGERS but yields $0 (percentage off a category not in cart).
const Z = () => P({ name: "Z excl $0", stackingRule: "exclusive", promotionType: "percentage_off",
  ruleConfig: { discountPercent: 50, groups: [{ id: "g", label: "", categoryIds: ["catNOPE"], itemIds: [] }] } });

/** Run a scenario → { appliedNames, blockedNames, total }. */
function run(promos: PromoInput[]) {
  const { results, blockedPromos } = resolvePromotions(promos, CART());
  return {
    applied: results.map((r) => r.name).sort(),
    blocked: blockedPromos.map((b) => b.name).sort(),
    total: totalPromoDiscount(results, 100),
  };
}

describe("GloriaFood parity — Standard / Exclusive / Master ($100 cart)", () => {
  it("S1  A alone (Standard) → A, $20", () => {
    const r = run([A()]); expect(r.applied).toEqual(["A std $20"]); expect(r.total).toBe(20);
  });
  it("S2  A + B (Std + Std) → BOTH stack, $25", () => {
    const r = run([A(), B()]); expect(r.applied).toEqual(["A std $20", "B std $5"]); expect(r.total).toBe(25);
  });
  it("S3  X alone (Exclusive) → X, $30", () => {
    const r = run([X()]); expect(r.applied).toEqual(["X excl $30"]); expect(r.total).toBe(30);
  });
  it("S4  X + A (Excl + Std) → KEEP the standard A ($20); X offered as a switch (GloriaFood parity, Luigi 2026-07-07)", () => {
    // Verified live: GloriaFood keeps the standard already in the cart and marks
    // the exclusive "incompatible — switch?"; it does NOT auto-apply the exclusive
    // (that was FeeFree's downgrade bug when the exclusive was smaller).
    const r = run([X(), A()]); expect(r.applied).toEqual(["A std $20"]); expect(r.blocked).toEqual(["X excl $30"]); expect(r.total).toBe(20);
  });
  it("S5  X + Y (Excl + Excl) → best wins = X ($30); Y blocked", () => {
    const r = run([X(), Y()]); expect(r.applied).toEqual(["X excl $30"]); expect(r.blocked).toEqual(["Y excl $15"]); expect(r.total).toBe(30);
  });
  it("S6  X + M (Excl + Master) → BOTH ($40); master stacks with exclusive", () => {
    const r = run([X(), M()]); expect(r.applied).toEqual(["M master $10", "X excl $30"]); expect(r.blocked).toEqual([]); expect(r.total).toBe(40);
  });
  it("S7  A + M (Std + Master) → BOTH, $30", () => {
    const r = run([A(), M()]); expect(r.applied).toEqual(["A std $20", "M master $10"]); expect(r.total).toBe(30);
  });
  it("S8  A + B + M (Std + Std + Master) → all three, $35", () => {
    const r = run([A(), B(), M()]); expect(r.applied).toEqual(["A std $20", "B std $5", "M master $10"]); expect(r.total).toBe(35);
  });
  it("S9  X + A + M (Excl + Std + Master) → KEEP A + M ($30); X offered as a switch (GloriaFood parity)", () => {
    const r = run([X(), A(), M()]); expect(r.applied).toEqual(["A std $20", "M master $10"]); expect(r.blocked).toEqual(["X excl $30"]); expect(r.total).toBe(30);
  });
  it("S10 X + Y + A + B + M (everything) → KEEP A + B + M ($35); X, Y offered as switches (GloriaFood parity)", () => {
    const r = run([X(), Y(), A(), B(), M()]);
    expect(r.applied).toEqual(["A std $20", "B std $5", "M master $10"]);
    expect(r.blocked).toEqual(["X excl $30", "Y excl $15"]);
    expect(r.total).toBe(35);
  });
  it("S11 Z(inert $0 exclusive) + A → A applies ($20); an inert exclusive blocks NOTHING", () => {
    const r = run([Z(), A()]); expect(r.applied).toEqual(["A std $20"]); expect(r.total).toBe(20);
  });
  it("S12 M + N (two Masters) → BOTH, $15", () => {
    const r = run([M(), N()]); expect(r.applied).toEqual(["M master $10", "N master $5"]); expect(r.total).toBe(15);
  });
});

// ─── blockedPromos metadata + the switch round-trip ─────────────────────────
// The cart's "Use this instead" card reads blockedPromos: `.wasExclusive` drives
// the suppress set, `.couponCode` matches the couponBlocked toast, `.winnerName`
// names the kept deal. Nothing in the parity matrix above asserts these fields or
// the transition a customer makes when they actually tap the switch. Luigi 2026-07-07.
describe("GloriaFood parity — blockedPromos metadata + switch round-trip", () => {
  it("keep-current: two exclusives blocked by a kept standard both carry wasExclusive + winnerName", () => {
    // X ($30 excl) + Y ($15 excl) + A ($20 std) → keep A; both exclusives are switches.
    const { results, blockedPromos } = resolvePromotions([X(), Y(), A()], CART());
    expect(results.map((r) => r.name)).toEqual(["A std $20"]);
    expect(blockedPromos.map((b) => b.name).sort()).toEqual(["X excl $30", "Y excl $15"]);
    for (const b of blockedPromos) {
      expect(b.wasExclusive).toBe(true);
      expect(b.winnerName).toBe("A std $20");
    }
  });

  it("no-standard: the losing exclusive carries wasExclusive + the winning exclusive's name", () => {
    // X ($30 excl) + Y ($15 excl), no standard → X wins; Y blocked by X.
    const { results, blockedPromos } = resolvePromotions([X(), Y()], CART());
    expect(results.map((r) => r.name)).toEqual(["X excl $30"]);
    expect(blockedPromos).toHaveLength(1);
    expect(blockedPromos[0]).toMatchObject({ name: "Y excl $15", wasExclusive: true, winnerName: "X excl $30" });
  });

  it("a coupon-gated exclusive blocked by a kept standard keeps its couponCode (drives the couponBlocked toast)", () => {
    const std = P({ name: "std $5", stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const ex = P({ name: "SAVE8 $8", stackingRule: "exclusive", autoApply: false, couponCode: "SAVE8", ruleConfig: { discountAmount: 8 } });
    const { results, blockedPromos } = resolvePromotions([std, ex], { ...CART(), couponCode: "SAVE8" });
    expect(results.map((r) => r.name)).toEqual(["std $5"]);
    expect(blockedPromos).toHaveLength(1);
    expect(blockedPromos[0]).toMatchObject({ name: "SAVE8 $8", couponCode: "SAVE8", wasExclusive: true });
  });

  it("the switch round-trip: kept standard → suppress it → the exclusive then applies", () => {
    const ex = P({ name: "ex $8", stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const std = P({ name: "std $5", stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    // Step 1: standard kept, exclusive offered as a switch.
    const step1 = resolvePromotions([ex, std], CART());
    expect(step1.results.map((r) => r.name)).toEqual(["std $5"]);
    expect(step1.blockedPromos.map((b) => b.promoId)).toEqual([ex.id]);
    // Step 2: the client suppresses the standard (drops it from the list) → the exclusive applies.
    const step2 = resolvePromotions([ex], CART());
    expect(step2.results.map((r) => r.name)).toEqual(["ex $8"]);
    expect(totalPromoDiscount(step2.results, 100)).toBe(8);
  });

  it("exclusive-vs-exclusive TIE keeps the first-listed (no re-render flicker)", () => {
    const a = P({ name: "a excl $10", stackingRule: "exclusive", ruleConfig: { discountAmount: 10 } });
    const b = P({ name: "b excl $10", stackingRule: "exclusive", ruleConfig: { discountAmount: 10 } });
    const { results, blockedPromos } = resolvePromotions([a, b], CART());
    expect(results.map((r) => r.promoId)).toEqual([a.id]);
    expect(blockedPromos.map((b) => b.promoId)).toEqual([b.id]);
  });
});

// ─── Master + free_delivery stacking (never a switch) ───────────────────────
describe("GloriaFood parity — masters stack, never blocked", () => {
  const DELIVERY = (): ApplyContext => ({
    orderType: "delivery", isNewCustomer: true, isMember: false, subtotal: 40, deliveryFee: 6,
    items: [{ menuItemId: "i1", categoryId: "cat1", price: 40, quantity: 1, subtotal: 40 }],
  });

  it("a master free_delivery stacks with a winning exclusive and is NEVER blocked", () => {
    const fd = P({ name: "fd master", stackingRule: "master", promotionType: "free_delivery", ruleConfig: {} });
    const ex = P({ name: "ex $8", stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const { results, blockedPromos } = resolvePromotions([fd, ex], DELIVERY());
    expect(results.map((r) => r.type).sort()).toEqual(["fixed_cart", "free_delivery"]);
    expect(blockedPromos.map((b) => b.promoId)).not.toContain(fd.id);
  });

  it("a master free_delivery on a PICKUP order is absent (forcedOrderTypes) and blocks nothing", () => {
    const fd = P({ name: "fd master", stackingRule: "master", promotionType: "free_delivery", ruleConfig: {} });
    const ex = P({ name: "ex $8", stackingRule: "exclusive", ruleConfig: { discountAmount: 8 } });
    const { results, blockedPromos } = resolvePromotions([fd, ex], CART()); // CART() is pickup
    expect(results.map((r) => r.type)).not.toContain("free_delivery");
    expect(results.map((r) => r.name)).toEqual(["ex $8"]); // exclusive alone applies
    expect(blockedPromos).toHaveLength(0);
  });

  it("keep-current holds when the kept standard is a claiming bundle and the exclusive is an item promo", () => {
    const bundle = P({
      name: "2 for $30", stackingRule: "standard", promotionType: "meal_bundle",
      ruleConfig: { bundlePrice: 30, groups: [{ id: "g", role: "", minCount: 2, maxCount: 2, categoryIds: ["pizzas"], itemIds: [] }] },
    });
    const ex = P({
      name: "BOGO pizza", stackingRule: "exclusive", promotionType: "bogo",
      ruleConfig: { discountStrategy: "cheapest", cheapestDiscount: 100, groups: [
        { id: "p", role: "paid", categoryIds: ["pizzas"], itemIds: [] },
        { id: "f", role: "free", categoryIds: ["pizzas"], itemIds: [] },
      ] },
    });
    const ctx: ApplyContext = {
      orderType: "pickup", isNewCustomer: true, isMember: false, subtotal: 50,
      items: [{ menuItemId: "pizza", categoryId: "pizzas", price: 25, quantity: 2, subtotal: 50, lineKey: "L0" }],
    };
    const { results, blockedPromos } = resolvePromotions([bundle, ex], ctx);
    expect(results.find((r) => r.type === "meal_bundle")?.discount).toBe(20); // bundle claims both pizzas
    expect(blockedPromos.map((b) => b.promoId)).toContain(ex.id);           // BOGO offered as a switch
  });

  it("an inert $0 master is silent — in neither results nor blockedPromos", () => {
    const m = P({
      name: "inert master", stackingRule: "master", promotionType: "percentage_off",
      ruleConfig: { discountPercent: 50, groups: [{ id: "g", label: "", categoryIds: ["catNOPE"], itemIds: [] }] },
    });
    const std = P({ name: "std $5", stackingRule: "standard", ruleConfig: { discountAmount: 5 } });
    const { results, blockedPromos } = resolvePromotions([m, std], CART());
    expect(results.map((r) => r.name)).toEqual(["std $5"]);
    expect(blockedPromos).toHaveLength(0);
  });
});
