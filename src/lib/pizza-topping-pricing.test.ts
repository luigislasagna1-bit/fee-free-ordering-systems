import { describe, it, expect } from "vitest";
import { priceToppingLines, priceToppingLinesForDisplay, toppingBaseAdjust, isHalfToppingName } from "./pizza-topping-pricing";

const line = (optionId: string, over: Partial<{ optionPrice: number; isHalf: boolean }> = {}) => ({
  optionId, optionPrice: over.optionPrice ?? 2.5, isHalf: over.isHalf ?? false,
});
const round2 = (n: number) => Math.round(n * 100) / 100;
/** The single money number both the preview + charge use for a pizza's toppings:
 *  base credit + per-line charges. */
const contribution = (cfg: any, lines: any[]) =>
  round2(toppingBaseAdjust(cfg) + priceToppingLines(cfg, lines).reduce((s, c) => s + c, 0));

// LEGACY flat model — free credits, no refund below the included count. Opt-in
// per pizza via reduceOnRemove:false.
describe("flat model — LEGACY free-credits (reduceOnRemove: false)", () => {
  it("Luigi's SUPER PARTY: $10/topping, 0 included — halves charge $5, wholes $10 (NOT the $2.50 option price)", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    const halves = Array.from({ length: 8 }, (_, i) => line(`t${i}`, { isHalf: true }));
    expect(priceToppingLines(cfg, halves)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(priceToppingLines(cfg, [line("w1")])).toEqual([10]);
    expect(toppingBaseAdjust(cfg)).toBe(0);
  });

  it("included credits: 1 included covers 1 whole or 2 halves", () => {
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    expect(priceToppingLines(cfg, [line("a"), line("b")])).toEqual([0, 2.5]);
    expect(priceToppingLines(cfg, [line("a", { isHalf: true }), line("b", { isHalf: true }), line("c", { isHalf: true })]))
      .toEqual([0, 0, 1.25]);
  });

  it("partial credit: 1 half-credit left discounts a whole by 50%", () => {
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    // half consumes 1 of 2 credits; the whole gets the remaining 1/2 credit.
    expect(priceToppingLines(cfg, [line("a", { isHalf: true }), line("b")])).toEqual([0, 1.25]);
  });

  it("no free ride: a whole + its own half lines are ALL charged (tamper-proof — kitchen makes all three)", () => {
    const cfg = { extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    expect(priceToppingLines(cfg, [line("a"), line("a", { isHalf: true }), line("b", { isHalf: true })]))
      .toEqual([10, 5, 5]);
  });

  it("double topping (two lines) eats two credits", () => {
    const cfg = { extraToppingPrice: 3, includedToppings: 2, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    expect(priceToppingLines(cfg, [line("a"), line("a"), line("b")])).toEqual([0, 0, 3]);
  });

  it("halfToppingMultiplier > 1 clamps to 1.0; negative clamps to 0", () => {
    expect(priceToppingLines({ extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: 1.5, reduceOnRemove: false }, [line("a", { isHalf: true })])).toEqual([10]);
    expect(priceToppingLines({ extraToppingPrice: 10, includedToppings: 0, halfToppingMultiplier: -0.5, reduceOnRemove: false }, [line("a", { isHalf: true })])).toEqual([0]);
  });
});

// SYMMETRIC "pay-per-topping" — the DEFAULT. Every topping is charged; the
// included allowance is a base credit, so the total = base + $flat×(count−included).
describe("flat model — SYMMETRIC pay-per-topping (default reduceOnRemove)", () => {
  // Meat Supreme: $20 list = $10 effective base + 5 incl @ $2. base credit = −$10.
  const cfg = { extraToppingPrice: 2, includedToppings: 5, halfToppingMultiplier: 0.5 };
  const wholes = (n: number) => Array.from({ length: n }, (_, i) => line(`t${i}`, { optionPrice: 2 }));

  it("base credit = −(included × flat)", () => {
    expect(toppingBaseAdjust(cfg)).toBe(-10);
  });
  it("every topping is charged the flat price (no free lines)", () => {
    expect(priceToppingLines(cfg, wholes(5))).toEqual([2, 2, 2, 2, 2]);
  });
  it("AT the included count → net topping contribution 0 (item stays its list price)", () => {
    expect(contribution(cfg, wholes(5))).toBe(0); // base $10 + $0 = $20 list
  });
  it("REMOVE below included → refunds per topping (4 → −$2, i.e. $18)", () => {
    expect(contribution(cfg, wholes(4))).toBe(-2);
  });
  it("ADD above included → +$flat per topping (6 → +$2, i.e. $22)", () => {
    expect(contribution(cfg, wholes(6))).toBe(2);
  });
  it("STRIP to zero → full base credit (0 → −$10, i.e. the $10 base)", () => {
    expect(contribution(cfg, [])).toBe(-10);
  });
  it("SWAP (still 5) → unchanged ($20)", () => {
    const swapped = [line("x", { optionPrice: 2 }), ...wholes(4)];
    expect(contribution(cfg, swapped)).toBe(0);
  });
  it("half toppings count as 0.5 (remove one half from 5 → −$1)", () => {
    // 4 wholes + 1 half = 4.5 units. contribution = base(−10) + 4×2 + 1×(2×0.5) = −10 + 8 + 1 = −1.
    expect(contribution(cfg, [...wholes(4), line("h", { optionPrice: 2, isHalf: true })])).toBe(-1);
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

// DISPLAY charges — the per-line "(+price)" shown on receipts/emails. Free
// included toppings must NOT print a surcharge (Luigi 2026-07-20); the money
// (item subtotal) is unchanged — it's base + toppingBaseAdjust + Σ priceToppingLines.
describe("priceToppingLinesForDisplay — receipt/email '(+price)' labels", () => {
  it("SYMMETRIC: the free included topping shows $0 even though the money-path charges it", () => {
    // Monday Medium Special: $flat 2.50, 1 included, default (symmetric).
    const cfg = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5 };
    // Money path charges the 1 topping flat (offset by the base credit)…
    expect(priceToppingLines(cfg, [line("chicken")])).toEqual([2.5]);
    expect(toppingBaseAdjust(cfg)).toBe(-2.5);
    // …but the receipt/display shows it FREE (no "(+$2.50)").
    expect(priceToppingLinesForDisplay(cfg, [line("chicken")])).toEqual([0]);
    // A 2nd topping is beyond the 1 included → it DOES show the charge.
    expect(priceToppingLinesForDisplay(cfg, [line("chicken"), line("pepperoni")])).toEqual([0, 2.5]);
  });

  it("SYMMETRIC reconciles: list price + Σ(display) === subtotal when count ≥ included", () => {
    const cfg = { extraToppingPrice: 2, includedToppings: 5, halfToppingMultiplier: 0.5 };
    const wholes = (n: number) => Array.from({ length: n }, (_, i) => line(`t${i}`, { optionPrice: 2 }));
    // 5 included → all free on the receipt (item stays its $20 list price).
    expect(priceToppingLinesForDisplay(cfg, wholes(5))).toEqual([0, 0, 0, 0, 0]);
    // 6th topping → +$2; Σ(display) === the amount the subtotal rises above list.
    expect(priceToppingLinesForDisplay(cfg, wholes(6))).toEqual([0, 0, 0, 0, 0, 2]);
    const dispSum = priceToppingLinesForDisplay(cfg, wholes(6)).reduce((s, c) => s + c, 0);
    expect(round2(dispSum)).toBe(round2(contribution(cfg, wholes(6)))); // both = +$2
  });

  it("LEGACY + per-option: identical to priceToppingLines (no behavior change)", () => {
    const legacy = { extraToppingPrice: 2.5, includedToppings: 1, halfToppingMultiplier: 0.5, reduceOnRemove: false };
    expect(priceToppingLinesForDisplay(legacy, [line("a"), line("b")]))
      .toEqual(priceToppingLines(legacy, [line("a"), line("b")]));
    const perOption = { extraToppingPrice: 0, includedToppings: 3, halfToppingMultiplier: 0.5 };
    expect(priceToppingLinesForDisplay(perOption, [line("a", { optionPrice: 4 }), line("b", { optionPrice: 0 })]))
      .toEqual([4, 0]); // $0 option already shows no "(+price)"
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
