import { describe, it, expect } from "vitest";
import { computePrice, type PizzaConfig, type PizzaCustomization } from "./PizzaBuilder";

// Minimal fixtures — computePrice only reads the fields below.
const config: PizzaConfig = {
  isPizza: true,
  allowHalfHalf: true,
  sauceGroupId: "s",
  cheeseGroupId: "c",
  toppingGroupIds: ["t"],
  includedToppings: 0,        // per-option price model
  extraToppingPrice: 0,
  halfToppingMultiplier: 0.5,
  extraQuantityMultiplier: 0,
};

const groups: any[] = [
  { id: "s", name: "Sauce", options: [{ id: "reg_s", name: "Regular Sauce", priceAdjustment: 0 }] },
  { id: "c", name: "Cheese", options: [
    { id: "reg_c", name: "Regular Cheese", priceAdjustment: 0 },
    { id: "extra_c", name: "Extra Cheese", priceAdjustment: 2.0 },
  ] },
  { id: "t", name: "Toppings", options: [{ id: "pep", name: "Pepperoni", priceAdjustment: 2.5 }] },
];

const item: any = { id: "i", name: "Pizza", price: 10, hasVariants: false, variants: [], modifierGroups: groups };

const base = (over: Partial<PizzaCustomization> = {}): PizzaCustomization => ({
  isHalfHalf: false,
  crustOptionId: null,
  sauceOptionId: null, leftSauceOptionId: null, rightSauceOptionId: null,
  cheeseOptionId: null, leftCheeseOptionId: null, rightCheeseOptionId: null,
  toppings: [],
  otherSelections: {},
  ...over,
});

const topping = (placement: "whole" | "left" | "right") => ({
  optionId: "pep", name: "Pepperoni", groupId: "t", placement, quantity: "normal" as const, unitPrice: 2.5,
});

describe("pizza pricing — half/half charges half", () => {
  it("whole topping = full price", () => {
    expect(computePrice(base({ toppings: [topping("whole")] }), null, item, groups, config)).toBe(12.5);
  });

  it("topping on ONE half = half price", () => {
    expect(computePrice(base({ toppings: [topping("left")] }), null, item, groups, config)).toBe(11.25); // 10 + 2.50*0.5
  });

  it("extra cheese on ONE half = half price", () => {
    const c = base({ isHalfHalf: true, leftCheeseOptionId: "extra_c", rightCheeseOptionId: "reg_c" });
    expect(computePrice(c, null, item, groups, config)).toBe(11.0); // 10 + 2.00*0.5
  });

  it("extra cheese on BOTH halves = full price (same as whole)", () => {
    const split = base({ isHalfHalf: true, leftCheeseOptionId: "extra_c", rightCheeseOptionId: "extra_c" });
    const whole = base({ cheeseOptionId: "extra_c" });
    expect(computePrice(split, null, item, groups, config)).toBe(12.0); // 10 + 1.00 + 1.00
    expect(computePrice(whole, null, item, groups, config)).toBe(12.0); // 10 + 2.00
  });

  it("whole pizza extra cheese (not split) stays full", () => {
    expect(computePrice(base({ cheeseOptionId: "extra_c" }), null, item, groups, config)).toBe(12.0);
  });
});

describe("pizza pricing — multiple of the same topping (count)", () => {
  const dbl = (placement: "whole" | "left" | "right", count: number) => ({
    optionId: "pep", name: "Pepperoni", groupId: "t", placement, quantity: "normal" as const, count, unitPrice: 2.5,
  });

  it("double pepperoni (whole) = 2× the topping price", () => {
    expect(computePrice(base({ toppings: [dbl("whole", 2)] }), null, item, groups, config)).toBe(15.0); // 10 + 2.50*2
  });

  it("triple pepperoni (whole) = 3×", () => {
    expect(computePrice(base({ toppings: [dbl("whole", 3)] }), null, item, groups, config)).toBe(17.5); // 10 + 2.50*3
  });

  it("double pepperoni on ONE half = 2× the HALF price", () => {
    expect(computePrice(base({ toppings: [dbl("left", 2)] }), null, item, groups, config)).toBe(12.5); // 10 + (2.50*0.5)*2
  });

  it("count defaults to 1 when absent", () => {
    const t = { optionId: "pep", name: "Pepperoni", groupId: "t", placement: "whole" as const, quantity: "normal" as const, unitPrice: 2.5 };
    expect(computePrice(base({ toppings: [t as any] }), null, item, groups, config)).toBe(12.5);
  });
});
