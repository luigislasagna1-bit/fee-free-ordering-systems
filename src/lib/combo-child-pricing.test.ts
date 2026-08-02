/**
 * The parity suite for the combo-pizza money hole (Luigi 2026-08-02).
 *
 * Half of these tests replicate the OLD composer-side formula
 * (extrasFee = computePrice(...) − basePrice) so honest in-flight carts keep
 * their totals when the server stops trusting the client. The other half prove
 * a tampered payload can no longer move money.
 */
import { describe, expect, it } from "vitest";
import { priceComboPizzaChildren, type ComboChildGroup } from "./combo-child-pricing";

// One topping group (library id LIB-TOP) + one crust group, as the DB returns them.
const TOPPING_GROUP: ComboChildGroup = {
  id: "g-top-attached",
  libraryGroupId: "LIB-TOP",
  options: [
    { id: "pep", name: "Pepperoni", priceAdjustment: 2.5 },
    { id: "mush", name: "Mushrooms", priceAdjustment: 1.5 },
  ],
};
const CRUST_GROUP: ComboChildGroup = {
  id: "g-crust",
  options: [{ id: "thin", name: "Thin Crust", priceAdjustment: 1 }],
};
const GROUPS = [TOPPING_GROUP, CRUST_GROUP];

const pizzaConfig = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    isPizza: true,
    toppingGroupIds: ["LIB-TOP"], // library id — the group matches via libraryGroupId
    extraToppingPrice: 2,
    includedToppings: 1,
    halfToppingMultiplier: 0.5,
    ...over,
  });

const mod = (id: string, name: string) => ({ modifierOptionId: id, name });

describe("per-pizza mode parity with the old composer delta", () => {
  it("symmetric (default): crust + 3 toppings, 1 included @ $2 → extras 5.00", () => {
    // Old client math: computePrice − base = crust 1 + baseAdj(−2) + charges(3×2) = 5.
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig(),
        variantName: null,
        rawModifiers: [mod("thin", "Thin Crust"), mod("pep", "Pepperoni"), mod("pep", "Pepperoni"), mod("mush", "Mushrooms")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(5);
    // Display: first topping (the included one) shows $0, others show the flat rate.
    expect(r.validatedMods.map((m) => m.priceAdjustment)).toEqual([1, 0, 2, 2]);
  });

  it("legacy credits (reduceOnRemove false): first topping free, no base credit", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ reduceOnRemove: false }),
        variantName: null,
        rawModifiers: [mod("pep", "Pepperoni"), mod("mush", "Mushrooms")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(2); // [0, 2] — matches old computePrice legacy branch
  });

  it("per-option model (flat 0): each topping at its own option price", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ extraToppingPrice: 0 }),
        variantName: null,
        rawModifiers: [mod("pep", "Pepperoni"), mod("mush", "Mushrooms")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(4); // 2.50 + 1.50
  });

  it("variantToppingPrices override resolves by variant NAME", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ includedToppings: 0, variantToppingPrices: { Large: 3 } }),
        variantName: "Large",
        rawModifiers: [mod("pep", "Pepperoni")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(3);
  });

  it("(L.H)/(R.H) lines halve: topping AND non-topping", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ includedToppings: 0 }),
        variantName: null,
        rawModifiers: [mod("pep", "(L.H) Pepperoni"), mod("thin", "(R.H) Thin Crust")],
        candidateGroups: GROUPS,
      }],
    });
    // topping: 2 × 0.5 = 1; crust line halved: 1 × 0.5 = 0.5
    expect(r.extrasFee).toBe(1.5);
  });

  it("extrasCharge OFF → zero fee, lines survive with ZERO display price", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: false,
      children: [{
        pizzaConfigRaw: pizzaConfig(),
        variantName: null,
        rawModifiers: [mod("thin", "Thin Crust"), mod("pep", "Pepperoni")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(0);
    // Receipts print "(+$)" on any positive display price — a free-extras
    // combo collected nothing, so every line must show $0. (Review 2026-08-02.)
    expect(r.validatedMods.map((m) => m.priceAdjustment)).toEqual([0, 0]);
  });
});

describe("tamper resistance", () => {
  it("unknown modifierOptionId is dropped — no charge, no print", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ includedToppings: 0 }),
        variantName: null,
        rawModifiers: [mod("fake-option", "Caviar Supreme"), mod("pep", "Pepperoni")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.validatedMods.map((m) => m.name)).toEqual(["Pepperoni"]);
    expect(r.extrasFee).toBe(2);
  });

  it("client-sent priceAdjustment on the line is ignored (DB reprices)", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: pizzaConfig({ extraToppingPrice: 0 }),
        variantName: null,
        rawModifiers: [{ ...mod("pep", "Pepperoni"), priceAdjustment: 0.01 } as never],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(2.5); // DB option price, not the client's 1¢
  });

  it("no engine (unparsable pizzaConfig) → plain DB modifier pricing", () => {
    const [r] = priceComboPizzaChildren({
      extrasCharge: true,
      children: [{
        pizzaConfigRaw: "{not json",
        variantName: null,
        rawModifiers: [mod("pep", "Pepperoni")],
        candidateGroups: GROUPS,
      }],
    });
    expect(r.extrasFee).toBe(2.5);
  });
});

describe("pool mode (sharedToppings)", () => {
  const child = (mods: Array<{ modifierOptionId?: unknown; name?: unknown }>) => ({
    pizzaConfigRaw: pizzaConfig({ includedToppings: 7 }), // must be ignored under the pool
    variantName: null,
    rawModifiers: mods,
    candidateGroups: GROUPS,
  });

  it("Luigi example: 2 pizzas / 6 shared — 1 + 5 free, 7th charged", () => {
    const rs = priceComboPizzaChildren({
      extrasCharge: true,
      sharedToppings: 6,
      children: [
        child([mod("pep", "Pepperoni")]),
        child([mod("pep", "Pepperoni"), mod("pep", "Pepperoni"), mod("pep", "Pepperoni"), mod("pep", "Pepperoni"), mod("pep", "Pepperoni"), mod("mush", "Mushrooms")]),
      ],
    });
    expect(rs[0].extrasFee).toBe(0);
    expect(rs[1].extrasFee).toBe(2); // exactly the 7th, at the flat rate
    expect(rs[1].validatedMods.map((m) => m.priceAdjustment)).toEqual([0, 0, 0, 0, 0, 2]);
    expect(rs[0].toppingHalfUnitsUsed).toBe(2);
    expect(rs[1].toppingHalfUnitsUsed).toBe(10);
  });

  it("NO per-pizza base credit under the pool (double-credit regression)", () => {
    // Symmetric cfg with includedToppings 7 would grant a −14 base credit in
    // per-pizza mode. Under the pool the only free toppings are the pool's.
    const rs = priceComboPizzaChildren({
      extrasCharge: true,
      sharedToppings: 1,
      children: [child([mod("pep", "Pepperoni"), mod("pep", "Pepperoni")])],
    });
    expect(rs[0].extrasFee).toBe(2); // 1 free from pool + 1 charged; NOT −14 + …
  });

  it("pool overage charges even when extrasCharge is OFF; paid crust stays free", () => {
    const rs = priceComboPizzaChildren({
      extrasCharge: false,
      sharedToppings: 1,
      children: [{
        pizzaConfigRaw: pizzaConfig(),
        variantName: null,
        rawModifiers: [mod("thin", "Thin Crust"), mod("pep", "Pepperoni"), mod("pep", "Pepperoni")],
        candidateGroups: GROUPS,
      }],
    });
    expect(rs[0].extrasFee).toBe(2); // 2nd topping charged; crust (+$1) NOT charged
    // Display mirrors the money: crust $0 (free), topping 1 $0 (pool), topping 2 $2.
    expect(rs[0].validatedMods.map((m) => m.priceAdjustment)).toEqual([0, 0, 2]);
  });

  it("composer and server agree byte-for-byte on the same inputs", () => {
    const children = [
      child([mod("pep", "(L.H) Pepperoni"), mod("mush", "Mushrooms")]),
      child([mod("pep", "Pepperoni"), mod("pep", "Pepperoni")]),
    ];
    const a = priceComboPizzaChildren({ extrasCharge: true, sharedToppings: 2, children });
    const b = priceComboPizzaChildren({ extrasCharge: true, sharedToppings: 2, children });
    expect(a).toEqual(b); // pure function — the preview==charge construction
  });
});
