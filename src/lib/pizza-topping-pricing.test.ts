import { describe, it, expect } from "vitest";
import { priceToppingLines, isHalfToppingName } from "./pizza-topping-pricing";

const line = (optionId: string, over: Partial<{ optionPrice: number; isHalf: boolean }> = {}) => ({
  optionId, optionPrice: over.optionPrice ?? 2.5, isHalf: over.isHalf ?? false,
});

describe("flat model (extraToppingPrice > 0)", () => {
  it("Luigi's SUPER PARTY: $10/topping, 0 included — halves charge $5, wholes $10 (NOT the $2.50 option price)", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 0.5 };
    const halves = Array.from({ length: 8 }, (_, i) => line(`t${i}`, { isHalf: true }));
    expect(priceToppingLines(cfg, halves)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(priceToppingLines(cfg, [line("w1")])).toEqual([10]);
  });

  it("included credits: 1 included covers 1 whole or 2 halves", () => {
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a"), line("b")])).toEqual([0, 2.5]);
    expect(priceToppingLines(cfg, [line("a", { isHalf: true }), line("b", { isHalf: true }), line("c", { isHalf: true })]))
      .toEqual([0, 0, 1.25]);
  });

  it("partial credit: 1 half-credit left discounts a whole by 50%", () => {
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5 };
    // half consumes 1 of 2 credits; the whole gets the remaining 1/2 credit.
    expect(priceToppingLines(cfg, [line("a", { isHalf: true }), line("b")])).toEqual([0, 1.25]);
  });

  it("Light is price-neutral: a light topping is priced + credited exactly like a normal one (Luigi 2026-07-06)", () => {
    // "Light" only means less of the topping — it's still a paid topping and
    // carries no surcharge/discount. The engine has no isLight input; light and
    // normal are indistinguishable to pricing, so relabelling can't discount.
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5 };
    // Two whole toppings, 1 credit (=2 half-units) → first free, second $2.50.
    // Identical whether either is served "light" — same result.
    expect(priceToppingLines(cfg, [line("a"), line("b")])).toEqual([0, 2.5]);
  });

  it("no free ride: a whole + its own half lines are ALL charged (tamper-proof — kitchen makes all three)", () => {
    // Regression for the red-teamed 'whole supersedes half' dedupe: a crafted
    // body sending whole "a" + (L.H) "a" + (R.H) "a" must be billed for every
    // line, not just the whole. Each line the kitchen prints is charged.
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a"), line("a", { isHalf: true }), line("b", { isHalf: true })]))
      .toEqual([10, 5, 5]);
  });

  it("double topping (two lines) eats two credits", () => {
    const cfg = { extraToppingPrice: 3, includedToppings: 2, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a"), line("a"), line("b")])).toEqual([0, 0, 3]);
  });

  it("halfToppingMultiplier > 1 clamps to 1.0 (matches the route's clamp — no preview/charge divergence)", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 1.5 };
    // A half topping is billed at flat × 1.0 = $10 (NOT the old ×0.5 fallback of $5).
    expect(priceToppingLines(cfg, [line("a", { isHalf: true })])).toEqual([10]);
  });

  it("negative halfToppingMultiplier clamps to 0", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: -0.5 };
    expect(priceToppingLines(cfg, [line("a", { isHalf: true })])).toEqual([0]);
  });
});

describe("per-option model (extraToppingPrice = 0)", () => {
  const cfg = { extraToppingPrice: 0, includedToppings: 0, halfToppingMultiplier: 0.5 };
  it("charges each option's own price; halves × multiplier (light does not discount)", () => {
    expect(priceToppingLines(cfg, [
      line("a", { optionPrice: 2.5 }),
      line("b", { optionPrice: 2.5, isHalf: true }),
      line("c", { optionPrice: 4 }),
    ])).toEqual([2.5, 1.25, 4]);
  });
  it("includedToppings grants nothing in this model (matches the builder)", () => {
    expect(priceToppingLines({ ...cfg, includedToppings: 3 }, [line("a", { optionPrice: 2 })])).toEqual([2]);
  });
});

describe("modifier-name helpers (serializer contract)", () => {
  it("detects half placement from the kitchen name format (light suffix never affects it)", () => {
    expect(isHalfToppingName("(L.H) Pepperoni")).toBe(true);
    expect(isHalfToppingName("(R.H) Anchovies, Light")).toBe(true);
    expect(isHalfToppingName("(W) Pepperoni")).toBe(false);
    expect(isHalfToppingName("Pepperoni")).toBe(false);
    expect(isHalfToppingName("Pepperoni, Light")).toBe(false);
  });
});
