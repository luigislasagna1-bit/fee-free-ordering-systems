import { describe, it, expect } from "vitest";
import { priceToppingLines, isHalfToppingName, isLightToppingName } from "./pizza-topping-pricing";

const line = (optionId: string, over: Partial<{ optionPrice: number; isHalf: boolean; isLight: boolean }> = {}) => ({
  optionId, optionPrice: over.optionPrice ?? 2.5, isHalf: over.isHalf ?? false, isLight: over.isLight ?? false,
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

  it("light lines are free and consume no credit", () => {
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a", { isLight: true }), line("b")])).toEqual([0, 0]);
  });

  it("whole supersedes half: an option's half lines are ignored when it also has a whole line", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a"), line("a", { isHalf: true }), line("b", { isHalf: true })]))
      .toEqual([10, 0, 5]);
  });

  it("double topping (two lines) eats two credits", () => {
    const cfg = { extraToppingPrice: 3, includedToppings: 2, halfToppingMultiplier: 0.5 };
    expect(priceToppingLines(cfg, [line("a"), line("a"), line("b")])).toEqual([0, 0, 3]);
  });
});

describe("per-option model (extraToppingPrice = 0)", () => {
  const cfg = { extraToppingPrice: 0, includedToppings: 0, halfToppingMultiplier: 0.5 };
  it("charges each option's own price; halves × multiplier; light free", () => {
    expect(priceToppingLines(cfg, [
      line("a", { optionPrice: 2.5 }),
      line("b", { optionPrice: 2.5, isHalf: true }),
      line("c", { optionPrice: 4, isLight: true }),
    ])).toEqual([2.5, 1.25, 0]);
  });
  it("includedToppings grants nothing in this model (matches the builder)", () => {
    expect(priceToppingLines({ ...cfg, includedToppings: 3 }, [line("a", { optionPrice: 2 })])).toEqual([2]);
  });
});

describe("modifier-name helpers (serializer contract)", () => {
  it("detects half and light lines from the kitchen name format", () => {
    expect(isHalfToppingName("(L.H) Pepperoni")).toBe(true);
    expect(isHalfToppingName("(R.H) Anchovies, Light")).toBe(true);
    expect(isHalfToppingName("(W) Pepperoni")).toBe(false);
    expect(isHalfToppingName("Pepperoni")).toBe(false);
    expect(isLightToppingName("(W) Pepperoni, Light")).toBe(true);
    expect(isLightToppingName("Pepperoni")).toBe(false);
  });
});
