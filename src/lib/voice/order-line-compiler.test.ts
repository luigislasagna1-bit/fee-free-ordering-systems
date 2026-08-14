import { describe, expect, it } from "vitest";
import {
  compileComboLine,
  compilePizzaLine,
  matchOption,
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

/* ══════════════════════════════════════════════════════════════════════════
   Regressions from the 2026-08-11 adversarial review. Each of these shipped
   green tests and a real defect — the tests below are the defect, pinned.
   ══════════════════════════════════════════════════════════════════════════ */

describe("negation — a refused topping must never be added", () => {
  it.each([
    "no onions",
    "without onions",
    "hold the bacon",
    "no mushrooms please",
    "skip the olives",
    "leave off the onion",
  ])("rejects %j instead of resolving it to the topping", (phrase) => {
    const m = matchOption(phrase, [TOPPINGS]);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toBe("negated");
  });

  it("a negated topping stops the whole line — the agent must ask, not guess", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }, { name: "no onions" }] },
      PIZZA(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/LEAVE OFF/i);
  });

  it("still resolves a topping whose own name merely contains a negation-ish word", () => {
    const m = matchOption("pepperoni", [TOPPINGS]);
    expect(m.ok && m.option.modifierOptionId).toBe("o_pep");
  });

  it("a store that MODELS removals as options still gets its option", () => {
    const WITH_REMOVALS = {
      ...TOPPINGS,
      options: [...TOPPINGS.options, { modifierOptionId: "o_no_onion", name: "No Onions", priceAdjustment: 0 }],
    };
    const m = matchOption("no onions", [WITH_REMOVALS]);
    expect(m.ok && m.option.modifierOptionId).toBe("o_no_onion");
  });

  it("does not read a real ingredient name as a refusal", () => {
    const DAIRY_FREE = {
      ...TOPPINGS,
      options: [{ modifierOptionId: "o_nd", name: "Non-Dairy Cheese", priceAdjustment: 3 }],
    };
    const m = matchOption("non dairy cheese", [DAIRY_FREE]);
    expect(m.ok && m.option.modifierOptionId).toBe("o_nd");
  });
});

describe("substring matching is qualifier-bounded", () => {
  it("'extra pepperoni' is still pepperoni", () => {
    const m = matchOption("extra pepperoni", [TOPPINGS]);
    expect(m.ok && m.option.modifierOptionId).toBe("o_pep");
  });

  it("a multi-ingredient phrase does not silently become one of its words", () => {
    const m = matchOption("chicken bacon ranch", [TOPPINGS]);
    expect(m.ok).toBe(false);
  });

  it("offers the closest real menu names so the agent can ask 'did you mean'", () => {
    const m = matchOption("anchovies", [TOPPINGS]);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.suggestions.length).toBeGreaterThan(0);
  });
});

describe("mis-heard toppings still resolve (accent + noisy-line robustness)", () => {
  it.each(["peperoni", "pepproni", "pepperonni"])("%j → Pepperoni", (heard) => {
    const m = matchOption(heard, [TOPPINGS]);
    expect(m.ok && m.option.modifierOptionId).toBe("o_pep");
  });

  it("does not fuzzy-match a short word onto an unrelated topping", () => {
    const m = matchOption("ham", [TOPPINGS]);
    expect(m.ok).toBe(false);
  });
});

describe("preset toppings are stored by NAME (the half-price pizza)", () => {
  const NAMED = pizzaCfg({ presetToppings: ["Pepperoni", "Mushrooms"] });

  it("seeds presets given as option NAMES, not just ids", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA({ pizzaConfig: NAMED }));
    const ids = r.line!.modifiers.map((m) => m.modifierOptionId);
    expect(ids).toContain("o_pep");
    expect(ids).toContain("o_mush");
  });

  it("does not double-add a NAME preset the caller also asked for", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ pizzaConfig: pizzaCfg({ presetToppings: ["Pepperoni"] }) }),
    );
    expect(r.line!.modifiers.filter((m) => m.modifierOptionId === "o_pep")).toHaveLength(1);
  });

  it("speaks the seeded presets — the read-back must match the kitchen ticket", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA({ pizzaConfig: NAMED }));
    expect(r.readBack).toMatch(/Pepperoni/);
    expect(r.readBack).toMatch(/Mushrooms/);
  });

  it("REFUSES the sale when presets exist but none resolve and the pizza would bill below list", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large" },
      PIZZA({ pizzaConfig: pizzaCfg({ presetToppings: ["Something Renamed"] }) }),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/aren't set up correctly/i);
  });
});

describe("required groups are never guessed", () => {
  const PAID_CRUST = {
    ...CRUST,
    options: [
      { modifierOptionId: "o_stuffed", name: "Stuffed Crust", priceAdjustment: 4 },
      { modifierOptionId: "o_thin2", name: "Thin Crust", priceAdjustment: 0 },
    ],
  };

  it("asks instead of silently attaching whichever option sorts first", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ modifierGroups: [PAID_CRUST, TOPPINGS] }),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/which crust/i);
  });

  it("still auto-applies a store-marked default", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA(),
    );
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toContain("o_regular");
  });

  it("speaks an auto-applied default that COSTS money", () => {
    const PAID_DEFAULT = {
      ...CRUST,
      options: [{ modifierOptionId: "o_stuffed", name: "Stuffed Crust", priceAdjustment: 4, isDefault: true }],
    };
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ modifierGroups: [PAID_DEFAULT, TOPPINGS] }),
    );
    expect(r.readBack).toMatch(/Stuffed Crust/);
  });
});

describe("sizes are never silently downgraded", () => {
  const SIZES = [
    { variantId: "v_s", name: "Small", price: 12 },
    { variantId: "v_m", name: "Medium", price: 16 },
    { variantId: "v_l", name: "Large", price: 20 },
  ];

  it("'extra large' does not become Large when the store doesn't sell it", () => {
    expect(resolveVariant("extra large", SIZES)).toBeNull();
  });

  it("still resolves a plain spoken size", () => {
    expect(resolveVariant("large", SIZES)?.variantId).toBe("v_l");
  });

  it("asks for the size when it can't be resolved", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "extra large" }, PIZZA({ variants: SIZES }));
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Small, Medium, Large/);
  });
});

describe("spoken money uses the currency SYMBOL, never the ISO code", () => {
  it("reads $ for usd, not 'usd'", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [{ name: "pepperoni" }, { name: "mushrooms" }, { name: "olives" }, { name: "bacon" }],
      },
      PIZZA(),
      { currency: "usd" },
    );
    expect(r.pricingNote).toBeTruthy();
    expect(r.pricingNote).not.toMatch(/usd/i);
    expect(r.pricingNote).toMatch(/\$/);
  });
});

/* ─────────── found by reading Luigi's LIVE menu, 2026-08-11 ─────────── */

describe("real-menu shapes", () => {
  it("finds toppings tagged with the SINGULAR role the schema actually stores", () => {
    // pizzaConfig with no toppingGroupIds → the role fallback is the only path.
    const TAGGED = { ...TOPPINGS, id: "g_untracked", pizzaRole: "topping" as const };
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({
        modifierGroups: [CRUST, TAGGED],
        pizzaConfig: pizzaCfg({ toppingGroupIds: [] }),
      }),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toContain("o_pep");
  });

  it("applies the store default for a required group with no pizzaRole (Cook Level)", () => {
    const COOK = {
      id: "g_cook",
      name: "Cook Level",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      pizzaRole: null,
      options: [
        { modifierOptionId: "o_light", name: "Lightly Cooked", priceAdjustment: 0 },
        { modifierOptionId: "o_reg", name: "Regular Cooked", priceAdjustment: 0, isDefault: true },
        { modifierOptionId: "o_well", name: "Well Done", priceAdjustment: 0 },
      ],
    };
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ modifierGroups: [CRUST, TOPPINGS, COOK] }),
    );
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toContain("o_reg");
  });

  it("asks when a required no-role group has a real choice and no default", () => {
    const COOK = {
      id: "g_cook",
      name: "Cook Level",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      pizzaRole: null,
      options: [
        { modifierOptionId: "o_light", name: "Lightly Cooked", priceAdjustment: 0 },
        { modifierOptionId: "o_well", name: "Well Done", priceAdjustment: 0 },
      ],
    };
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ modifierGroups: [CRUST, TOPPINGS, COOK] }),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Cook Level/);
  });

  it("never auto-fills an OPTIONAL group (garnishes stay off unless asked for)", () => {
    const GARNISH = {
      id: "g_garnish",
      name: "Pizza Garnish",
      required: false,
      minSelect: 0,
      maxSelect: 2,
      pizzaRole: "garnish" as const,
      options: [{ modifierOptionId: "o_oregano", name: "Oregano", priceAdjustment: 0, isDefault: true }],
    };
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ modifierGroups: [CRUST, TOPPINGS, GARNISH] }),
    );
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).not.toContain("o_oregano");
  });
});

/* ────────────── ORD-319717217, 2026-08-14 — the wrong pizza ───────────── */

/**
 * A caller asked for an EXTRA LARGE half-and-half three times and the kitchen
 * got a Large with the toppings on the wrong sides. Both defects were here, in
 * this file, and both answered `ok`.
 *
 * On this menu size is not an option on the pizza — "Large 1 Topping" ($17.74)
 * and "EXTRA Large 1 Topping" ($21.99) are two separate MenuItems with NO
 * variants. So every one of these fixtures deliberately has `hasVariants:false`.
 */
const NO_VARIANT_PIZZA = (name: string): ItemData => ({
  menuItemId: "mi_large1",
  name,
  price: 17.74,
  hasVariants: false,
  variants: [],
  modifierGroups: [CRUST, TOPPINGS],
  pizzaConfig: pizzaCfg({ includedToppings: 1 }),
});

describe("size, when size IS the item and not an option on it", () => {
  it("refuses a size the item cannot be, instead of silently dropping it", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_large1", size: "extra large", toppings: [{ name: "pepperoni" }] },
      NO_VARIANT_PIZZA("Large 1 Topping"),
    );
    // The old code compiled this happily and told the agent the size was set.
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/separate item/i);
    expect(r.unresolved.join(" ")).toMatch(/get_item_options/);
  });

  it("accepts the size when it IS that item — 'extra large' must not match 'Large'", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_large1", size: "extra large", toppings: [{ name: "pepperoni" }] },
      NO_VARIANT_PIZZA("EXTRA Large 1 Topping"),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line).not.toBeNull();
  });

  it("says nothing about a size it cannot read — a freeform note must not dead-end a caller", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_large1", size: "12 inch", toppings: [{ name: "pepperoni" }] },
      NO_VARIANT_PIZZA("Large 1 Topping"),
    );
    expect(r.unresolved).toEqual([]);
  });
});

describe("half-and-half placement is the order, not a default", () => {
  it("asks which half instead of guessing 'whole' — the guess doubles the charge", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "mushrooms" }, // the model forgot to say which side
        ],
      },
      PIZZA(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/which half/i);
  });

  it("refuses the same topping on two halves — that is a move, charged twice", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "pepperoni", placement: "right" },
        ],
      },
      PIZZA(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/MOVED|both halves/i);
  });

  it("reads the halves back grouped BY SIDE, from the compiled line", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "bacon", placement: "left" },
          { name: "mushrooms", placement: "right" },
          { name: "olives", placement: "right" },
        ],
      },
      PIZZA(),
    );
    expect(r.unresolved).toEqual([]);
    // Grouped by side, not one clause per topping — the shape a caller can
    // actually check, and the shape a model cannot regroup wrongly.
    expect(r.readBack).toContain("left half: Pepperoni, Bacon");
    expect(r.readBack).toContain("right half: Mushrooms, Olives");
    // And the structured form matches the modifiers the kitchen prints.
    expect(r.halves).toEqual({ left: ["Pepperoni", "Bacon"], right: ["Mushrooms", "Olives"], whole: [] });
  });

  it("leaves a plain pizza's read-back alone", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
      PIZZA(),
    );
    expect(r.halves).toBeNull();
    expect(r.readBack).toContain("with Pepperoni");
  });
});
