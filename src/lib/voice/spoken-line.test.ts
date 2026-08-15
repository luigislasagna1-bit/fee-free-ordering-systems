/**
 * THE SPOKEN LAYER — what the caller hears must sound like a person.
 *
 * Luigi's first live call on the rebuilt agent (2026-08-15 17:58 UTC): the cart
 * was exactly right, but he heard "Large 2 Topping — left half: Pepperoni,
 * Mushrooms; right half: Green Peppers, Onions" read word for word, then
 * "confirm one half at a time" and "about 2 cents extra". These tests pin the
 * spoken forms on HIS real menu (the prod snapshot fixture) so that pizza reads
 * as "a large pizza, half pepperoni and mushrooms, half green peppers and
 * onions" — and the ticket string underneath is unchanged.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileComboLine, compileItemLine, compilePizzaLine, type ComboData, type ItemData } from "./order-line-compiler";
import { collapseCounts, isGenericBuildName, joinAnd, lowerName, qtyWord, spokenCombo, spokenItem, spokenOrder, spokenPizza, spokenVariant } from "./spoken-line";
import { MIN_SPOKEN_SURCHARGE, numberWords, spokenMoney, spokenOrderText, spokenSurcharge } from "../../../services/nabil-voice/src/spoken-money";
import { L } from "./sim/scenarios/luigis-ids";
import { hydrateComboData, type MenuSnapshot } from "./sim/snapshot-types";

const snap: MenuSnapshot = JSON.parse(readFileSync(join(__dirname, "sim", "fixtures", "luigis.menu.json"), "utf8"));
const item = (id: string): ItemData => snap.items[id] as unknown as ItemData;
const combo = (id: string): ComboData => hydrateComboData(snap, id);

/* ───────────────────────────── the live call ──────────────────────────── */

describe("Luigi's 2026-08-15 pizza — spoken vs ticket", () => {
  const r = compilePizzaLine(
    {
      menuItemId: L.large2,
      size: "Large",
      toppings: [
        { name: "pepperoni", placement: "left" },
        { name: "mushroom", placement: "left" },
        { name: "green pepper", placement: "right" },
        { name: "onion", placement: "right" },
      ],
    },
    item(L.large2),
    { currency: "cad" },
  );

  it("still compiles to the same ticket string (STATE / kitchen unchanged)", () => {
    expect(r.unresolved).toEqual([]);
    expect(r.readBack).toBe("Large 2 Topping — left half: Pepperoni, Mushrooms; right half: Green Peppers, Onions");
  });

  it("is SPOKEN as a person would say it — no SKU, no colons, halves grouped by side", () => {
    expect(r.spoken).toBe("a large pizza, half pepperoni and mushrooms, half green peppers and onions");
    expect(r.spokenNoQty).toBe("large pizza, half pepperoni and mushrooms, half green peppers and onions");
    expect(r.spoken).not.toMatch(/[:;×—]|Topping|left half:/);
  });

  it("the 2-cent rounding artefact is NOT spoken (raw surcharge below the threshold)", () => {
    // 4 half toppings at 2.75 × ½ round per line to 1.38 → 5.52 vs 5.50 credit.
    expect(r.surcharge).toEqual({ amount: 0.02, direction: "extra" });
    expect(spokenSurcharge(r.surcharge)).toBeNull();
    expect(MIN_SPOKEN_SURCHARGE).toBe(0.5);
  });
});

describe("spoken forms on Luigi's menu", () => {
  it("a specialty pizza keeps its NAME, exclusions become 'no ham', a chosen crust is said", () => {
    const r = compilePizzaLine(
      { menuItemId: L.hawaiian, size: "Large", crust: "thin", excludeToppings: ["pineapple"] },
      item(L.hawaiian),
      { currency: "cad" },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.spoken).toMatch(/^a large Hawaiian Pizza, with pepperoni, no pineapple, thin crust$/);
    // ticket unchanged in shape
    expect(r.readBack).toMatch(/Hawaiian Pizza/);
    expect(r.readBack).toMatch(/no Pineapple/);
  });

  it("two of the same pizza: 'two large pizzas, each half …'", () => {
    const r = compilePizzaLine(
      { menuItemId: L.large1, quantity: 2, toppings: [{ name: "pepperoni", placement: "left" }, { name: "bacon", placement: "right" }] },
      item(L.large1),
      { currency: "cad" },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.spoken).toBe("two large pizzas, each half pepperoni, half bacon");
  });

  it("a whole-pizza topping on a split pizza is 'on the whole thing'; double is 'double'", () => {
    const r = compilePizzaLine(
      {
        menuItemId: L.large3,
        toppings: [
          { name: "pepperoni", placement: "left", count: 2 },
          { name: "mushrooms", placement: "right" },
          { name: "bacon", placement: "whole" },
        ],
      },
      item(L.large3),
      { currency: "cad" },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.spoken).toBe("a large pizza, half double pepperoni, half mushrooms, bacon on the whole thing");
  });

  it("wings: '20 piece Chicken Wings, hot mixed'; dips: 'two Dipping Sauce, garlic'", () => {
    const w = compileItemLine({ menuItemId: L.wings, size: "20", options: ["hot mixed"] }, item(L.wings), { currency: "cad" });
    expect(w.unresolved).toEqual([]);
    expect(w.spoken).toBe("a 20 piece Chicken Wings, hot mixed");
    expect(w.spokenNoQty).toBe("20 piece Chicken Wings, hot mixed");
    const d = compileItemLine({ menuItemId: L.dip, quantity: 2, options: ["garlic"] }, item(L.dip), { currency: "cad" });
    expect(d.unresolved).toEqual([]);
    expect(d.spoken).toBe("two Dipping Sauce, garlic");
  });

  it("a combo names its pizzas first/second and collapses identical dips", () => {
    const c = combo(L.doubleLarge);
    const r = compileComboLine(
      {
        menuItemId: L.doubleLarge,
        picks: [
          { menuItemId: L.large3, toppings: [{ name: "pepperoni", placement: "left" }, { name: "pineapple", placement: "left" }, { name: "bacon", placement: "right" }, { name: "mushrooms", placement: "right" }] },
          { menuItemId: L.large3, toppings: [{ name: "pepperoni", placement: "whole" }] },
          { menuItemId: L.dip, options: ["garlic"] },
          { menuItemId: L.dip, options: ["garlic"] },
        ],
      },
      c,
      { currency: "cad" },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.spoken).toBe(
      "a Double Large Combo with first pizza large pizza, half pepperoni and pineapple, half bacon and mushrooms, second pizza large pizza, with pepperoni, and two Dipping Sauce, garlic",
    );
    expect(r.spoken).not.toMatch(/[:;×]|P\d/);
  });
});

/* ────────────────────────────── helpers ───────────────────────────────── */

describe("spoken-line helpers", () => {
  it("recognises generic build SKUs and leaves recipes alone", () => {
    for (const n of ["Large 2 Topping", "LARGE PIZZA  - 1 Topping", "Medium Pizza 1 Topping", "EXTRA Large 3 Topping", "SMALL 1 Topping", "Build Your Own Pizza", "Large 5 Topping Pizza"]) {
      expect(isGenericBuildName(n), n).toBe(true);
    }
    for (const n of ["Hawaiian Pizza", "Meat Lovers", "Spicy Chipotle Chicken Pizza", "Chicken Wings", "Tuesday - Large Pizza Special"]) {
      expect(isGenericBuildName(n), n).toBe(false);
    }
  });
  it("spokenVariant strips slice/inch parentheticals and says piece", () => {
    expect(spokenVariant("Large (10 Slice - 14 inch)")).toBe("large");
    expect(spokenVariant("X Large (12 Slice - 18 inch)")).toBe("extra large");
    expect(spokenVariant("20 pc")).toBe("20 piece");
    expect(spokenVariant("30", "Chicken Wings")).toBe("30 piece");
    expect(spokenVariant("12 oz")).toBe("12 oz");
    expect(spokenVariant(null)).toBeNull();
  });
  it("qtyWord / joinAnd / collapseCounts / lowerName", () => {
    expect(qtyWord(1)).toBe("a");
    expect(qtyWord(3)).toBe("three");
    expect(qtyWord(40)).toBe("40");
    expect(joinAnd(["a"])).toBe("a");
    expect(joinAnd(["a", "b"])).toBe("a and b");
    expect(joinAnd(["a", "b", "c"])).toBe("a, b, and c");
    expect(collapseCounts(["Pepperoni", "Pepperoni", "Mushrooms"])).toEqual(["double pepperoni", "mushrooms"]);
    expect(lowerName("BBQ Chicken")).toBe("BBQ chicken");
    expect(lowerName("REGULAR")).toBe("regular");
  });
  it("renderers compose without a compiler", () => {
    expect(spokenPizza({ quantity: 1, itemName: "Large 1 Topping", toppings: ["Pepperoni"] })).toBe("a large pizza, with pepperoni");
    expect(spokenItem({ quantity: 3, itemName: "Pop Can", options: ["Coke"] })).toBe("three Pop Can, coke");
    expect(spokenCombo({ quantity: 1, comboName: "Large / Wings Combo", children: [{ kind: "pizza", spokenNoQty: "large pizza, with pepperoni" }, { kind: "item", spokenNoQty: "Chicken Wings, hot mixed" }] })).toBe(
      "a Large and Wings Combo with a large pizza, with pepperoni and a Chicken Wings, hot mixed",
    );
    expect(spokenOrder([])).toBe("Nothing is on the order yet.");
    expect(spokenOrder(["a", "b", "c"])).toBe("So that's a, b, and c.");
  });
});

describe("spoken money (Fly service copy)", () => {
  it("numbers to words", () => {
    expect(numberWords(0)).toBe("zero");
    expect(numberWords(7)).toBe("seven");
    expect(numberWords(22)).toBe("twenty-two");
    expect(numberWords(105)).toBe("one hundred and five");
    expect(numberWords(1250)).toBe("one thousand two hundred and fifty");
  });
  it("money in words, no currency code", () => {
    expect(spokenMoney(45.22)).toBe("forty-five dollars and twenty-two cents");
    expect(spokenMoney(20.51)).toBe("twenty dollars and fifty-one cents");
    expect(spokenMoney(20)).toBe("twenty dollars");
    expect(spokenMoney(1)).toBe("one dollar");
    expect(spokenMoney(1.01)).toBe("one dollar and one cent");
    expect(spokenMoney(0.5)).toBe("fifty cents");
    expect(spokenMoney(2.75)).toBe("two dollars and seventy-five cents");
  });
  it("surcharge phrasing respects the threshold and the legacy fallback", () => {
    expect(spokenSurcharge({ amount: 0.02, direction: "extra" })).toBeNull();
    expect(spokenSurcharge({ amount: 2.75, direction: "extra" })).toBe("Extra toppings add two dollars and seventy-five cents.");
    expect(spokenSurcharge({ amount: 1.38, direction: "less" })).toBe("That's one dollar and thirty-eight cents less than the standard build.");
    expect(spokenSurcharge(null)).toBeNull();
    expect(spokenSurcharge(undefined, "legacy text")).toBe("legacy text");
  });
  it("order joiner", () => {
    expect(spokenOrderText(["x"])).toBe("So that's x.");
    expect(spokenOrderText(["x", "y"])).toBe("So that's x, and y.");
    expect(spokenOrderText(["x", "y", "z"])).toBe("So that's x, y, and z.");
  });
});

/* ───────────────────── half recipes (Luigi's 21:20 call, 2026-08-15) ─────── */

describe("half of a NAMED pizza is first-class: recipe toppings, overlaps, base sauce, spoken by name", () => {
  const philly = "cmpuex44806lq04kvesomkta7"; // presets Steak, Mushrooms, Green Peppers, Red Onion; default sauce Ranch Base
  const deluxe = "cmpuex52708kk04kv4l0xflwf"; // presets Pepperoni, Green Peppers, Mushrooms; default Pizza Sauce Base
  const recipes = { [philly]: item(philly), [deluxe]: item(deluxe) };

  it("half Philly Steak, half Deluxe on the combo's Large 3 Topping: shared toppings go whole, ranch rides as a half note, spoken by name", () => {
    const r = compilePizzaLine(
      { menuItemId: L.large3, halfRecipes: [{ placement: "left", menuItemId: philly }, { placement: "right", menuItemId: deluxe }] },
      item(L.large3),
      { currency: "cad", recipes, suppressPricingNote: true },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.halves).toEqual({ left: ["Steak", "Red Onion"], right: ["Pepperoni"], whole: ["Mushrooms", "Green Peppers"] });
    // the kitchen sees the recipe names AND the sauce for that half
    expect(r.readBack).toBe("Large 3 Topping — left half (Philly Steak Pizza): Steak, Red Onion; right half (Deluxe Pizza): Pepperoni; all over: Mushrooms, Green Peppers (Ranch Base on the Philly Steak Pizza half)");
    expect(r.line!.notes).toBe("Ranch Base on the Philly Steak Pizza half");
    // the caller hears the recipe names, not an enumeration, plus the sauce note
    expect(r.spoken).toBe("a large pizza, half Philly Steak Pizza, half Deluxe Pizza, ranch base on the philly steak pizza half");
    expect(r.recipeNames).toEqual(["Philly Steak Pizza", "Deluxe Pizza"]);
    // whole-pizza sauce stays the pizza's own default (Pizza Sauce Base) — no per-half sauce on the ticket line itself
    expect(r.line!.modifiers.some((m) => /Ranch/.test(m.name))).toBe(false);
  });

  it("an extra topping on a recipe half is spoken as 'plus'; 'no pineapple on the Hawaiian half' removes it from the recipe", () => {
    const haw = L.hawaiian;
    const r = compilePizzaLine(
      { menuItemId: L.large2, halfRecipes: [{ placement: "left", menuItemId: haw }], toppings: [{ name: "jalapeno", placement: "left" }, { name: "bacon", placement: "right" }], excludeToppings: ["pineapple"] },
      item(L.large2),
      { currency: "cad", recipes: { [haw]: item(haw) } },
    );
    expect(r.unresolved).toEqual([]);
    expect(r.halves).toEqual({ left: ["Jalapeno", "Pepperoni"], right: ["Bacon"], whole: [] });
    expect(r.spoken).toBe("a large pizza, half Hawaiian Pizza plus jalapeno, half bacon");
  });

  it("a WHOLE recipe on a build pizza takes the recipe's base sauce as the pizza's sauce", () => {
    const r = compilePizzaLine({ menuItemId: L.large3, halfRecipes: [{ placement: "whole", menuItemId: philly }] }, item(L.large3), { currency: "cad", recipes });
    expect(r.unresolved).toEqual([]);
    expect(r.line!.modifiers.map((m) => m.name)).toContain("Ranch Base");
    expect(r.line!.notes).toBeNull();
    expect(r.spoken).toBe("a large pizza, Philly Steak Pizza style, ranch base");
  });

  it("a recipe id the compiler was not given is a question, never a silent plain pizza", () => {
    const r = compilePizzaLine({ menuItemId: L.large3, halfRecipes: [{ placement: "left", menuItemId: philly }] }, item(L.large3), { currency: "cad" });
    expect(r.line).toBeNull();
    expect(r.unresolved[0]).toMatch(/recipe/);
  });
});
