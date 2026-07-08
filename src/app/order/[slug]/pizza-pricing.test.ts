import { describe, it, expect } from "vitest";
import { computePrice, resolveEffectivePizzaConfig, defaultCustomization, type PizzaConfig, type PizzaCustomization } from "./PizzaBuilder";

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

describe("resolveEffectivePizzaConfig — back-fill role ids from pizzaRole tags (Bug: base sauce had no half/half)", () => {
  const baseCfg: PizzaConfig = {
    isPizza: true, allowHalfHalf: true,
    toppingGroupIds: [], includedToppings: 0, extraToppingPrice: 0,
    halfToppingMultiplier: 0.5, extraQuantityMultiplier: 0,
  };

  it("unset sauceGroupId → back-fills from a group tagged pizzaRole=sauce", () => {
    const g: any[] = [{ id: "gsauce", libraryGroupId: "lib_sauce", pizzaRole: "sauce", options: [] }];
    const out = resolveEffectivePizzaConfig({ ...baseCfg, sauceGroupId: undefined }, g);
    expect(out.sauceGroupId).toBe("lib_sauce"); // prefers the library id configs store
  });

  it("uses the group id when it has no libraryGroupId", () => {
    const g: any[] = [{ id: "gsauce", pizzaRole: "sauce", options: [] }];
    expect(resolveEffectivePizzaConfig({ ...baseCfg }, g).sauceGroupId).toBe("gsauce");
  });

  it("leaves an EXPLICIT, still-attached sauceGroupId untouched (owner wins)", () => {
    const g: any[] = [
      { id: "explicit", pizzaRole: null, options: [] },
      { id: "tagged", pizzaRole: "sauce", options: [] },
    ];
    const out = resolveEffectivePizzaConfig({ ...baseCfg, sauceGroupId: "explicit" }, g);
    expect(out.sauceGroupId).toBe("explicit");
  });

  it("returns the SAME reference when nothing needs back-filling (no-op)", () => {
    const g: any[] = [{ id: "s", options: [] }];
    const cfg = { ...baseCfg, sauceGroupId: "s" };
    expect(resolveEffectivePizzaConfig(cfg, g)).toBe(cfg);
  });

  it("does NOT touch toppingGroupIds (server prices toppings via config → preview≠charge risk)", () => {
    const g: any[] = [{ id: "gt", pizzaRole: "topping", options: [] }];
    expect(resolveEffectivePizzaConfig({ ...baseCfg }, g).toppingGroupIds).toEqual([]);
  });

  it("back-fills crust + sauce + cheese together", () => {
    const g: any[] = [
      { id: "gc", pizzaRole: "crust", options: [] },
      { id: "gs", pizzaRole: "sauce", options: [] },
      { id: "gh", pizzaRole: "cheese", options: [] },
    ];
    const out = resolveEffectivePizzaConfig({ ...baseCfg }, g);
    expect([out.crustGroupId, out.sauceGroupId, out.cheeseGroupId]).toEqual(["gc", "gs", "gh"]);
  });
});

describe("defaultCustomization — Required default seeds for a back-filled, library-attached role group (review fix #1)", () => {
  const baseCfg: PizzaConfig = {
    isPizza: true, allowHalfHalf: true,
    toppingGroupIds: [], includedToppings: 0, extraToppingPrice: 0,
    halfToppingMultiplier: 0.5, extraQuantityMultiplier: 0,
  };
  // Instance id 'grp_abc' differs from the library id 'lib_sauce' the config stores.
  const sauceGroup: any = {
    id: "grp_abc", libraryGroupId: "lib_sauce", pizzaRole: "sauce", name: "PIZZA BASE SAUCE",
    required: true, minSelect: 1, maxSelect: 1,
    options: [
      { id: "gb", name: "Garlic Butter Base", priceAdjustment: 0, isDefault: true, isAvailable: true },
      { id: "ps", name: "Pizza Sauce Base", priceAdjustment: 0, isDefault: false, isAvailable: true },
    ],
  };
  const item: any = { id: "i", name: "Garlic Cheese Sticks", price: 11.99, hasVariants: false, variants: [], modifierGroups: [sauceGroup] };

  it("seeds sauceOptionId to the Required default (not null) after back-fill", () => {
    const cfg = resolveEffectivePizzaConfig({ ...baseCfg, sauceGroupId: undefined }, [sauceGroup]);
    expect(cfg.sauceGroupId).toBe("lib_sauce");
    const dc = defaultCustomization(item, cfg, [sauceGroup]);
    expect(dc.sauceOptionId).toBe("gb");              // pre-selected default survives
    expect(dc.otherSelections["grp_abc"]).toBeUndefined(); // NOT double-stored as an "other" group
  });
});
