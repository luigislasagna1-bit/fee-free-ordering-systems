/**
 * buy_n_get_free free-item selection (Luigi 2026-07-03, "Buy 3 Pastas get
 * 1 PIZZA FREE"): the customer CHOSE a $24.99 pizza through the guided
 * wizard (tagged isFreebie), then added a $9.99 pizza to the cart — and the
 * engine moved the discount to the cheaper untagged pizza. A customer's
 * explicit pick must never be displaced; the configured strategy
 * (cheapest / most expensive) only decides among UNTAGGED candidates —
 * the same rule free_item and free_dish_meal already follow.
 */
import { describe, it, expect } from "vitest";
import { resolvePromotions, type ApplyContext, type CartItem } from "./promo-engine";

const promo = (strategy: "cheapest" | "most_expensive" = "cheapest") => ({
  id: "bngf1",
  name: "Buy 3 Pastas, get 1 PIZZA FREE !",
  promotionType: "buy_n_get_free",
  isActive: true,
  stackingRule: "standard",
  orderType: "pickup",
  customerType: "any",
  minimumOrder: 0,
  rules: "{}",
  ruleConfig: {
    discountStrategy: strategy,
    cheapestDiscount: 100,
    mostExpensiveDiscount: 100,
    groups: [
      { id: "g1", role: "paid", itemIds: [], variantIds: [], categoryIds: ["cat-pastas"], minCount: 3, maxCount: 3 },
      { id: "g2", role: "free", itemIds: [], variantIds: [], categoryIds: ["cat-pizzas"] },
    ],
  },
  usedCount: 0,
  autoApply: true,
});

const pasta = (key: string, price = 12.99): CartItem =>
  ({ menuItemId: `pasta-${key}`, categoryId: "cat-pastas", price, quantity: 1, subtotal: price, lineKey: key });
const pizza = (key: string, price: number, isFreebie = false): CartItem =>
  ({ menuItemId: `pizza-${key}`, categoryId: "cat-pizzas", price, quantity: 1, subtotal: price, lineKey: key, isFreebie });

const ctxWith = (items: CartItem[]): ApplyContext => ({
  orderType: "pickup",
  isNewCustomer: false,
  subtotal: Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100,
  items,
});

describe("buy_n_get_free — chosen freebie wins over the strategy", () => {
  const threePastas = [pasta("0"), pasta("1"), pasta("2")];

  it("frees the customer's CHOSEN (tagged) pizza", () => {
    const items = [...threePastas, pizza("3", 24.99, true)];
    const { results } = resolvePromotions([promo() as any], ctxWith(items));
    expect(results).toHaveLength(1);
    expect(results[0].discount).toBe(24.99);
    expect(results[0].breakdown).toEqual([{ menuItemId: "pizza-3", amount: 24.99, lineKey: "3" }]);
  });

  it("REGRESSION (Luigi's repro): a cheaper untagged pizza added later must NOT steal the discount", () => {
    const items = [...threePastas, pizza("3", 24.99, true), pizza("4", 9.99)];
    const { results } = resolvePromotions([promo("cheapest") as any], ctxWith(items));
    // Before the fix this was 9.99 on pizza-4 (strategy applied to the whole
    // pool). The chosen $24.99 pizza keeps its free status.
    expect(results[0].discount).toBe(24.99);
    expect(results[0].breakdown).toEqual([{ menuItemId: "pizza-3", amount: 24.99, lineKey: "3" }]);
  });

  it("UNTAGGED cart (built manually): the configured strategy decides — cheapest", () => {
    const items = [...threePastas, pizza("3", 24.99), pizza("4", 9.99)];
    const { results } = resolvePromotions([promo("cheapest") as any], ctxWith(items));
    expect(results[0].discount).toBe(9.99);
    expect(results[0].breakdown).toEqual([{ menuItemId: "pizza-4", amount: 9.99, lineKey: "4" }]);
  });

  it("UNTAGGED cart: most-expensive strategy frees the pricier pizza", () => {
    const items = [...threePastas, pizza("3", 24.99), pizza("4", 9.99)];
    const { results } = resolvePromotions([promo("most_expensive") as any], ctxWith(items));
    expect(results[0].discount).toBe(24.99);
    expect(results[0].breakdown).toEqual([{ menuItemId: "pizza-3", amount: 24.99, lineKey: "3" }]);
  });

  it("not enough paid-group items → no discount at all", () => {
    const items = [pasta("0"), pasta("1"), pizza("2", 24.99, true)];
    const { results } = resolvePromotions([promo() as any], ctxWith(items));
    expect(results.find((r) => r.promoId === "bngf1")?.discount ?? 0).toBe(0);
  });

  it("two qualifying sets, one tagged pick: tagged first, remainder by strategy", () => {
    const sixPastas = ["0", "1", "2", "3", "4", "5"].map((k) => pasta(k));
    const items = [...sixPastas, pizza("6", 24.99, true), pizza("7", 9.99)];
    const { results } = resolvePromotions([promo("cheapest") as any], ctxWith(items));
    // multiplier 2 → the tagged $24.99 AND the untagged $9.99 both go free.
    expect(results[0].discount).toBe(34.98);
    const ids = (results[0].breakdown ?? []).map((l) => l.menuItemId).sort();
    expect(ids).toEqual(["pizza-6", "pizza-7"]);
  });
});
