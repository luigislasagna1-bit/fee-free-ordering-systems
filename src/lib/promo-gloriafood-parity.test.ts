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
  it("S4  X + A (Excl + Std) → only X ($30); A blocked", () => {
    const r = run([X(), A()]); expect(r.applied).toEqual(["X excl $30"]); expect(r.blocked).toEqual(["A std $20"]); expect(r.total).toBe(30);
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
  it("S9  X + A + M (Excl + Std + Master) → X + M ($40); A blocked", () => {
    const r = run([X(), A(), M()]); expect(r.applied).toEqual(["M master $10", "X excl $30"]); expect(r.blocked).toEqual(["A std $20"]); expect(r.total).toBe(40);
  });
  it("S10 X + Y + A + B + M (everything) → X + M ($40); Y, A, B blocked", () => {
    const r = run([X(), Y(), A(), B(), M()]);
    expect(r.applied).toEqual(["M master $10", "X excl $30"]);
    expect(r.blocked).toEqual(["A std $20", "B std $5", "Y excl $15"]);
    expect(r.total).toBe(40);
  });
  it("S11 Z(inert $0 exclusive) + A → A applies ($20); an inert exclusive blocks NOTHING", () => {
    const r = run([Z(), A()]); expect(r.applied).toEqual(["A std $20"]); expect(r.total).toBe(20);
  });
  it("S12 M + N (two Masters) → BOTH, $15", () => {
    const r = run([M(), N()]); expect(r.applied).toEqual(["M master $10", "N master $5"]); expect(r.total).toBe(15);
  });
});
