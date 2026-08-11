import { describe, expect, it } from "vitest";
import {
  compileComboLine,
  compilePizzaLine,
  placementPrefix,
  resolveOption,
  resolveVariant,
  type ComboData,
  type ItemData,
} from "./order-line-compiler";
import { isHalfToppingName } from "@/lib/pizza-topping-pricing";
import type { PizzaConfig } from "@/lib/pizza-config-parse";

/* ─────────────────────────────── fixtures ─────────────────────────────── */

const CRUST = {
  id: "g_crust",
  name: "Crust",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  pizzaRole: "crust" as const,
  options: [
    { modifierOptionId: "o_regular", name: "Regular Crust", priceAdjustment: 0, isDefault: true },
    { modifierOptionId: "o_thin", name: "Thin Crust", priceAdjustment: 0 },
  ],
};
const TOPPINGS = {
  id: "g_top",
  name: "Toppings",
  required: false,
  minSelect: 0,
  maxSelect: 10,
  pizzaRole: "toppings" as const,
  options: [
    { modifierOptionId: "o_pep", name: "Pepperoni", priceAdjustment: 2.5 },
    { modifierOptionId: "o_mush", name: "Mushrooms", priceAdjustment: 2.5 },
    { modifierOptionId: "o_olive", name: "Olives", priceAdjustment: 2.5 },
    { modifierOptionId: "o_onion", name: "Onion", priceAdjustment: 2.5 },
    { modifierOptionId: "o_bacon", name: "Bacon", priceAdjustment: 2.5 },
  ],
};

const pizzaCfg = (over: Partial<PizzaConfig> = {}): PizzaConfig => ({
  isPizza: true,
  allowHalfHalf: true,
  crustGroupId: "g_crust",
  toppingGroupIds: ["g_top"],
  includedToppings: 3,
  extraToppingPrice: 2.5,
  halfToppingMultiplier: 0.5,
  extraQuantityMultiplier: 0,
  reduceOnRemove: true,
  ...over,
});

const PIZZA = (over: Partial<ItemData> = {}): ItemData => ({
  menuItemId: "mi_pizza",
  name: "Build Your Own",
  price: 20,
  hasVariants: true,
  variants: [
    { variantId: "v_med", name: "Medium", price: 18 },
    { variantId: "v_lg", name: "Large", price: 24 },
  ],
  modifierGroups: [CRUST, TOPPINGS],
  pizzaConfig: pizzaCfg(),
  ...over,
});

/* ─────────────────────────── the half/half trap ───────────────────────── */

describe("half-and-half — the prefix is written by code, never by the model", () => {
  it("emits (L.H) / (R.H) with the trailing space the server matches on", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "mushrooms", placement: "right" },
        ],
      },
      PIZZA(),
    );
    expect(r.unresolved).toEqual([]);
    const names = r.line!.modifiers.map((m) => m.name);
    expect(names).toContain("(L.H) Pepperoni");
    expect(names).toContain("(R.H) Mushrooms");
    // The real server predicate must agree — this is the whole point.
    expect(isHalfToppingName("(L.H) Pepperoni")).toBe(true);
    expect(isHalfToppingName("(R.H) Mushrooms")).toBe(true);
  });

  it("marks untouched toppings (W) once the pizza is split, matching the builder", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "olives", placement: "whole" },
        ],
      },
      PIZZA(),
    );
    const olive = r.line!.modifiers.find((m) => m.name.includes("Olives"))!;
    expect(olive.name).toBe("(W) Olives");
    expect(isHalfToppingName(olive.name)).toBe(false); // (W) is NOT a half
  });

  it("does not prefix anything on a whole-pizza order", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA(),
    );
    expect(r.line!.modifiers.map((m) => m.name)).toContain("Pepperoni");
    expect(r.line!.modifiers.every((m) => !isHalfToppingName(m.name))).toBe(true);
  });

  it("refuses to split a pizza whose config disallows half-and-half", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", toppings: [{ name: "pepperoni", placement: "left" }], size: "large" },
      PIZZA({ pizzaConfig: pizzaCfg({ allowHalfHalf: false }) }),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/split/i);
  });

  it("placementPrefix keeps the mandatory trailing space", () => {
    expect(placementPrefix("left", true)).toBe("(L.H) ");
    expect(placementPrefix("right", false)).toBe("(R.H) ");
    expect(placementPrefix("whole", true)).toBe("(W) ");
    expect(placementPrefix("whole", false)).toBe("");
  });
});

/* ──────────────────────── per-unit expansion trap ─────────────────────── */

describe("per-unit semantics — double pepperoni is TWO entries", () => {
  it("expands count into repeated modifier entries", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni", count: 2 }] },
      PIZZA(),
    );
    const peps = r.line!.modifiers.filter((m) => m.modifierOptionId === "o_pep");
    expect(peps).toHaveLength(2);
  });
});

/* ───────────────────── the bare-preset-pizza money trap ───────────────── */

describe("preset seeding — a preset pizza can never arrive bare", () => {
  it("seeds presetToppings the caller did not mention", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large" },
      PIZZA({ pizzaConfig: pizzaCfg({ presetToppings: ["o_pep", "o_mush"] }) }),
    );
    const ids = r.line!.modifiers.map((m) => m.modifierOptionId);
    expect(ids).toContain("o_pep");
    expect(ids).toContain("o_mush");
  });

  it("does not double-add a preset the caller also asked for", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ pizzaConfig: pizzaCfg({ presetToppings: ["o_pep"] }) }),
    );
    expect(r.line!.modifiers.filter((m) => m.modifierOptionId === "o_pep")).toHaveLength(1);
  });
});

/* ───────────────────────── required-group trap ────────────────────────── */

describe("required groups — filled from defaults, or asked when the store says so", () => {
  it("auto-applies the default crust when the caller says nothing", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA());
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toContain("o_regular");
  });

  it("asks instead of defaulting when the store listed the group in pizzaAskGroups", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA(), {
      askGroupIds: ["g_crust"],
    });
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/which crust/i);
  });

  it("honours an explicitly requested crust", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", crust: "thin" }, PIZZA());
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toContain("o_thin");
  });
});

/* ─────────────────────── unknown / ambiguous input ────────────────────── */

describe("never guess — unresolved input blocks the order", () => {
  it("reports a topping that isn't on the menu instead of inventing an id", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pineapple" }] },
      PIZZA(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/pineapple/i);
  });

  it("asks for a size when the item is sized and none was said", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza" }, PIZZA());
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/which size/i);
  });

  it("refuses a sold-out item", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA({ isSoldOut: true }));
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/sold out/i);
  });

  it("matches plurals and casing from speech", () => {
    expect(resolveOption("mushroom", [TOPPINGS])?.modifierOptionId).toBe("o_mush");
    expect(resolveOption("MUSHROOMS", [TOPPINGS])?.modifierOptionId).toBe("o_mush");
    expect(resolveVariant("large", PIZZA().variants)?.variantId).toBe("v_lg");
  });
});

/* ───────────────────────── over-allowance money ───────────────────────── */

describe("price transparency — announce the over-allowance charge", () => {
  it("quotes the extra when the caller passes the included count", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni" },
          { name: "mushrooms" },
          { name: "olives" },
          { name: "onion" },
          { name: "bacon" },
        ],
      },
      PIZZA(),
    );
    // 5 toppings, 3 included, $2.50 each ⇒ $5.00 over.
    expect(r.pricingNote).toMatch(/5 toppings/);
    expect(r.pricingNote).toMatch(/\$5\.00 extra/);
  });

  it("says nothing extra when the caller stays within the allowance", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }, { name: "olives" }] },
      PIZZA(),
    );
    // Symmetric model: 2 of 3 included is CHEAPER than the standard build.
    expect(r.pricingNote).not.toMatch(/extra/);
  });

  it("uses the per-size topping price when the size overrides it", () => {
    const item = PIZZA({
      pizzaConfig: pizzaCfg({ variantToppingPrices: { Large: 4 } }),
    });
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni" },
          { name: "mushrooms" },
          { name: "olives" },
          { name: "onion" },
        ],
      },
      item,
    );
    // 4 toppings, 3 included, $4 each ⇒ $4.00 over (not $2.50).
    expect(r.pricingNote).toMatch(/\$4\.00 extra/);
  });
});

/* ──────────────────────────── combo compile ───────────────────────────── */

const WINGS: ItemData = {
  menuItemId: "mi_wings",
  name: "10pc Wings",
  price: 12,
  hasVariants: false,
  variants: [],
  modifierGroups: [],
  pizzaConfig: null,
};

const COMBO: ComboData = {
  menuItemId: "mi_combo",
  name: "Large / Wings Combo",
  price: 32,
  extrasCharge: false,
  slots: [
    { id: "s1", label: "Pizza", min: 1, max: 1, choices: [PIZZA()] },
    { id: "s2", label: "Wings", min: 1, max: 1, choices: [WINGS] },
  ],
};

describe("combo compile", () => {
  it("emits isCombo + non-empty bundleItems (the zero-child trap)", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo",
        picks: [
          { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
          { menuItemId: "mi_wings" },
        ],
      },
      COMBO,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line!.isCombo).toBe(true);
    expect(r.line!.bundleItems).toHaveLength(2);
    expect(r.line!.bundleItems![0].variantId).toBe("v_lg");
  });

  it("NEVER returns a combo line without children", () => {
    const r = compileComboLine({ menuItemId: "mi_combo", picks: [] }, COMBO);
    expect(r.line).toBeNull();
    expect(r.unresolved.length).toBeGreaterThan(0);
  });

  it("blocks until every slot minimum is met", () => {
    const r = compileComboLine(
      { menuItemId: "mi_combo", picks: [{ menuItemId: "mi_pizza", size: "large" }] },
      COMBO,
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Wings/);
  });

  it("carries half-and-half through to a pizza child inside the combo", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo",
        picks: [
          { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "bacon", placement: "right" }] },
          { menuItemId: "mi_wings" },
        ],
      },
      COMBO,
    );
    const child = r.line!.bundleItems!.find((c) => c.menuItemId === "mi_pizza")!;
    expect(child.modifiers.some((m) => m.name === "(R.H) Bacon")).toBe(true);
  });

  it("rejects a pick that belongs to no slot", () => {
    const r = compileComboLine(
      { menuItemId: "mi_combo", picks: [{ menuItemId: "mi_unknown" }, { menuItemId: "mi_wings" }] },
      COMBO,
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/isn't one of the choices/i);
  });
});
