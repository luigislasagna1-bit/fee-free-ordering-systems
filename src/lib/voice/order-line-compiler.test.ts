import { describe, expect, it } from "vitest";
import {
  compileComboLine,
  compileItemLine,
  compilePizzaLine,
  matchOption,
  matchOptionAcrossGroups,
  placementPrefix,
  resolveOption,
  resolveVariant,
  splitSizeToken,
  type ComboData,
  type GroupData,
  type ItemData,
} from "./order-line-compiler";
import { isHalfToppingName } from "@/lib/pizza-topping-pricing";
import { priceComboPizzaChildren } from "@/lib/combo-child-pricing";
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

  it("the same topping on BOTH halves is one whole-pizza topping — never a question, never billed twice", () => {
    // 2026-08-15: "pepperoni on both halves" used to come back as a clash
    // question ("moved, or on both halves — which costs double?"); the caller
    // had said exactly that. On a half-and-half, both halves = the whole pizza.
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "pepperoni", placement: "right" },
          { name: "mushrooms", placement: "right" },
        ],
      },
      PIZZA(),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.halves).toEqual({ left: [], right: ["Mushrooms"], whole: ["Pepperoni"] });
    expect(r.line!.modifiers.filter((m) => /Pepperoni/.test(m.name))).toHaveLength(1);
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

/* ───────── Build Your Own — the pizza that could not be ordered ───────── */

/**
 * Luigi, 2026-08-14: "we have extra large build your own also!"
 *
 * He was right, and it was worse than a missing size: "Build Your Own Pizza"
 * could not be ordered by voice AT ANY SIZE. Its variants are named for their
 * dimensions, and the matcher only did substrings:
 *   "extra large" matched neither name        → null
 *   "large"       was a substring of BOTH     → ambiguous → null
 * So the one pizza on the menu where size genuinely IS an option was the one
 * the agent could never build.
 */
const BYO_VARIANTS = [
  { variantId: "v_s", name: "Small (6 Slice - 10 inch)", price: 9.99, isDefault: true },
  { variantId: "v_m", name: "Medium (8 Slice - 12 inch)", price: 11.99 },
  { variantId: "v_l", name: "Large (10 Slice - 14 inch)", price: 14.99 },
  { variantId: "v_xl", name: "X Large (12 Slice - 18 inch)", price: 18.99 },
];

describe("resolveVariant against dimension-named sizes", () => {
  it('finds "X Large (12 Slice - 18 inch)" from "extra large"', () => {
    expect(resolveVariant("extra large", BYO_VARIANTS)?.variantId).toBe("v_xl");
  });

  it('is no longer ambiguous on plain "large"', () => {
    // "large" is a substring of BOTH "Large (10 Slice…)" and "X Large (12 Slice…)".
    expect(resolveVariant("large", BYO_VARIANTS)?.variantId).toBe("v_l");
  });

  it("handles the spoken shorthands", () => {
    expect(resolveVariant("XL", BYO_VARIANTS)?.variantId).toBe("v_xl");
    expect(resolveVariant("x-large", BYO_VARIANTS)?.variantId).toBe("v_xl");
    expect(resolveVariant("medium", BYO_VARIANTS)?.variantId).toBe("v_m");
    expect(resolveVariant("small", BYO_VARIANTS)?.variantId).toBe("v_s");
  });

  it("still refuses a size the item does not have", () => {
    expect(resolveVariant("party size", BYO_VARIANTS)).toBeNull();
  });

  it("still refuses when two variants claim the same size", () => {
    // An ambiguous menu is a human's problem, not something to guess at.
    expect(
      resolveVariant("large", [
        { variantId: "a", name: "Large Thin", price: 10 },
        { variantId: "b", name: "Large Thick", price: 12 },
      ]),
    ).toBeNull();
  });

  it("does not let the size fallback override an exact name match", () => {
    expect(resolveVariant("Medium (8 Slice - 12 inch)", BYO_VARIANTS)?.variantId).toBe("v_m");
  });

  it("builds an extra-large Build Your Own end to end, at the right price", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "extra large", toppings: [{ name: "pepperoni" }] },
      PIZZA({ name: "Build Your Own Pizza", price: 9.99, variants: BYO_VARIANTS }),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line!.variantId).toBe("v_xl");
    expect(r.readBack).toContain("X Large");
  });
});

/* ───────────── size families: the rule that decides equivalence ───────── */

/**
 * `splitSizeToken` is what stops a size family from being a guess. Two items
 * are the same product in two sizes only if their names are IDENTICAL once the
 * size word is removed — not merely similar, which is how a caller who asked
 * for a Large gets handed a Medium.
 *
 * Verified against Luigi's live menu: from "Large 1 Topping" the rule accepts
 * exactly SMALL/Medium/EXTRA Large "1 Topping" and rejects all ~25 other pizzas
 * in the same category.
 */
describe("splitSizeToken — the family key", () => {
  it("reduces a size lattice to one shared key", () => {
    const key = (n: string) => splitSizeToken(n).rest;
    expect(key("Large 1 Topping")).toBe("1 topping");
    expect(key("EXTRA Large 1 Topping")).toBe("1 topping");
    expect(key("Medium 1 Topping")).toBe("1 topping");
    expect(key("SMALL 1 Topping")).toBe("1 topping");
  });

  it("keeps different products apart", () => {
    // Same size word, different product — must NOT pair.
    expect(splitSizeToken("Large 1 Topping").rest).not.toBe(splitSizeToken("Large 2 Topping").rest);
    expect(splitSizeToken("Large 1 Topping").rest).not.toBe(splitSizeToken("Large 5 Topping Pizza").rest);
  });

  it("reports the size it removed, longest match first", () => {
    expect(splitSizeToken("EXTRA Large 1 Topping").token).toBe("extra large");
    expect(splitSizeToken("Large 1 Topping").token).toBe("large");
    expect(splitSizeToken("X Large (12 Slice - 18 inch)").token).toBe("extra large");
  });

  it("reports no size for a name that has none", () => {
    const r = splitSizeToken("Build Your Own Pizza");
    expect(r.token).toBeNull();
    expect(r.rest).toBe("build your own pizza");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   compileItemLine — simple (non-pizza) items, 2026-08-15
   ══════════════════════════════════════════════════════════════════════════ */

const DIPS: GroupData = {
  id: "g_dips",
  name: "Dips",
  required: false,
  minSelect: 0,
  maxSelect: 2,
  pizzaRole: null,
  options: [
    { modifierOptionId: "o_ranch_dip", name: "Ranch", priceAdjustment: 0.75 },
    { modifierOptionId: "o_blue", name: "Blue Cheese", priceAdjustment: 0.75 },
    { modifierOptionId: "o_honey", name: "Honey Garlic", priceAdjustment: 0 },
  ],
};
const SAUCES: GroupData = {
  id: "g_sauces",
  name: "Sauces",
  required: false,
  minSelect: 0,
  maxSelect: 1,
  pizzaRole: null,
  options: [
    { modifierOptionId: "o_ranch_sauce", name: "Ranch", priceAdjustment: 0 },
    { modifierOptionId: "o_bbq", name: "BBQ", priceAdjustment: 0 },
    { modifierOptionId: "o_hot", name: "Hot", priceAdjustment: 0 },
  ],
};
const DRESSING: GroupData = {
  id: "g_dress",
  name: "Dressing",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  pizzaRole: null,
  options: [
    { modifierOptionId: "o_caesar", name: "Caesar", priceAdjustment: 0, isDefault: true },
    { modifierOptionId: "o_italian", name: "Italian", priceAdjustment: 0 },
  ],
};
const COOK: GroupData = {
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

const SALAD = (over: Partial<ItemData> = {}): ItemData => ({
  menuItemId: "mi_salad",
  name: "Caesar Salad",
  price: 8,
  hasVariants: true,
  variants: [
    { variantId: "v_side", name: "Side", price: 6 },
    { variantId: "v_full", name: "Full", price: 10 },
  ],
  modifierGroups: [DRESSING],
  pizzaConfig: null,
  ...over,
});

const WINGS_WITH_DIPS = (over: Partial<ItemData> = {}): ItemData => ({
  ...WINGS,
  modifierGroups: [DIPS, SAUCES],
  ...over,
});

describe("compileItemLine — sizes", () => {
  it("resolves a spoken size to the variant and prices from it", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "full" }, SALAD());
    expect(r.unresolved).toEqual([]);
    expect(r.line!.variantId).toBe("v_full");
    expect(r.lineSubtotal).toBe(10);
    expect(r.readBack).toBe("Full Caesar Salad");
  });

  it("asks which size, WITH prices, when the item is sized and none was said", () => {
    const r = compileItemLine({ menuItemId: "mi_salad" }, SALAD());
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/which size/i);
    expect(r.unresolved.join(" ")).toMatch(/Side \(\$6\.00\), Full \(\$10\.00\)/);
  });

  it("asks again when the spoken size isn't one the item has", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "jumbo" }, SALAD());
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/jumbo/);
    expect(r.unresolved.join(" ")).toMatch(/which size/i);
  });

  it("uses a store-marked default silently when no size was said", () => {
    const item = SALAD({
      variants: [
        { variantId: "v_side", name: "Side", price: 6 },
        { variantId: "v_full", name: "Full", price: 10, isDefault: true },
      ],
    });
    const r = compileItemLine({ menuItemId: "mi_salad" }, item);
    expect(r.unresolved).toEqual([]);
    expect(r.line!.variantId).toBe("v_full");
  });

  it("uses the only variant silently", () => {
    const item = SALAD({ variants: [{ variantId: "v_only", name: "Regular", price: 7 }] });
    const r = compileItemLine({ menuItemId: "mi_salad" }, item);
    expect(r.line!.variantId).toBe("v_only");
    expect(r.lineSubtotal).toBe(7);
  });

  it("refuses a sold-out item", () => {
    const r = compileItemLine({ menuItemId: "mi_wings" }, { ...WINGS, isSoldOut: true });
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/sold out/i);
  });

  it("notices — does not block — a size spoken for a one-size item", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", size: "large" }, WINGS);
    expect(r.unresolved).toEqual([]);
    expect(r.line).not.toBeNull();
    expect(r.notices).toEqual(["10pc Wings comes in one size"]);
  });

  it("fails closed when size IS the item and the caller named a different one", () => {
    const r = compileItemLine(
      { menuItemId: "mi_sub", size: "large" },
      { ...WINGS, menuItemId: "mi_sub", name: "Small Meatball Sub" },
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/separate item/i);
  });

  it("accepts a spoken size that IS this item's size", () => {
    const r = compileItemLine(
      { menuItemId: "mi_sub", size: "small" },
      { ...WINGS, menuItemId: "mi_sub", name: "Small Meatball Sub" },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.notices).toBeUndefined();
  });

  it("resolves a spoken size inside a 'Size' modifier group when the store models it that way", () => {
    const SIZE_GROUP: GroupData = {
      id: "g_size",
      name: "Size",
      required: true,
      minSelect: 1,
      maxSelect: 1,
      pizzaRole: null,
      options: [
        { modifierOptionId: "o_sm", name: "Small", priceAdjustment: 0 },
        { modifierOptionId: "o_lg", name: "Large", priceAdjustment: 3 },
      ],
    };
    const r = compileItemLine({ menuItemId: "mi_fries", size: "large" }, {
      ...WINGS,
      menuItemId: "mi_fries",
      name: "Fries",
      price: 4,
      modifierGroups: [SIZE_GROUP],
    });
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toEqual(["o_lg"]);
    expect(r.lineSubtotal).toBe(7);
    expect(r.notices).toBeUndefined();
  });
});

describe("compileItemLine — options", () => {
  it("matches spoken options across groups and prices them", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", options: ["blue cheese", "bbq"] }, WINGS_WITH_DIPS());
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers).toEqual([
      { modifierOptionId: "o_blue", name: "Blue Cheese" },
      { modifierOptionId: "o_bbq", name: "BBQ" },
    ]);
    expect(r.readBack).toBe("10pc Wings with Blue Cheese, BBQ");
    expect(r.lineSubtotal).toBe(12.75);
    expect(r.pricingNote).toMatch(/\$0\.75/);
  });

  it("asks which group when the same name lives in two groups", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", options: ["ranch"] }, WINGS_WITH_DIPS());
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Ranch \(Dips\)/);
    expect(r.unresolved.join(" ")).toMatch(/Ranch \(Sauces\)/);
  });

  it("matchOptionAcrossGroups reports the group it landed in", () => {
    const m = matchOptionAcrossGroups("honey garlic", [DIPS, SAUCES]);
    expect(m.ok && m.group.id).toBe("g_dips");
    const amb = matchOptionAcrossGroups("ranch", [DIPS, SAUCES]);
    expect(!amb.ok && amb.reason).toBe("ambiguous_group");
    if (!amb.ok) expect(amb.suggestions).toEqual(["Ranch (Dips)", "Ranch (Sauces)"]);
    const none = matchOptionAcrossGroups("ketchup", [DIPS, SAUCES]);
    expect(!none.ok && none.reason).toBe("no_match");
    if (!none.ok) expect(none.suggestions.length).toBeGreaterThan(0);
    const neg = matchOptionAcrossGroups("no ranch", [DIPS, SAUCES]);
    expect(!neg.ok && neg.reason).toBe("negated");
  });

  it("enforces maxSelect and drops the extras", () => {
    const r = compileItemLine(
      { menuItemId: "mi_wings", options: ["bbq", "hot"] }, // Sauces: maxSelect 1
      WINGS_WITH_DIPS(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved).toEqual(["Only 1 choice for Sauces: Ranch, BBQ, Hot."]);
  });

  it("dedupes an option said twice", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", options: ["bbq", "BBQ"] }, WINGS_WITH_DIPS());
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers).toHaveLength(1);
  });

  it("fills a required group from its default when nothing was said", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "side" }, SALAD());
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toEqual(["o_caesar"]);
    // A free default is not spoken.
    expect(r.readBack).toBe("Side Caesar Salad");
  });

  it("asks for a required group with a real choice and no default", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "side" }, SALAD({ modifierGroups: [COOK] }));
    expect(r.line).toBeNull();
    expect(r.unresolved).toEqual(["Which Cook Level? Lightly Cooked, Well Done."]);
  });

  it("asks a required group the store listed in askGroupIds even when it has a default", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "side" }, SALAD(), { askGroupIds: ["g_dress"] });
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Which Dressing/);
  });

  it("does not ask a required group the caller already satisfied", () => {
    const r = compileItemLine({ menuItemId: "mi_salad", size: "side", options: ["italian"] }, SALAD(), {
      askGroupIds: ["g_dress"],
    });
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers.map((m) => m.modifierOptionId)).toEqual(["o_italian"]);
  });

  it("speaks an auto-applied default that COSTS money", () => {
    const PAID = {
      ...DRESSING,
      options: [{ modifierOptionId: "o_prem", name: "Premium Dressing", priceAdjustment: 1.5, isDefault: true }],
    };
    const r = compileItemLine({ menuItemId: "mi_salad", size: "side" }, SALAD({ modifierGroups: [PAID] }));
    expect(r.readBack).toBe("Side Caesar Salad with Premium Dressing");
    expect(r.lineSubtotal).toBe(7.5);
  });

  it("never adds a refused option — the agent is told to ask", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", options: ["no ranch"] }, WINGS_WITH_DIPS());
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/LEAVE OFF/);
  });

  it("offers the closest real names for an unknown option", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", options: ["blu chese"] }, WINGS_WITH_DIPS());
    // "blu chese" is within fuzzy reach of Blue Cheese — resolves.
    expect(r.unresolved).toEqual([]);
    const r2 = compileItemLine({ menuItemId: "mi_wings", options: ["ketchup"] }, WINGS_WITH_DIPS());
    expect(r2.line).toBeNull();
    expect(r2.unresolved.join(" ")).toMatch(/couldn't find "ketchup"/);
    expect(r2.unresolved.join(" ")).toMatch(/Did they mean/);
  });

  it("subtotal = (variant or item price + Σ options) × quantity, clamped 1..50", () => {
    const r = compileItemLine(
      { menuItemId: "mi_wings", quantity: 3, options: ["ranch", "blue cheese"] },
      WINGS_WITH_DIPS({ modifierGroups: [DIPS] }),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line!.quantity).toBe(3);
    expect(r.lineSubtotal).toBe(Math.round((12 + 0.75 + 0.75) * 3 * 100) / 100);
    expect(r.readBack).toBe("3× 10pc Wings with Ranch, Blue Cheese");
    expect(compileItemLine({ menuItemId: "mi_wings", quantity: 900 }, WINGS).line!.quantity).toBe(50);
    expect(compileItemLine({ menuItemId: "mi_wings", quantity: 0 }, WINGS).line!.quantity).toBe(1);
  });

  it("carries notes and never invents halves", () => {
    const r = compileItemLine({ menuItemId: "mi_wings", notes: "extra crispy" }, WINGS);
    expect(r.line!.notes).toBe("extra crispy");
    expect(r.halves).toBeNull();
    expect(r.pricingNote).toBeNull();
  });
});

/* ───────────────────── excludeToppings — "Hawaiian, no ham" ───────────────── */

describe("excludeToppings — leaving a preset off", () => {
  const HAWAIIAN = () =>
    PIZZA({
      name: "Hawaiian",
      pizzaConfig: pizzaCfg({ presetToppings: ["Pepperoni", "Mushrooms", "Onion"] }),
    });

  it("removes the preset from the modifiers, notes it, and says it", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", excludeToppings: ["onions"] }, HAWAIIAN());
    expect(r.unresolved).toEqual([]);
    const ids = r.line!.modifiers.map((m) => m.modifierOptionId);
    expect(ids).toContain("o_pep");
    expect(ids).toContain("o_mush");
    expect(ids).not.toContain("o_onion");
    expect(r.line!.notes).toBe("NO Onion");
    expect(r.readBack).toBe("Large Hawaiian with Pepperoni, Mushrooms, no Onion");
    expect(r.notices).toBeUndefined();
  });

  it("appends to the caller's own notes with '; '", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", notes: "well done", excludeToppings: ["no mushrooms", "onion"] },
      HAWAIIAN(),
    );
    expect(r.line!.notes).toBe("well done; NO Mushrooms; NO Onion");
    expect(r.readBack).toMatch(/, no Mushrooms, no Onion$/);
  });

  it("an exclusion that was never on the pizza is a notice, not a refusal", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", excludeToppings: ["anchovies"] }, HAWAIIAN());
    expect(r.unresolved).toEqual([]);
    expect(r.line!.notes).toBeNull();
    expect(r.notices).toEqual(["anchovies wasn't on this pizza to begin with"]);
    // Bacon IS on the menu but not on this pizza — same answer.
    const r2 = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", excludeToppings: ["bacon"] }, HAWAIIAN());
    expect(r2.notices).toEqual(["bacon wasn't on this pizza to begin with"]);
    expect(r2.line!.modifiers.map((m) => m.modifierOptionId)).not.toContain("o_bacon");
  });

  it("a topping both asked for and excluded is a contradiction to confirm", () => {
    const r = compilePizzaLine(
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "onion" }], excludeToppings: ["onion"] },
      HAWAIIAN(),
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/both asked for Onion/);
  });

  it("the removed preset is not charged — the line prices what the kitchen makes", () => {
    const withAll = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, HAWAIIAN());
    const without = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", excludeToppings: ["onion"] }, HAWAIIAN());
    expect(without.lineSubtotal!).toBeLessThan(withAll.lineSubtotal!);
  });

  it("works on a half-and-half read-back too", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [{ name: "bacon", placement: "left" }],
        excludeToppings: ["onion"],
      },
      HAWAIIAN(),
    );
    expect(r.unresolved).toEqual([]);
    expect(r.readBack).toMatch(/left half: Bacon; all over: Pepperoni, Mushrooms, no Onion$/);
    expect(r.halves).toEqual({ left: ["Bacon"], right: [], whole: ["Pepperoni", "Mushrooms"] });
  });
});

/* ────────────────────────── toppings[] — what each word became ──────────── */

describe("toppings[] output", () => {
  it("lists one entry per requested topping that resolved, with placement and count", () => {
    const r = compilePizzaLine(
      {
        menuItemId: "mi_pizza",
        size: "large",
        toppings: [
          { name: "peperoni", placement: "left", count: 2 },
          { name: "mushroom", placement: "right" },
        ],
      },
      PIZZA(),
    );
    expect(r.toppings).toEqual([
      { spoken: "peperoni", resolved: "Pepperoni", placement: "left", count: 2 },
      { spoken: "mushroom", resolved: "Mushrooms", placement: "right", count: 1 },
    ]);
  });

  it("is absent when nothing was requested (old shape untouched)", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large" }, PIZZA());
    expect(r.toppings).toBeUndefined();
    expect(r.notices).toBeUndefined();
  });
});

/* ───────────────────────── combo: slotLabel + item picks ─────────────────── */

describe("combo — pickSlots and slotLabel routing", () => {
  const TWO_WING_SLOTS: ComboData = {
    menuItemId: "mi_combo2",
    name: "Wing Party",
    price: 30,
    extrasCharge: false,
    slots: [
      { id: "s_a", label: "First Wings", min: 1, max: 1, choices: [WINGS_WITH_DIPS()] },
      { id: "s_b", label: "Second Wings", min: 1, max: 1, choices: [WINGS_WITH_DIPS()] },
    ],
  };

  it("reports which slot each pick landed in, aligned with picks order", () => {
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
    expect(r.pickSlots).toEqual([
      { index: 0, slotId: "s1", slotLabel: "Pizza" },
      { index: 1, slotId: "s2", slotLabel: "Wings" },
    ]);
  });

  it("honours a slotLabel that names a slot with room, case-insensitively", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo2",
        picks: [
          { menuItemId: "mi_wings", slotLabel: "second wings", options: ["bbq"] },
          { menuItemId: "mi_wings", options: ["hot"] },
        ],
      },
      TWO_WING_SLOTS,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.pickSlots).toEqual([
      { index: 0, slotId: "s_b", slotLabel: "Second Wings" },
      { index: 1, slotId: "s_a", slotLabel: "First Wings" },
    ]);
  });

  it("falls back to first-fit when the named slot is full or doesn't list the item", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo",
        picks: [
          { menuItemId: "mi_wings", slotLabel: "Pizza" }, // Pizza slot doesn't list wings
          { menuItemId: "mi_pizza", size: "large" },
        ],
      },
      COMBO,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.pickSlots).toEqual([
      { index: 0, slotId: "s2", slotLabel: "Wings" },
      { index: 1, slotId: "s1", slotLabel: "Pizza" },
    ]);
  });

  it("resolves a non-pizza pick's options through the item compiler, keeping the wire child shape", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo2",
        picks: [
          { menuItemId: "mi_wings", options: ["blue cheese", "bbq"] },
          { menuItemId: "mi_wings", options: ["honey garlic"] },
        ],
      },
      TWO_WING_SLOTS,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.line!.bundleItems![0]).toEqual({
      menuItemId: "mi_wings",
      variantId: null,
      name: "10pc Wings",
      modifiers: [
        { modifierOptionId: "o_blue", name: "Blue Cheese" },
        { modifierOptionId: "o_bbq", name: "BBQ" },
      ],
    });
    // A child never quotes standalone money inside a combo.
    expect(r.pricingNote).toBeNull();
    expect(r.readBack).toContain("10pc Wings with Blue Cheese, BBQ");
  });

  it("asks about a non-pizza pick's ambiguous option instead of guessing the group", () => {
    const r = compileComboLine(
      { menuItemId: "mi_combo2", picks: [{ menuItemId: "mi_wings", options: ["ranch"] }, { menuItemId: "mi_wings" }] },
      TWO_WING_SLOTS,
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.join(" ")).toMatch(/Ranch \(Dips\)/);
  });

  it("fills / asks a non-pizza pick's REQUIRED group", () => {
    const SALAD_COMBO: ComboData = {
      menuItemId: "mi_combo3",
      name: "Salad Combo",
      price: 15,
      extrasCharge: false,
      slots: [
        { id: "s_s", label: "Salad", min: 1, max: 1, choices: [SALAD()] },
        {
          id: "s_c",
          label: "Cooked",
          min: 1,
          max: 1,
          choices: [SALAD({ menuItemId: "mi_salad2", name: "Cooked Salad", modifierGroups: [COOK] })],
        },
      ],
    };
    const r = compileComboLine(
      {
        menuItemId: "mi_combo3",
        picks: [{ menuItemId: "mi_salad", size: "side" }, { menuItemId: "mi_salad2", size: "side" }],
      },
      SALAD_COMBO,
    );
    expect(r.line).toBeNull();
    // Caesar defaulted silently; Cook Level has no default → asked.
    expect(r.unresolved).toEqual(["Which Cook Level? Lightly Cooked, Well Done."]);
    const ok = compileComboLine(
      {
        menuItemId: "mi_combo3",
        picks: [
          { menuItemId: "mi_salad", size: "side" },
          { menuItemId: "mi_salad2", size: "side", options: ["well done"] },
        ],
      },
      SALAD_COMBO,
    );
    expect(ok.unresolved).toEqual([]);
    expect(ok.line!.bundleItems![0].modifiers.map((m) => m.modifierOptionId)).toEqual(["o_caesar"]);
    expect(ok.line!.bundleItems![1].modifiers.map((m) => m.modifierOptionId)).toEqual(["o_well"]);
  });

  it("passes excludeToppings through to a pizza pick and hoists its note onto the combo line", () => {
    const HAWAIIAN_COMBO: ComboData = {
      ...COMBO,
      slots: [
        {
          id: "s1",
          label: "Pizza",
          min: 1,
          max: 1,
          choices: [PIZZA({ name: "Hawaiian", pizzaConfig: pizzaCfg({ presetToppings: ["Pepperoni", "Onion"] }) })],
        },
        COMBO.slots[1],
      ],
    };
    const r = compileComboLine(
      {
        menuItemId: "mi_combo",
        picks: [{ menuItemId: "mi_pizza", size: "large", excludeToppings: ["onion"] }, { menuItemId: "mi_wings" }],
      },
      HAWAIIAN_COMBO,
    );
    expect(r.unresolved).toEqual([]);
    const pizza = r.line!.bundleItems![0];
    expect(pizza.modifiers.map((m) => m.modifierOptionId)).not.toContain("o_onion");
    expect(r.readBack).toContain("no Onion");
    expect(r.line!.notes).toBe("Hawaiian: NO Onion");
  });

  it("surfaces a child's notice on the combo result", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo",
        picks: [{ menuItemId: "mi_pizza", size: "large" }, { menuItemId: "mi_wings", size: "large" }],
      },
      COMBO,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.notices).toEqual(["10pc Wings comes in one size"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Combo pricing disclosure (Luigi 2026-08-20): the caller must hear the money
   the route WILL book — slot premiums and, on extrasCharge combos with no
   shared pool, each pizza child's over-allowance toppings. Pinned against the
   real charge-path function so the spoken number can't drift from the bill.
   ══════════════════════════════════════════════════════════════════════════ */

describe("combo pricing disclosure — priceParts", () => {
  const ALFREDO: ItemData = {
    menuItemId: "mi_alfredo",
    name: "Fettuccine Alfredo",
    price: 14.99,
    hasVariants: false,
    variants: [],
    modifierGroups: [],
    pizzaConfig: null,
  };
  const ROSE: ItemData = {
    menuItemId: "mi_rose",
    name: "Fettuccine Rose",
    price: 14.99,
    hasVariants: true,
    variants: [
      { variantId: "v_r_reg", name: "Regular", price: 14.99, isDefault: true },
      { variantId: "v_r_lg", name: "Large", price: 18.99 },
    ],
    modifierGroups: [],
    pizzaConfig: null,
  };
  const NAPOLI: ItemData = {
    menuItemId: "mi_napoli",
    name: "Penne Napoli",
    price: 11.99,
    hasVariants: false,
    variants: [],
    modifierGroups: [],
    pizzaConfig: null,
  };
  const PREMIUM: ComboData = {
    menuItemId: "mi_combo_p",
    name: "XL Pizza / Pasta Combo",
    price: 49.99,
    extrasCharge: true,
    slots: [
      { id: "s_pz", label: "Pizza", min: 1, max: 1, choices: [PIZZA()] },
      {
        id: "s_pa",
        label: "Pasta",
        min: 1,
        max: 1,
        choices: [ALFREDO, ROSE, NAPOLI],
        upcharges: { mi_alfredo: 5, mi_rose: 3 },
        variantUpcharges: { "mi_rose::v_r_lg": 7 },
      },
    ],
  };
  // Symmetric model: exactly the 3 included toppings ⇒ $0 adjustment.
  const IN_ALLOWANCE = [{ name: "pepperoni" }, { name: "mushrooms" }, { name: "olives" }];
  // 5 toppings, 3 included @ $2.50 ⇒ $5.00 over.
  const OVER = [...IN_ALLOWANCE, { name: "onion" }, { name: "bacon" }];

  it("announces a premium slot pick (item-level upcharge)", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [{ menuItemId: "mi_pizza", size: "large", toppings: IN_ALLOWANCE }, { menuItemId: "mi_alfredo" }],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toEqual([{ label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" }]);
    expect(r.surcharge).toEqual({ amount: 5, direction: "extra" });
    expect(r.pricingNote).toContain("Fettuccine Alfredo +$5.00");
  });

  it("a variant-key upcharge beats the item-level one and names the size", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [
          { menuItemId: "mi_pizza", size: "large", toppings: IN_ALLOWANCE },
          { menuItemId: "mi_rose", size: "large" },
        ],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toEqual([{ label: "Large Fettuccine Rose", amount: 7, kind: "slot_upcharge" }]);
  });

  it("falls back to the item-level upcharge when the landed size has no variant key", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [
          { menuItemId: "mi_pizza", size: "large", toppings: IN_ALLOWANCE },
          { menuItemId: "mi_rose", size: "regular" },
        ],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toEqual([{ label: "Fettuccine Rose", amount: 3, kind: "slot_upcharge" }]);
  });

  it("announces a pizza child's over-allowance extras and matches BOTH the standalone engine and the charge path", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [{ menuItemId: "mi_pizza", size: "large", toppings: OVER }, { menuItemId: "mi_alfredo" }],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    const extras = r.priceParts!.find((p) => p.kind === "child_extras");
    expect(extras).toEqual({ label: "Build Your Own", amount: 5, kind: "child_extras" });

    // Agreement 1: the standalone pizza engine for the identical build.
    const standalone = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", toppings: OVER }, PIZZA());
    expect(standalone.surcharge).toEqual({ amount: 5, direction: "extra" });

    // Agreement 2: the EXACT function /api/orders bills combo pizza children with.
    const pizzaChild = r.line!.bundleItems!.find((c) => c.menuItemId === "mi_pizza")!;
    const [priced] = priceComboPizzaChildren({
      children: [
        {
          pizzaConfigRaw: JSON.stringify(pizzaCfg()),
          variantName: "Large",
          rawModifiers: pizzaChild.modifiers,
          candidateGroups: [CRUST, TOPPINGS].map((g) => ({
            id: g.id,
            libraryGroupId: null,
            options: g.options.map((o) => ({ id: o.modifierOptionId, name: o.name, priceAdjustment: o.priceAdjustment })),
          })),
        },
      ],
      extrasCharge: true,
    });
    expect(priced.extrasFee).toBe(extras!.amount);

    // The slot premium rides alongside, and the combined surcharge sums both.
    expect(r.priceParts).toContainEqual({ label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" });
    expect(r.surcharge).toEqual({ amount: 10, direction: "extra" });
  });

  it("stays silent for a standard pick within the allowance", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [{ menuItemId: "mi_pizza", size: "large", toppings: IN_ALLOWANCE }, { menuItemId: "mi_napoli" }],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toBeUndefined();
    expect(r.surcharge).toBeNull();
    expect(r.pricingNote).toBeNull();
  });

  it("never announces an under-allowance credit (the combo fee is max(0, …) — no credit exists)", () => {
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [
          { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] },
          { menuItemId: "mi_napoli" },
        ],
      },
      PREMIUM,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toBeUndefined();
    expect(r.surcharge).toBeNull();
  });

  it("extrasCharge=false: topping extras are free (not announced) but the slot premium still is", () => {
    const FREE_EXTRAS: ComboData = { ...PREMIUM, extrasCharge: false };
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [{ menuItemId: "mi_pizza", size: "large", toppings: OVER }, { menuItemId: "mi_alfredo" }],
      },
      FREE_EXTRAS,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toEqual([{ label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" }]);
  });

  it("a shared topping pool silences per-child extras (allocation decides; the dryRun quote is the number)", () => {
    const POOL: ComboData = { ...PREMIUM, sharedToppings: 6 };
    const r = compileComboLine(
      {
        menuItemId: "mi_combo_p",
        picks: [{ menuItemId: "mi_pizza", size: "large", toppings: OVER }, { menuItemId: "mi_alfredo" }],
      },
      POOL,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.priceParts).toEqual([{ label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" }]);
  });

  it("suppressPricingNote silences the spoken note but the raw surcharge still flows", () => {
    const r = compilePizzaLine({ menuItemId: "mi_pizza", size: "large", toppings: OVER }, PIZZA(), {
      suppressPricingNote: true,
    });
    expect(r.pricingNote).toBeNull();
    expect(r.surcharge).toEqual({ amount: 5, direction: "extra" });
  });

  it("a MID-BUILD combo still discloses money for the picks that landed (announce at pick time — live call cmt237qmr)", () => {
    // The pizza landed with paid extras; the pasta slot is still open.
    const r = compileComboLine(
      { menuItemId: "mi_combo_p", picks: [{ menuItemId: "mi_pizza", size: "large", toppings: OVER }] },
      PREMIUM,
    );
    expect(r.line).toBeNull();
    expect(r.unresolved.length).toBeGreaterThan(0);
    expect(r.priceParts).toEqual([{ label: "Build Your Own", amount: 5, kind: "child_extras" }]);

    // Only the premium pasta landed; the pizza slot is still open.
    const p = compileComboLine({ menuItemId: "mi_combo_p", picks: [{ menuItemId: "mi_alfredo" }] }, PREMIUM);
    expect(p.line).toBeNull();
    expect(p.unresolved.length).toBeGreaterThan(0);
    expect(p.priceParts).toEqual([{ label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" }]);

    // Nothing premium landed yet → nothing disclosed mid-build either.
    const q = compileComboLine(
      { menuItemId: "mi_combo_p", picks: [{ menuItemId: "mi_pizza", size: "large", toppings: IN_ALLOWANCE }] },
      PREMIUM,
    );
    expect(q.line).toBeNull();
    expect(q.priceParts).toBeUndefined();
  });
});
