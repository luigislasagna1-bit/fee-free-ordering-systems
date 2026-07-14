import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeUberStoreToken,
  parseUberSource,
  extractUberCategories,
  mapUberMenu,
  type UberMenu,
} from "./ubereats";

const FIX = join(process.cwd(), "test-fixtures", "ubereats");
const store = JSON.parse(readFileSync(join(FIX, "koozina-getStoreV1.json"), "utf8")).data;
const greekSalad = JSON.parse(readFileSync(join(FIX, "koozina-greek-salad-getMenuItemV1.json"), "utf8")).data;

describe("uber import — source parsing", () => {
  it("decodes the base64url store token to a UUID", () => {
    expect(decodeUberStoreToken("A3-4qfqIUWqTxgcHUiPbpw")).toBe("037fb8a9-fa88-516a-93c6-07075223dba7");
  });

  it("parses a full Uber Eats store URL (uuid + locale)", () => {
    const src = parseUberSource(
      "https://www.ubereats.com/ca/store/koozina/A3-4qfqIUWqTxgcHUiPbpw?diningMode=PICKUP",
    );
    expect(src.storeUuid).toBe("037fb8a9-fa88-516a-93c6-07075223dba7");
    expect(src.localeCode).toBe("ca");
  });

  it("accepts a raw UUID too", () => {
    expect(parseUberSource("037fb8a9-fa88-516a-93c6-07075223dba7").storeUuid).toBe(
      "037fb8a9-fa88-516a-93c6-07075223dba7",
    );
  });

  it("throws a friendly error on junk", () => {
    expect(() => parseUberSource("not a link")).toThrow(/Uber Eats store/i);
  });
});

describe("uber import — category + item extraction (real Koozina store)", () => {
  const cats = extractUberCategories(store);

  it("finds all 10 categories in menu order with correct names", () => {
    expect(cats.map((c) => c.title)).toEqual([
      "Salads", "Main Dishes", "Meat Lover Sandwiches", "Vegetarian Lovers",
      "Beverages", "Desserts", "Extra Skewers", "Side Orders", "Kids Mains", "Combo",
    ]);
  });

  it("groups all 71 items with the right per-category counts", () => {
    const counts = Object.fromEntries(cats.map((c) => [c.title, c.items.length]));
    expect(counts).toMatchObject({
      Salads: 5, "Main Dishes": 14, "Meat Lover Sandwiches": 8, "Vegetarian Lovers": 5,
      Beverages: 4, Desserts: 3, "Extra Skewers": 9, "Side Orders": 16, "Kids Mains": 3, Combo: 4,
    });
    expect(cats.reduce((s, c) => s + c.items.length, 0)).toBe(71);
  });
});

describe("uber import — mapUberMenu → ImportPreview", () => {
  // Build a UberMenu from the real store, attaching Greek Salad's real modifiers.
  const cats = extractUberCategories(store);
  const menu: UberMenu = {
    title: store.title,
    currency: store.currencyCode,
    categories: cats.map((c) => ({
      uuid: c.uuid,
      title: c.title,
      items: c.items.map((it: any) => ({
        ...it,
        customizations: it.title === "Greek Salad" ? greekSalad.customizationsList : [],
      })),
    })),
  };
  const preview = mapUberMenu(menu);

  it("emits source=ubereats with 10 categories / 71 items", () => {
    expect(preview.source).toBe("ubereats");
    expect(preview.stats.categories).toBe(10);
    expect(preview.stats.items).toBe(71);
    expect(preview.categoryGroups).toEqual([]); // Uber has no category-shared groups
  });

  it("converts prices from cents to dollars", () => {
    const gs = preview.categories.flatMap((c) => c.items).find((i) => i.name === "Greek Salad")!;
    expect(gs.basePrice).toBe(10.45); // 1045 cents
    expect(gs.hasVariants).toBe(false);
    expect(gs.variants).toEqual([]);
  });

  it("maps the item's modifier group with correct min/max + priced options", () => {
    const gs = preview.categories.flatMap((c) => c.items).find((i) => i.name === "Greek Salad")!;
    expect(gs.itemGroups).toHaveLength(1);
    const g = gs.itemGroups[0];
    expect(g.name).toBe("Remove toppings");
    expect(g.required).toBe(false); // minPermitted 0
    expect(g.minSelect).toBe(0);
    expect(g.maxSelect).toBe(5); // maxPermitted 5
    expect(g.options).toHaveLength(5);
    expect(g.options.map((o) => o.name)).toContain("No Cucumber");
    expect(g.options.every((o) => o.priceAdjustment === 0)).toBe(true);
  });

  it("captures photos only where Uber actually has them (5 of 71)", () => {
    const withPhoto = preview.categories.flatMap((c) => c.items).filter((i) => i.sourceImageUrl);
    expect(withPhoto.length).toBe(5);
    expect(withPhoto.every((i) => i.sourceImageUrl!.startsWith("https://tb-static.uber.com/"))).toBe(true);
  });

  it("handles sizes (required single-select), priced add-ons, and combos (nested)", () => {
    // A pizza-style item Uber models as: a required size group (min=max=1), a
    // multi-select add-ons group, and a combo option carrying a nested group.
    const pizza: UberMenu = {
      title: "Test Pizzeria",
      currency: "CAD",
      categories: [{
        uuid: "sub1", title: "Pizza",
        items: [{
          uuid: "it1", title: "Build Your Pizza", price: 1200,
          sectionUuid: "s", subsectionUuid: "sub1", hasCustomizations: true,
          customizations: [
            { title: "Choose size", minPermitted: 1, maxPermitted: 1, options: [
              { title: "Small", price: 0 }, { title: "Medium", price: 300 }, { title: "Large", price: 600 },
            ] },
            { title: "Extra toppings", minPermitted: 0, maxPermitted: 5, options: [
              { title: "Mushrooms", price: 150 }, { title: "Pepperoni", price: 200 },
            ] },
            { title: "Make it a combo?", minPermitted: 0, maxPermitted: 1, options: [
              { title: "Add a drink + fries", price: 500, childCustomizationList: [
                { title: "Pick a drink", minPermitted: 1, maxPermitted: 1, options: [
                  { title: "Coke", price: 0 }, { title: "Sprite", price: 0 },
                ] },
              ] },
            ] },
          ],
        }],
      }],
    } as any;
    const p = mapUberMenu(pizza);
    const item = p.categories[0].items[0];
    // 3 top-level groups + 1 flattened nested combo group = 4
    expect(item.itemGroups.map((g) => g.name)).toEqual([
      "Choose size", "Extra toppings", "Make it a combo?", "Pick a drink",
    ]);
    const [size, addons, combo, drink] = item.itemGroups;
    // SIZE → required single-select with dollar-converted price deltas
    expect(size.required).toBe(true);
    expect(size.minSelect).toBe(1);
    expect(size.maxSelect).toBe(1);
    expect(size.options.map((o) => o.priceAdjustment)).toEqual([0, 3, 6]);
    // ADD-ONS → optional multi-select, priced
    expect(addons.required).toBe(false);
    expect(addons.maxSelect).toBe(5);
    expect(addons.options.find((o) => o.name === "Pepperoni")!.priceAdjustment).toBe(2);
    // COMBO parent option priced; nested group captured as its own group
    expect(combo.options[0].priceAdjustment).toBe(5);
    expect(drink.required).toBe(true);
    expect(drink.options.map((o) => o.name)).toEqual(["Coke", "Sprite"]);
  });

  it("assigns unique sequential sourceIds across categories/items/groups/options", () => {
    const ids: number[] = [];
    for (const c of preview.categories) {
      ids.push(c.sourceId);
      for (const it of c.items) {
        ids.push(it.sourceId);
        for (const g of it.itemGroups) {
          ids.push(g.sourceId);
          for (const o of g.options) ids.push(o.sourceId);
        }
      }
    }
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });
});
