/**
 * A real call → a sim Scenario. Pins the canonicalisation rules the runner
 * compares against: lowercase, sorted options, halves from the kitchen
 * prefixes, "2x" doubles, combo picks, synthetic asr excluded, and the
 * approximated-cart fallback flagged loudly.
 */
import { describe, it, expect } from "vitest";
import { buildRegressionScenario, lineFromOrderItem, callerTurnsFromEvents } from "./regression-case";

const PIZZA = new Set(["pz_large"]);
const at = new Date("2026-08-15T18:30:00.000Z");

const asr = (seq: number, text: string, synthetic = false) => ({ seq, type: "asr", turn: seq, payload: { text, lang: "en", synthetic } });

describe("callerTurnsFromEvents", () => {
  it("keeps only real caller speech, in seq order", () => {
    const turns = callerTurnsFromEvents([
      asr(5, "That's it."),
      { seq: 2, type: "model_text", turn: 1, payload: { text: "Sure" } },
      asr(1, "  Hi, a large pepperoni please  "),
      asr(3, "(silence — continue)", true),
      { seq: 4, type: "asr", turn: 2, payload: { text: "   " } },
    ]);
    expect(turns).toEqual(["Hi, a large pepperoni please", "That's it."]);
  });
});

describe("lineFromOrderItem", () => {
  it("simple item: options lowercased + sorted, size from the variant", () => {
    const l = lineFromOrderItem(
      { menuItemId: "wings", name: "Wings", variantName: "20 pc", quantity: 2, modifiers: [{ name: "Hot" }, { name: "Blue Cheese" }], bundleItems: null },
      PIZZA,
    );
    expect(l).toEqual({ item: "wings", name: "Wings", size: "20 pc", qty: 2, options: ["blue cheese", "hot"] });
  });

  it("pizza: halves from (L.H)/(R.H)/(W) prefixes, doubles folded, ', Light' stripped, review note", () => {
    const l = lineFromOrderItem(
      {
        menuItemId: "pz_large",
        name: "Large 3 Topping",
        variantName: null,
        quantity: 1,
        modifiers: [{ name: "(W) Mushroom" }, { name: "(W) Mushroom" }, { name: "(L.H) Pepperoni, Light" }, { name: "(R.H) Olives" }, { name: "Thin Crust" }],
        bundleItems: null,
      },
      PIZZA,
    );
    expect(l.halves).toEqual({ left: ["pepperoni"], right: ["olives"], whole: ["2x mushroom", "thin crust"] });
    expect(l.options).toEqual([]);
    expect(l.note).toMatch(/review/);
  });

  it("combo: picks from bundleItems, each canonicalised on its own", () => {
    const l = lineFromOrderItem(
      {
        menuItemId: "combo_2pz",
        name: "2 Pizza Combo",
        variantName: null,
        quantity: 1,
        modifiers: [],
        bundleItems: [
          { menuItemId: "pz_large", name: "Large", modifiers: [{ name: "Pepperoni" }], slotLabel: "Pizza 1" },
          { menuItemId: "pop", name: "Pop", variantName: "2L", modifiers: [{ name: "Coke" }] },
        ],
      },
      PIZZA,
    );
    expect(l.picks).toEqual([
      { slot: "pizza 1", item: "pz_large", name: "Large", options: [], halves: { left: [], right: [], whole: ["pepperoni"] } },
      { slot: "", item: "pop", name: "Pop", size: "2l", options: ["coke"] },
    ]);
  });
});

describe("buildRegressionScenario", () => {
  it("order_placed + order on file → mustPlace with the canonical cart and fulfilment", () => {
    const s = buildRegressionScenario({
      callSid: "CA0123456789abcdef",
      startedAt: at,
      outcome: "order_placed",
      restaurantSlug: "luigis",
      events: [asr(1, "Large pepperoni for pickup"), asr(3, "Yes place it")],
      order: { type: "pickup", items: [{ menuItemId: "pz_large", name: "Large", variantName: null, quantity: 1, modifiers: [{ name: "Pepperoni" }], bundleItems: null }] },
      pizzaItemIds: PIZZA,
    });
    expect(s.id).toBe("R_89abcdef");
    expect(s.title).toBe("Regression from call 2026-08-15");
    expect(s.suite).toEqual(["regression"]);
    expect(s.restaurant).toBe("luigis");
    expect(s.caller).toEqual({ mode: "script", turns: ["Large pepperoni for pickup", "Yes place it"] });
    expect(s.expected.mustPlace).toBe(true);
    expect(s.expected.fulfilment).toEqual({ type: "pickup" });
    expect(s.expected.cart.lines[0].halves?.whole).toEqual(["pepperoni"]);
  });

  it("no order → approximated from the LAST cart event and flagged for review", () => {
    const s = buildRegressionScenario({
      callSid: "CAxyz",
      startedAt: at,
      outcome: "abandoned",
      restaurantSlug: "luigis",
      events: [
        { seq: 2, type: "cart", turn: 1, payload: { hash: "h1", lines: [{ description: "1 large pepperoni", quantity: 1 }], fulfilment: { type: "delivery" } } },
        { seq: 5, type: "cart", turn: 2, payload: { hash: "h2", lines: [{ description: "2 large pepperoni", quantity: 2, halves: { left: [], right: [], whole: ["Pepperoni"] } }], fulfilment: { type: "delivery" } } },
      ],
      order: null,
      pizzaItemIds: PIZZA,
    });
    expect(s.expected.mustPlace).toBe(false);
    expect(s.title).toMatch(/approximated/);
    expect(s.expected.cart.lines).toEqual([
      { item: "", name: "2 large pepperoni", qty: 2, options: [], halves: { left: [], right: [], whole: ["pepperoni"] }, note: expect.stringMatching(/approximated/) },
    ]);
    expect(s.expected.fulfilment).toEqual({ type: "delivery" });
  });

  it("nothing at all → empty cart, still a valid scenario", () => {
    const s = buildRegressionScenario({ callSid: "CA1", startedAt: at, outcome: null, restaurantSlug: "x", events: [], order: null, pizzaItemIds: new Set() });
    expect(s.expected.cart.lines).toEqual([]);
    expect(s.caller).toEqual({ mode: "script", turns: [] });
    expect(s.expected.mustPlace).toBe(false);
  });
});
