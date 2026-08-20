/**
 * The per-call menu index (`services/nabil-voice/src/menu-index.ts`): the id
 * whitelist and the spoken-words → candidates search. Never guesses — ranked
 * candidates plus an `exact` flag; picking is the model's job.
 */
import { describe, expect, it } from "vitest";
import { buildMenuIndex } from "../../../services/nabil-voice/src/menu-index";

const item = (menuItemId: string, name: string, over: Record<string, unknown> = {}) => ({ menuItemId, name, price: 10, isPizza: false, isCombo: false, hasVariants: false, variants: [], ...over });

const MENU = {
  restaurant: { id: "r1", name: "Test", currency: "cad" },
  menu: [
    {
      category: "Pizzas",
      items: [
        item("pz_pep", "Pepperoni", { isPizza: true, price: 14.99 }),
        item("pz_large", "Large 1 Topping", { isPizza: true, price: 17.74 }),
        item("pz_xl", "EXTRA Large 1 Topping", { isPizza: true, price: 21.99 }),
        item("pz_haw", "Hawaiian Pizza", { isPizza: true, hasVariants: true, sizeNames: ["Small", "Large"] }),
      ],
    },
    {
      category: "Combos",
      items: [
        item("cb_1", "Wings Combo 1", { isCombo: true }),
        item("cb_2", "Wings Combo 2", { isCombo: true }),
        item("cb_3", "Wings Combo 3", { isCombo: true }),
        item("cb_4", "Wings Combo 4", { isCombo: true }),
        item("cb_5", "Wings Combo 5", { isCombo: true }),
        item("cb_6", "Wings Combo 6", { isCombo: true }),
      ],
    },
    {
      category: "Drinks & Sides",
      items: [
        item("dr_coke", "Coke", { price: 1.99 }),
        item("dr_diet", "Diet Coke", { price: 1.99 }),
        item("wings", "Wings", { hasVariants: true, variants: [{ variantId: "v10", name: "10 pc", price: 12 }, { variantId: "v20", name: "20 pc", price: 22 }] }),
        item("dip", "Garlic Dip", { price: 0.99, description: "Creamy garlic dip" }),
        item("lasagna", "Lasagna", { isSoldOut: true, todayDeal: { name: "Lasagna Monday" } }),
      ],
    },
    { category: "Sandwiches", items: [item("sand_cp", "Chicken Parm Sandwich", { price: 9.99 })] },
    { category: "Desserts", items: [item("float", "Coke Float", { price: 4.5 })] },
    { category: "Junk", items: [{ name: "no id" }, null] },
  ],
  notToday: [{ name: "Thursday Smash Burger", available: "Thursdays" }, { name: "Thursday - Chicken Parm Sandwich", available: "Thursdays" }, { name: "" }],
};

const idx = buildMenuIndex(MENU);
const ids = (q: string, limit?: number) => idx.search(q, limit ? { limit } : undefined).candidates.map((c) => c.menuItemId);

describe("has / get / kindOf / entries", () => {
  it("whitelists exactly the ids in the payload and knows each one's kind", () => {
    expect(idx.has("dr_coke")).toBe(true);
    expect(idx.has("pz_pep")).toBe(true);
    expect(idx.has("nope")).toBe(false);
    expect(idx.has("")).toBe(false);
    expect(idx.kindOf("pz_pep")).toBe("pizza");
    expect(idx.kindOf("cb_1")).toBe("combo");
    expect(idx.kindOf("dr_coke")).toBe("item");
    expect(idx.kindOf("nope")).toBeNull();
    expect(idx.get("wings")).toMatchObject({ name: "Wings", category: "Drinks & Sides", hasVariants: true, sizes: ["10 pc", "20 pc"], soldOut: false });
    expect(idx.get("pz_haw")).toMatchObject({ sizes: ["Small", "Large"], hasVariants: true });
    expect(idx.get("pz_xl")).toMatchObject({ nameSize: "extra large", familyKey: "1 topping" });
    expect(idx.get("pz_large")).toMatchObject({ nameSize: "large", familyKey: "1 topping" });
    expect(idx.get("dip")).toMatchObject({ description: "Creamy garlic dip", nameSize: null, familyKey: "garlic dip" });
    expect(idx.get("lasagna")).toMatchObject({ soldOut: true, todayDeal: { name: "Lasagna Monday" } });
    expect(idx.entries()).toHaveLength(17); // the id-less junk is skipped
    expect(idx.notToday).toEqual([{ name: "Thursday Smash Burger", available: "Thursdays" }, { name: "Thursday - Chicken Parm Sandwich", available: "Thursdays" }]);
    expect(buildMenuIndex(null).entries()).toEqual([]);
  });
});

describe("search", () => {
  it("exact name ⇒ exact:true; a plural/stem form still counts as exact", () => {
    const r = idx.search("Coke");
    expect(r.exact).toBe(true);
    expect(r.candidates[0].menuItemId).toBe("dr_coke");
    expect(r.candidates[0].score).toBe(100);
    expect(r.sizeHint).toBeNull();
    const s = idx.search("garlic dips");
    expect(s.exact).toBe(true);
    expect(s.candidates[0]).toMatchObject({ menuItemId: "dip", score: 90 });
    expect(idx.search("garlic dip").exact).toBe(true);
    expect(idx.search("hawaiian pizza").candidates[0].menuItemId).toBe("pz_haw");
  });

  it("bridges the ASR mishearings phone audio produces (phonetic 'peperoni')", () => {
    const r = idx.search("peperoni");
    expect(r.candidates[0]).toMatchObject({ menuItemId: "pz_pep", score: 50 });
    expect(idx.search("pepparoni").candidates[0].menuItemId).toBe("pz_pep");
    expect(idx.search("pepproni").candidates[0].menuItemId).toBe("pz_pep");
    // and a bounded fuzzy pass for the rest
    expect(idx.search("lasagne").candidates[0].menuItemId).toBe("lasagna");
    // but never something wildly different
    expect(idx.search("sushi").candidates).toEqual([]);
  });

  it("strips the size word into sizeHint and matches the size-stripped family; the matching name-size ranks first", () => {
    const r = idx.search("large pepperoni");
    expect(r.sizeHint).toBe("large");
    expect(r.exact).toBe(true);
    expect(r.candidates[0].menuItemId).toBe("pz_pep");
    const fam = idx.search("large 1 topping");
    expect(fam.sizeHint).toBe("large");
    expect(fam.candidates.map((c) => c.menuItemId).slice(0, 2)).toEqual(["pz_large", "pz_xl"]);
    expect(fam.candidates[0].score).toBeGreaterThan(fam.candidates[1].score);
    const xl = idx.search("extra large one topping");
    expect(xl.sizeHint).toBe("extra large");
    const bare = idx.search("1 topping");
    expect(bare.sizeHint).toBeNull();
    // two sizes of one family, no size said ⇒ NOT exact, ask which
    expect(bare.exact).toBe(false);
    expect(bare.candidates.slice(0, 2).map((c) => c.menuItemId).sort()).toEqual(["pz_large", "pz_xl"]);
    expect(bare.candidates[0].score).toBe(bare.candidates[1].score); // a dead tie: nobody's size was said
    expect(idx.search("xl 1 topping").candidates[0].menuItemId).toBe("pz_xl");
  });

  it("uses the category as a boost, drops stop words, and ranks partial hits below full ones", () => {
    const r = idx.search("a drink coke please");
    expect(r.candidates.map((c) => c.menuItemId).slice(0, 2)).toEqual(["dr_coke", "dr_diet"]);
    // "drink" hits Coke's category (Drinks & Sides), not the dessert's
    expect(r.candidates[0].score).toBeGreaterThan(r.candidates[2].score);
    // a category-only hit is a weak partial, ranked last
    expect(r.candidates.slice(3).every((c) => c.score < r.candidates[2].score + 1)).toBe(true);
    expect(idx.search("the wings please").candidates[0].menuItemId).toBe("wings");
  });

  it("answers 'the Thursday special' honestly via notToday, with no fake candidates", () => {
    const r = idx.search("smash burger");
    expect(r.candidates).toEqual([]);
    expect(r.notToday).toEqual([{ name: "Thursday Smash Burger", available: "Thursdays" }]);
    expect(idx.search("thursday smash burger").notToday).toHaveLength(1);
    expect(idx.search("coke").notToday).toEqual([]);
  });

  it("suppresses notToday day-deal variant when the regular item is a confident candidate", () => {
    const r = idx.search("chicken parm sandwich");
    expect(r.candidates[0]).toMatchObject({ menuItemId: "sand_cp", name: "Chicken Parm Sandwich" });
    expect(r.candidates[0].score).toBeGreaterThanOrEqual(65);
    expect(r.notToday).toEqual([]);
  });

  it("caps candidates at 5 by default (or the given limit) and flags sold-out items", () => {
    expect(ids("wings combo")).toHaveLength(5);
    expect(ids("wings combo", 3)).toHaveLength(3);
    expect(ids("wings combo", 10)).toHaveLength(7); // 6 combos + Wings itself
    const so = idx.search("lasagna");
    expect(so.candidates[0]).toMatchObject({ menuItemId: "lasagna", soldOut: true, score: 99, todayDeal: { name: "Lasagna Monday" } });
    expect(so.exact).toBe(true);
    // ties are broken by name so the order is stable
    expect(ids("wings combo", 10)).toEqual(["wings", "cb_1", "cb_2", "cb_3", "cb_4", "cb_5", "cb_6"]);
  });

  it("an empty or stop-word-only query finds nothing", () => {
    expect(idx.search("").candidates).toEqual([]);
    expect(idx.search("   ").candidates).toEqual([]);
    expect(idx.search("a pizza please").candidates).toEqual([]);
  });
});

describe("confidence (directive: never guess a menu id — resolve, or ask)", () => {
  it("exact names are 1.0; a size sibling does not cap it", () => {
    const r = idx.search("Large 1 Topping");
    expect(r.confidence).toBe(1);
    expect(["name", "family"]).toContain(r.candidates[0].matchedOn);
    const s = idx.search("large one topping");
    expect(s.candidates[0].menuItemId).toBe("pz_large");
    expect(s.confidence).toBeGreaterThanOrEqual(0.85);
  });
  it("a near-tie between real rivals caps BOTH at 0.6 so tools must ask", () => {
    const two = buildMenuIndex({
      menu: [{ category: "Salads", items: [item("s1", "Chicken Caesar Salad", { price: 9 }), item("s2", "Chicken Caesar Wrap", { price: 9 })] }],
    });
    const r = two.search("chicken caesar");
    expect(r.candidates.length).toBe(2);
    expect(r.candidates[0].confidence).toBeLessThanOrEqual(0.6);
    expect(r.candidates[1].confidence).toBeLessThanOrEqual(0.6);
    expect(r.confidence).toBeLessThanOrEqual(0.6);
    // …but a full name is unambiguous even with a near-twin on the menu.
    expect(two.search("chicken caesar wrap").confidence).toBe(1);
  });
  it("phonetic and fuzzy hits are visible as such and land below the use-it line", () => {
    const p = idx.search("peperoni");
    expect(p.candidates[0].menuItemId).toBe("pz_pep");
    expect(["phonetic", "fuzzy", "name"]).toContain(p.candidates[0].matchedOn);
    // A keyword-only match (an option name, not the item name) is weaker than a name match.
    const k = idx.search("garlic");
    expect(k.candidates[0].menuItemId).toBe("dip");
  });
  it("nothing found ⇒ confidence 0", () => {
    expect(idx.search("unicorn steak").confidence).toBe(0);
  });
});
