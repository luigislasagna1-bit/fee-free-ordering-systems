import { describe, expect, it, vi } from "vitest";
import { buildLineCore, type BuildLineLoaders } from "./build-line-core";
import type { ComboData, ItemData } from "./order-line-compiler";
import type { PizzaConfig } from "@/lib/pizza-config-parse";

/* ─────────────────────────────── fixtures ─────────────────────────────── */

const cfg: PizzaConfig = {
  isPizza: true,
  allowHalfHalf: true,
  crustGroupId: "g_crust",
  toppingGroupIds: ["g_top"],
  includedToppings: 1,
  extraToppingPrice: 2,
  halfToppingMultiplier: 0.5,
  extraQuantityMultiplier: 0,
  reduceOnRemove: true,
};

const TOPPINGS = {
  id: "g_top",
  name: "Toppings",
  required: false,
  minSelect: 0,
  maxSelect: 10,
  pizzaRole: "toppings",
  options: [
    { modifierOptionId: "o_pep", name: "Pepperoni", priceAdjustment: 2 },
    { modifierOptionId: "o_mush", name: "Mushrooms", priceAdjustment: 2 },
  ],
};

const LARGE_1: ItemData = {
  menuItemId: "mi_large1",
  name: "Large 1 Topping",
  price: 17.74,
  hasVariants: false,
  variants: [],
  modifierGroups: [TOPPINGS],
  pizzaConfig: cfg,
};
const XL_1: ItemData = { ...LARGE_1, menuItemId: "mi_xl1", name: "EXTRA Large 1 Topping", price: 21.99 };

const WINGS: ItemData = {
  menuItemId: "mi_wings",
  name: "10pc Wings",
  price: 12,
  hasVariants: false,
  variants: [],
  modifierGroups: [
    {
      id: "g_dips",
      name: "Dips",
      required: false,
      minSelect: 0,
      maxSelect: 2,
      pizzaRole: null,
      options: [{ modifierOptionId: "o_ranch", name: "Ranch", priceAdjustment: 0.75 }],
    },
  ],
  pizzaConfig: null,
};

/** The combo's own MenuItem row, as the item loader would shape it. */
const COMBO_ITEM: ItemData = {
  menuItemId: "mi_combo",
  name: "Wing Combo",
  price: 30,
  hasVariants: false,
  variants: [],
  modifierGroups: [],
  pizzaConfig: null,
};
const COMBO: ComboData = {
  menuItemId: "mi_combo",
  name: "Wing Combo",
  price: 30,
  extrasCharge: false,
  slots: [
    { id: "s1", label: "Pizza", min: 1, max: 1, choices: [LARGE_1] },
    { id: "s2", label: "Wings", min: 1, max: 1, choices: [WINGS] },
  ],
};

const ITEMS: Record<string, ItemData> = {
  mi_large1: LARGE_1,
  mi_xl1: XL_1,
  mi_wings: WINGS,
  mi_combo: COMBO_ITEM,
};

const loaders = (over: Partial<BuildLineLoaders> = {}): BuildLineLoaders => ({
  item: async (id) => ITEMS[id] ?? null,
  combo: async (id) => (id === "mi_combo" ? COMBO : null),
  ...over,
});

const input = (kind: "item" | "pizza" | "combo", intent: unknown, extra: Record<string, unknown> = {}) => ({
  kind,
  intent,
  askGroupIds: [],
  currency: "cad",
  timezone: "America/Toronto",
  ...extra,
});

/* ──────────────────────────────── gates ───────────────────────────────── */

describe("buildLineCore — kind gates", () => {
  it("400 bad_kind on an unknown kind", async () => {
    const out = await buildLineCore(input("nope" as never, { menuItemId: "mi_wings" }), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "bad_kind" });
  });

  it("400 missing_item when the intent has no menuItemId", async () => {
    const out = await buildLineCore(input("item", {}), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "missing_item" });
  });

  it("404 item_not_found when the loader has nothing", async () => {
    const out = await buildLineCore(input("item", { menuItemId: "mi_ghost" }), loaders());
    expect(out.status).toBe(404);
    expect(out.body).toMatchObject({ code: "item_not_found" });
  });

  it("kind:item on a pizza → 400 wrong_kind {actualKind:'pizza'}", async () => {
    const out = await buildLineCore(input("item", { menuItemId: "mi_large1" }), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "wrong_kind", actualKind: "pizza" });
  });

  it("kind:item on a combo → 400 wrong_kind {actualKind:'combo'}", async () => {
    const out = await buildLineCore(input("item", { menuItemId: "mi_combo" }), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "wrong_kind", actualKind: "combo" });
  });

  it("kind:pizza on a non-pizza → 400 not_a_pizza (unchanged code)", async () => {
    const out = await buildLineCore(input("pizza", { menuItemId: "mi_wings" }), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "not_a_pizza" });
  });

  it("kind:combo on a non-combo → 400 not_a_combo (unchanged code)", async () => {
    const out = await buildLineCore(input("combo", { menuItemId: "mi_wings" }), loaders());
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "not_a_combo" });
  });
});

/* ─────────────────────────────── item path ────────────────────────────── */

describe("buildLineCore — item path", () => {
  it("compiles a simple item with options and returns null autoAppliedDeal/switchedTo", async () => {
    const sizeMatch = vi.fn();
    const betterDeal = vi.fn(async () => null);
    const out = await buildLineCore(
      input("item", { menuItemId: "mi_wings", options: ["ranch"], quantity: 2 }, { offerDeals: true }),
      loaders({ sizeMatch, betterDeal }),
    );
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.unresolved).toEqual([]);
    expect(out.body.line).toEqual({
      menuItemId: "mi_wings",
      variantId: null,
      quantity: 2,
      modifiers: [{ modifierOptionId: "o_ranch", name: "Ranch" }],
      notes: null,
    });
    expect(out.body.readBack).toBe("2× 10pc Wings with Ranch");
    expect(out.body.lineSubtotal).toBe(25.5);
    expect(out.body.autoAppliedDeal).toBeNull();
    expect(out.body.switchedTo).toBeNull();
    // A simple item never gets a size-family swap, but DOES get a deal check.
    expect(sizeMatch).not.toHaveBeenCalled();
    expect(betterDeal).toHaveBeenCalledTimes(1);
  });

  it("returns the compiler's questions untouched", async () => {
    const out = await buildLineCore(input("item", { menuItemId: "mi_wings", options: ["ketchup"] }), loaders());
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.line).toBeNull();
    expect(out.body.unresolved.join(" ")).toMatch(/ketchup/);
  });
});

/* ─────────────────────────────── pizza path ───────────────────────────── */

describe("buildLineCore — pizza path", () => {
  it("compiles a pizza and reports autoAppliedDeal + switchedTo keys", async () => {
    const out = await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", size: "large", toppings: [{ name: "pepperoni" }] }),
      loaders(),
    );
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.unresolved).toEqual([]);
    expect(out.body.line!.menuItemId).toBe("mi_large1");
    expect(out.body).toHaveProperty("autoAppliedDeal", null);
    expect(out.body).toHaveProperty("switchedTo", null);
  });

  it("swaps to the size sibling the resolver names, and says so", async () => {
    const sizeMatch = vi.fn(async () => ({
      menuItemId: "mi_xl1",
      name: XL_1.name,
      variantId: null,
      subtotal: 21.99,
      readBack: "EXTRA Large 1 Topping with Pepperoni",
      saving: 0,
    }));
    const out = await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", size: "extra large", toppings: [{ name: "pepperoni" }] }),
      loaders({ sizeMatch }),
    );
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(sizeMatch).toHaveBeenCalledTimes(1);
    expect(out.body.unresolved).toEqual([]);
    expect(out.body.line!.menuItemId).toBe("mi_xl1");
    expect(out.body.switchedTo).toEqual({ from: "Large 1 Topping", to: "EXTRA Large 1 Topping", saving: 0 });
  });

  it("keeps the honest refusal when the sibling doesn't fully compile", async () => {
    // Sibling exists but the caller's topping isn't on it → the swap is rejected.
    const BARE_XL: ItemData = { ...XL_1, modifierGroups: [] };
    const sizeMatch = vi.fn(async () => ({
      menuItemId: "mi_xl1",
      name: BARE_XL.name,
      variantId: null,
      subtotal: 21.99,
      readBack: "",
      saving: 0,
    }));
    const out = await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", size: "extra large", toppings: [{ name: "pepperoni" }] }),
      loaders({ item: async (id) => (id === "mi_xl1" ? BARE_XL : (ITEMS[id] ?? null)), sizeMatch }),
    );
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.line).toBeNull();
    expect(out.body.switchedTo).toBeNull();
    expect(out.body.unresolved.join(" ")).toMatch(/separate item/i);
  });

  it("asks the deal finder only when offerDeals is on AND a line compiled", async () => {
    const betterDeal = vi.fn<NonNullable<BuildLineLoaders["betterDeal"]>>(async () => null);
    await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", toppings: [{ name: "pepperoni" }] }, { offerDeals: true }),
      loaders({ betterDeal }),
    );
    expect(betterDeal).toHaveBeenCalledTimes(1);
    expect(betterDeal.mock.calls[0][0]).toMatchObject({
      standardItemId: "mi_large1",
      standardVariantId: null,
      currency: "cad",
      timezone: "America/Toronto",
    });

    betterDeal.mockClear();
    await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", toppings: [{ name: "pepperoni" }] }, { offerDeals: false }),
      loaders({ betterDeal }),
    );
    expect(betterDeal).not.toHaveBeenCalled();

    // Broken line → no deal hunt, even when on.
    await buildLineCore(
      input("pizza", { menuItemId: "mi_large1", toppings: [{ name: "pineapple" }] }, { offerDeals: true }),
      loaders({ betterDeal }),
    );
    expect(betterDeal).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────── combo path ───────────────────────────── */

describe("buildLineCore — combo path", () => {
  it("compiles a combo through the combo loader (bare CompileResult, as before)", async () => {
    const out = await buildLineCore(
      input("combo", {
        menuItemId: "mi_combo",
        picks: [
          { menuItemId: "mi_large1", toppings: [{ name: "pepperoni" }] },
          { menuItemId: "mi_wings", options: ["ranch"] },
        ],
      }),
      loaders(),
    );
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(out.body.unresolved).toEqual([]);
    expect(out.body.line!.isCombo).toBe(true);
    expect(out.body.line!.bundleItems).toHaveLength(2);
    expect(out.body.line!.bundleItems![1].modifiers).toEqual([{ modifierOptionId: "o_ranch", name: "Ranch" }]);
    expect(out.body.pickSlots).toEqual([
      { index: 0, slotId: "s1", slotLabel: "Pizza" },
      { index: 1, slotId: "s2", slotLabel: "Wings" },
    ]);
    expect(out.body).not.toHaveProperty("autoAppliedDeal");
    expect(out.body).not.toHaveProperty("switchedTo");
  });
});
