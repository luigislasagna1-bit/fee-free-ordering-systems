/**
 * PARITY between the voice service's copies and the app's originals.
 *
 * The Fly build context is `services/nabil-voice/` only, so the service cannot
 * import `src/lib/voice/order-line-compiler.ts` and carries verbatim copies of
 * the compiler's private string helpers in `fuzzy.ts`, and of the sim's
 * `hashJson` in `versions.ts`. These tests pin the copies to the originals:
 * change one, and this file tells you to change the other.
 *
 * The compiler's norm/stem/phonetic/editDistance are PRIVATE, so their parity
 * is tested through behaviour: `splitSizeToken`/`normalizeSizeToken` (exported
 * by both) on a corpus of spoken strings, and `matchOption`/`resolveVariant`
 * (compiler) against `sameName` (service) on the same spoken forms.
 */
import { describe, expect, it } from "vitest";
import * as svc from "../../../services/nabil-voice/src/fuzzy";
import { hashJson as svcHashJson, stableStringify as svcStableStringify, quickHash } from "../../../services/nabil-voice/src/versions";
import { normalizeSizeToken as appNormalizeSizeToken, splitSizeToken as appSplitSizeToken, matchOption, resolveOption, resolveVariant, type GroupData, type VariantData } from "@/lib/voice/order-line-compiler";
import { hashJson as appHashJson, stableStringify as appStableStringify } from "@/lib/voice/sim/snapshot-hash";
import { fnv1a } from "../../../services/nabil-voice/src/basket-signature";

const SIZE_CORPUS = [
  "large",
  "Large 1 Topping",
  "EXTRA Large 1 Topping",
  "extra large pepperoni",
  "extra-large",
  "x-large",
  "x large",
  "XL",
  "xxl meat lovers",
  "a medium hawaiian",
  "med",
  "Med. Cheese Pizza",
  "small",
  "personal pan",
  "mini calzone",
  "party size tray",
  "10 pc wings",
  "12 inch",
  "the usual",
  "",
  "   ",
  "Large / Wings Combo",
  "large large",
  "medium large",
  "small medium large",
  "enlarged photo",
  "smallish",
  "Extra   Large",
  "x -large",
  "Large, please!",
  "LARGE 3 TOPPING PIZZA",
  "party",
  "personal",
  "extra cheese",
  null,
  undefined,
];

describe("splitSizeToken / normalizeSizeToken — service copy == compiler", () => {
  it.each(SIZE_CORPUS.map((s) => [s]))("%j", (s) => {
    expect(svc.splitSizeToken(s as any)).toEqual(appSplitSizeToken(s as any));
    expect(svc.normalizeSizeToken(s as any)).toBe(appNormalizeSizeToken(s as any));
  });

  it("agrees on the load-bearing cases: longest match first, and null when no size is named", () => {
    expect(appSplitSizeToken("EXTRA Large 1 Topping")).toEqual({ token: "extra large", rest: "1 topping" });
    expect(svc.splitSizeToken("EXTRA Large 1 Topping")).toEqual({ token: "extra large", rest: "1 topping" });
    expect(svc.normalizeSizeToken("12 inch")).toBeNull();
    expect(appNormalizeSizeToken("12 inch")).toBeNull();
    expect(svc.normalizeSizeToken("xl")).toBe("extra large");
    expect(appNormalizeSizeToken("xl")).toBe("extra large");
  });
});

/* ── behavioural parity of norm / stem / phonetic / editDistance ─────────── */

const opt = (name: string) => ({ modifierOptionId: `o_${name.toLowerCase().replace(/\W+/g, "_")}`, name, priceAdjustment: 0 });
const groups: GroupData[] = [{ id: "g1", name: "Toppings", required: false, minSelect: 0, maxSelect: 10, options: [opt("Pepperoni"), opt("Mushroom"), opt("Green Pepper"), opt("Mozzarella"), opt("Bacon"), opt("Ham")] }];
const one = (name: string): GroupData[] => [{ id: "g", name: "G", required: false, minSelect: 0, maxSelect: 1, options: [opt(name)] }];

const SPOKEN: Array<[spoken: string, canonical: string]> = [
  ["pepperoni", "Pepperoni"],
  ["Pepperoni", "Pepperoni"],
  ["pepperonis", "Pepperoni"],
  ["peperoni", "Pepperoni"],
  ["pepproni", "Pepperoni"],
  ["pepparoni", "Pepperoni"],
  ["peppperoni", "Pepperoni"],
  ["mushrooms", "Mushroom"],
  ["mushroom", "Mushroom"],
  ["moshroom", "Mushroom"],
  ["mushrom", "Mushroom"],
  ["green peppers", "Green Pepper"],
  ["green pepper", "Green Pepper"],
  ["Green-Pepper", "Green Pepper"],
  ["mozzarella", "Mozzarella"],
  ["mozarella", "Mozzarella"],
  ["mozarela", "Mozzarella"],
  ["motzarella", "Mozzarella"],
  ["bacon", "Bacon"],
  ["baconn", "Bacon"],
  ["ham", "Ham"],
];

describe("stem / phonetic / bounded fuzzy — the service's sameName agrees with the compiler's matchOption", () => {
  it.each(SPOKEN)("%s → %s", (spoken, canonical) => {
    // The service says these are the same name…
    expect(svc.sameName(spoken, canonical)).toBe(true);
    // …and the compiler resolves the same spoken form to that option in a
    // group of one (no substring/negation passes can interfere).
    const m = matchOption(spoken, one(canonical));
    expect(m.ok && m.option.name).toBe(canonical);
    // …and in the full group it lands on the SAME option, not a neighbour.
    expect(resolveOption(spoken, groups)?.name).toBe(canonical);
  });

  it("agrees on what is NOT the same name (short words get no fuzzy budget; different words differ)", () => {
    for (const [a, b] of [
      ["ham", "bacon"],
      ["hem", "Ham"], // budget 0 at length 3
      ["onion", "Bacon"],
      ["chicken", "Bacon"],
      ["mushroom", "Mozzarella"],
    ]) {
      expect(svc.sameName(a, b)).toBe(false);
      const m = matchOption(a, one(b));
      expect(m.ok).toBe(false);
    }
    // The compiler ALSO has a prefix/substring pass ("pep" → Pepperoni) that
    // sameName deliberately does not: sameName is for finding an existing
    // intent topping again, never for picking from a menu.
    expect(matchOption("pep", one("Pepperoni")).ok).toBe(true);
    // "pep" is in the spoken-alias dictionary on BOTH sides now (2026-08-15),
    // so the service agrees it is pepperoni — that is the point of the table.
    expect(svc.sameName("pep", "Pepperoni")).toBe(true);
    expect(svc.sameName("pea", "Pepperoni")).toBe(false);
  });

  it("agrees on the primitives directly where the compiler exposes them through resolveVariant", () => {
    const variants: VariantData[] = [
      { variantId: "v10", name: "10 pc", price: 12 },
      { variantId: "v20", name: "20 pc", price: 22 },
      { variantId: "vl", name: "Large", price: 20 },
    ];
    // norm: punctuation/case noise is not a difference
    expect(resolveVariant("10-PC.", variants)?.variantId).toBe("v10");
    expect(svc.norm("10-PC.")).toBe(svc.norm("10 pc"));
    expect(resolveVariant("large", variants)?.variantId).toBe("vl");
    expect(svc.norm(" Large ")).toBe("large");
  });

  it("the service's own primitives behave as documented", () => {
    expect(svc.norm("  Extra-Cheese!!  ")).toBe("extra cheese");
    expect(svc.stem("mushrooms")).toBe("mushroom");
    expect(svc.stem("olives")).toBe("oliv");
    expect(svc.phonetic("peperoni")).toBe(svc.phonetic("pepperoni"));
    expect(svc.phonetic("pepproni")).toBe(svc.phonetic("Pepperoni"));
    expect(svc.phonetic("moozarella")).toBe(svc.phonetic("mozzarella"));
    expect(svc.editDistance("kitten", "sitting")).toBe(3);
    expect(svc.editDistance("", "abc")).toBe(3);
    expect(svc.editDistance("same", "same")).toBe(0);
    expect(svc.fuzzyBudget(3)).toBe(0);
    expect(svc.fuzzyBudget(5)).toBe(1);
    expect(svc.fuzzyBudget(8)).toBe(2);
    expect(svc.sameName("", "x")).toBe(false);
    expect(svc.SIZE_PATTERNS.map(([t]) => t)).toEqual(["extra large", "large", "medium", "small", "personal", "party"]);
  });
});

/* ── hashJson: versions.ts == sim/snapshot-hash.ts ───────────────────────── */

describe("hashJson — service copy == sim", () => {
  it("pins the shared vector 8baa73198470c7bb", () => {
    expect(svcHashJson({ a: 1, b: [1, 2] })).toBe("8baa73198470c7bb");
    expect(svcHashJson({ b: [1, 2], a: 1 })).toBe("8baa73198470c7bb");
    expect(appHashJson({ a: 1, b: [1, 2] })).toBe("8baa73198470c7bb");
  });

  it("agrees byte-for-byte on a menu-shaped payload, before and after a JSON round-trip", () => {
    const payload = {
      restaurant: { name: "Luigi's", currency: "cad", id: "r1" },
      menu: [
        { category: "Pizzas", items: [{ menuItemId: "pz", name: "Large 1 Topping", price: 17.74, isPizza: true, variants: [], tags: undefined }] },
        { category: "Drinks", items: [{ menuItemId: "dr", name: "Coke", price: 1.99, nested: { z: 1, a: [3, { y: 2, x: 1 }] } }] },
      ],
      notToday: [{ name: "Thursday Smash Burger", available: "Thursdays" }],
      when: new Date("2026-08-15T00:00:00.000Z"),
      nan: NaN,
    };
    expect(svcStableStringify(payload)).toBe(appStableStringify(payload));
    expect(svcHashJson(payload)).toBe(appHashJson(payload));
    const roundTripped = JSON.parse(JSON.stringify(payload));
    expect(svcHashJson(roundTripped)).toBe(svcHashJson(payload));
    expect(appHashJson(roundTripped)).toBe(appHashJson(payload));
    expect(svcHashJson(payload)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("quickHash is fnv1a over the stable form — stable in-process, key-order independent", () => {
    expect(quickHash({ b: 1, a: 2 })).toBe(quickHash({ a: 2, b: 1 }));
    expect(quickHash({ b: 1, a: 2 })).toBe(fnv1a(svcStableStringify({ a: 2, b: 1 })));
    expect(quickHash({ b: 1, a: 2 })).not.toBe(quickHash({ b: 1, a: 3 }));
  });
});

/* ── spoken-alias dictionary: service copy == compiler (via matchOption) ─── */

describe("spoken aliases resolve to the same menu option on both sides (directive: GP == green pepper)", () => {
  const TOPPINGS: GroupData = {
    id: "g_top",
    name: "Toppings",
    required: false,
    minSelect: 0,
    maxSelect: 10,
    pizzaRole: "toppings",
    options: [
      { modifierOptionId: "o_gp", name: "Green Peppers", priceAdjustment: 2.5 },
      { modifierOptionId: "o_pep", name: "Pepperoni", priceAdjustment: 2.5 },
      { modifierOptionId: "o_mush", name: "Mushrooms", priceAdjustment: 2.5 },
      { modifierOptionId: "o_xc", name: "X - Cheese", priceAdjustment: 2.5 },
      { modifierOptionId: "o_jal", name: "Jalapeño", priceAdjustment: 2.5 },
      { modifierOptionId: "o_rrp", name: "Roasted Red Peppers", priceAdjustment: 2.5 },
      { modifierOptionId: "o_bbq", name: "BBQ Chicken", priceAdjustment: 2.5 },
    ],
  };
  const cases: Array<[string, string]> = [
    ["GP", "o_gp"],
    ["green pepper", "o_gp"],
    ["green peppers", "o_gp"],
    ["pep", "o_pep"],
    ["shrooms", "o_mush"],
    ["mush", "o_mush"],
    ["double cheese", "o_xc"],
    ["extra cheese", "o_xc"],
    ["x-cheese", "o_xc"],
    ["jalapenos", "o_jal"],
    ["jalapeño", "o_jal"],
    ["roasted red pepper", "o_rrp"],
    ["barbecue chicken", "o_bbq"],
  ];
  it("compiler matchOption resolves every alias", () => {
    for (const [spoken, id] of cases) {
      const m = matchOption(spoken, [TOPPINGS]);
      expect(m.ok, spoken).toBe(true);
      if (m.ok) expect(m.option.modifierOptionId, spoken).toBe(id);
    }
  });
  it("the service norm() produces the same key the compiler does for every alias", () => {
    // Same alias table on both sides ⇒ the cart engine can find a topping the
    // compiler resolved ("mushrooms" ↔ "Mushroom") from any of these forms.
    for (const [spoken] of cases) {
      const target = TOPPINGS.options.find((o) => o.modifierOptionId === cases.find(([s]) => s === spoken)![1])!.name;
      expect(svc.sameName(spoken, target), `${spoken} ~ ${target}`).toBe(true);
    }
    expect(svc.norm("GP")).toBe("green pepper");
    expect(svc.norm("Jalapeño")).toBe("jalapeno");
    expect(svc.norm("meatlovers")).toBe("meat lover");
    expect(svc.norm("Meat Lovers")).toBe("meat lover");
    expect(svc.norm("veggie")).toBe("vegetable");
    expect(svc.SPOKEN_ALIASES.length).toBeGreaterThan(8);
  });
});
