import { describe, expect, it } from "vitest";
import { allocateToppingPool, allocateToppingPoolHalfUnits, type PoolChildInput } from "./combo-topping-pool";

const cfg = (extraToppingPrice: number, halfMult = 0.5) => ({
  extraToppingPrice,
  includedToppings: 99, // deliberately absurd — the pool must IGNORE it
  halfToppingMultiplier: halfMult,
});
const whole = (price = 2): { optionId: string; optionPrice: number; isHalf: boolean } =>
  ({ optionId: "opt", optionPrice: price, isHalf: false });
const half = (price = 2): { optionId: string; optionPrice: number; isHalf: boolean } =>
  ({ optionId: "opt", optionPrice: price, isHalf: true });
const pizza = (rate: number, lines: PoolChildInput["lines"]): PoolChildInput => ({ cfg: cfg(rate), lines });

describe("Luigi's worked examples", () => {
  it("2 large pizzas, 6 toppings combined — 1 + 5 all free, a 7th is charged", () => {
    const a = allocateToppingPool(6, [pizza(2, [whole()]), pizza(2, [whole(), whole(), whole(), whole(), whole()])]);
    expect(a.children[0].toppingTotal).toBe(0);
    expect(a.children[1].toppingTotal).toBe(0);
    expect(a.usedHalfUnits).toBe(12);

    const b = allocateToppingPool(6, [pizza(2, [whole()]), pizza(2, [whole(), whole(), whole(), whole(), whole(), whole()])]);
    expect(b.children[1].lineCharges).toEqual([0, 0, 0, 0, 0, 2]); // exactly the 7th
    expect(b.children[1].toppingTotal).toBe(2);
  });

  it("5 pizzas, 5 toppings combined — 1 each free; a 2nd on pizza 5 costs ITS rate", () => {
    // Pizza 5 carries a different rate to prove overage follows the pizza.
    const a = allocateToppingPool(5, [
      pizza(2, [whole()]), pizza(2, [whole()]), pizza(2, [whole()]), pizza(2, [whole()]),
      pizza(3.5, [whole(), whole()]),
    ]);
    expect(a.children.slice(0, 4).every((c) => c.toppingTotal === 0)).toBe(true);
    expect(a.children[4].lineCharges).toEqual([0, 3.5]); // exactly 1 extra at pizza 5's rate
  });
});

describe("half-units and pro-rata boundary", () => {
  it("a half topping consumes 1 credit; whole consumes 2", () => {
    const a = allocateToppingPool(1, [pizza(2, [half(), half()])]);
    expect(a.children[0].lineCharges).toEqual([0, 0]); // 2 halves = 1 whole credit
    expect(a.usedHalfUnits).toBe(2);
  });

  it("1 half-unit left against a whole line = half price (pro-rata)", () => {
    const a = allocateToppingPoolHalfUnits(3, [pizza(2, [whole(), whole()])]);
    expect(a.children[0].lineCharges).toEqual([0, 1]); // 2nd whole gets 1 of its 2 credits
  });

  it("halves price by the pizza's own multiplier", () => {
    const a = allocateToppingPool(0, [pizza(2, [half()])]);
    expect(a.children[0].lineCharges).toEqual([1]); // 2 × 0.5
    const b = allocateToppingPool(0, [{ cfg: cfg(2, 0.75), lines: [half()] }]);
    expect(b.children[0].lineCharges).toEqual([1.5]);
  });
});

describe("engine modes and edge cases", () => {
  it("per-option pizza (flat 0) still participates: credits cover, overage at option price", () => {
    const a = allocateToppingPool(1, [pizza(0, [whole(1.5), whole(2.5)])]);
    expect(a.children[0].lineCharges).toEqual([0, 2.5]);
  });

  it("pool exhausting mid-child crosses the child boundary correctly", () => {
    const a = allocateToppingPool(2, [pizza(2, [whole(), whole(), whole()]), pizza(2, [whole()])]);
    expect(a.children[0].lineCharges).toEqual([0, 0, 2]);
    expect(a.children[1].lineCharges).toEqual([2]);
  });

  it("sharedToppings 0 / negative / NaN → nothing free", () => {
    for (const n of [0, -3, NaN]) {
      const a = allocateToppingPool(n, [pizza(2, [whole()])]);
      expect(a.children[0].toppingTotal).toBe(2);
      expect(a.poolHalfUnits).toBe(0);
    }
  });

  it("ignores per-pizza includedToppings entirely", () => {
    // cfg() sets includedToppings: 99 — with a 0 pool everything still charges.
    const a = allocateToppingPool(0, [pizza(2, [whole(), whole()])]);
    expect(a.children[0].toppingTotal).toBe(4);
  });

  it("child order is the allocation order (determinism contract)", () => {
    const first = allocateToppingPool(1, [pizza(2, [whole()]), pizza(5, [whole()])]);
    expect(first.children[0].toppingTotal).toBe(0);
    expect(first.children[1].toppingTotal).toBe(5);
    const flipped = allocateToppingPool(1, [pizza(5, [whole()]), pizza(2, [whole()])]);
    expect(flipped.children[0].toppingTotal).toBe(0);
    expect(flipped.children[1].toppingTotal).toBe(2);
  });

  it("single child equals the legacy free-credit engine for whole lines", async () => {
    const { priceToppingLines } = await import("./pizza-topping-pricing");
    const lines = [whole(), whole(), whole()];
    const pool = allocateToppingPool(2, [pizza(2, lines)]);
    const legacy = priceToppingLines(
      { extraToppingPrice: 2, includedToppings: 2, halfToppingMultiplier: 0.5, reduceOnRemove: false },
      lines,
    );
    expect(pool.children[0].lineCharges).toEqual(legacy);
  });
});
