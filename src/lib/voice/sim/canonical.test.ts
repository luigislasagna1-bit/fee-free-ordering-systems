/**
 * Canonical reduction of the engine's cart and of the /api/orders payload —
 * both must land on the same shape from the same wire line, and normalization
 * must be order-independent and merge identical lines.
 */
import { describe, expect, it } from "vitest";
import snapshotJson from "./fixtures/luigis.menu.json";
import type { MenuSnapshot } from "./snapshot-types";
import type { CartLine, CartState } from "../../../../services/nabil-voice/src/cart-engine";
import { normalizeCanonical, parseNotes, toCanonicalFromCart, toCanonicalFromPlaced } from "./canonical";
import { createFakeBackend } from "./fake-backend";

const snapshot = snapshotJson as unknown as MenuSnapshot;
const SLUG = snapshot.slug;

const LARGE1 = "cmpuex5ze0aet04kvpjtep8fd";
const LARGE3 = "cmpuex5vp0a7704kve0ywsxp7";
const LARGE_WINGS_COMBO = "cmpuex1ie01rj04kvf6toxs1j";
const WINGS = "cmpuex6kl0ay804kvuo7b8w4d";
const HAWAIIAN = "cmpuex5fl098604kvtaehpc6l";
const VANILLA_COKE = "cmpuex6qg0b1q04kv88agzzad";

/** Option id by name across an item's groups (throws if the fixture moved). */
function opt(itemId: string, name: string): { modifierOptionId: string; name: string } {
  for (const g of snapshot.items[itemId].modifierGroups) {
    const o = g.options.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (o) return { modifierOptionId: o.modifierOptionId, name: o.name };
  }
  throw new Error(`no option ${name} on ${itemId}`);
}
const pre = (p: string, o: { modifierOptionId: string; name: string }) => ({ modifierOptionId: o.modifierOptionId, name: `${p}${o.name}` });
const variantId = (itemId: string, name: string) => snapshot.items[itemId].variants.find((v) => v.name === name)!.variantId;

const emptyState = (lines: CartLine[]): CartState => ({
  lines,
  nextLineNo: lines.length + 1,
  turn: 3,
  fulfilment: { type: "pickup", pin: null, check: null },
  customer: { name: "Marco", phone: "6475550100", phoneSource: "caller_id" },
  focusLineId: null,
  lastQuote: null,
  orderNotes: null,
  placedOrders: [],
});
const line = (partial: Partial<CartLine> & Pick<CartLine, "lineId" | "kind" | "intent" | "compiled">): CartLine => ({
  readBack: "",
  halves: null,
  pricingNote: null,
  status: "complete",
  questions: [],
  aliases: [],
  addedTurn: 1,
  lastTouchedTurn: 1,
  pickSlots: [],
  meta: {},
  ...partial,
});

describe("toCanonicalFromCart", () => {
  it("simple item: variant name → size, all modifiers → options (lowercased, sorted)", () => {
    const state = emptyState([
      line({
        lineId: "L1",
        kind: "item",
        intent: { menuItemId: WINGS, quantity: 1, size: "20", options: ["hot mixed"] },
        compiled: { menuItemId: WINGS, variantId: variantId(WINGS, "20"), quantity: 1, modifiers: [opt(WINGS, "Hot Mixed")], notes: null },
      }),
    ]);
    expect(toCanonicalFromCart(state, snapshot)).toEqual({
      lines: [{ item: WINGS, name: "Chicken Wings", size: "20", qty: 1, options: ["hot mixed"] }],
    });
  });

  it("pizza: crust/sauce/cheese/cook-level dropped, toppings by side with prefixes stripped, doubles as '2x'", () => {
    const mods = [
      opt(LARGE1, "REGULAR"),
      opt(LARGE1, "Pizza Sauce Base"),
      opt(LARGE1, "Regular Cheese"),
      opt(LARGE1, "Regular Cooked"),
      pre("(L.H) ", opt(LARGE1, "Pepperoni")),
      pre("(L.H) ", opt(LARGE1, "Mushrooms")),
      pre("(R.H) ", opt(LARGE1, "Green Peppers")),
      pre("(W) ", opt(LARGE1, "Bacon")),
      pre("(W) ", opt(LARGE1, "Bacon")),
    ];
    const state = emptyState([
      line({
        lineId: "L1",
        kind: "pizza",
        intent: { menuItemId: LARGE1, quantity: 1, toppings: [] },
        compiled: { menuItemId: LARGE1, variantId: null, quantity: 1, modifiers: mods, notes: null },
      }),
    ]);
    const c = toCanonicalFromCart(state, snapshot);
    expect(c.lines).toEqual([
      { item: LARGE1, name: "Large 1 Topping", qty: 1, options: [], halves: { left: ["mushrooms", "pepperoni"], right: ["green peppers"], whole: ["2x bacon"] } },
    ]);
  });

  it("an unsplit pizza has everything under whole; NO-notes become excluded, the rest stays a note", () => {
    const mods = [opt(HAWAIIAN, "REGULAR"), opt(HAWAIIAN, "Regular Cheese"), opt(HAWAIIAN, "Pepperoni"), opt(HAWAIIAN, "Pineapple")];
    const state = emptyState([
      line({
        lineId: "L2",
        kind: "pizza",
        intent: { menuItemId: HAWAIIAN, quantity: 2, size: "large", toppings: [], excludeToppings: ["ham"] },
        compiled: { menuItemId: HAWAIIAN, variantId: variantId(HAWAIIAN, "Large"), quantity: 2, modifiers: mods, notes: "well done; NO Ham" },
      }),
    ]);
    const c = toCanonicalFromCart(state, snapshot);
    expect(c.lines).toEqual([
      { item: HAWAIIAN, name: "Hawaiian Pizza", size: "large", qty: 2, options: [], halves: { left: [], right: [], whole: ["pepperoni", "pineapple"] }, excluded: ["ham"], note: "well done" },
    ]);
  });

  it("skips needs_info lines (nothing compiled)", () => {
    const state = emptyState([
      line({ lineId: "L1", kind: "item", intent: { menuItemId: WINGS, quantity: 1, options: [] }, compiled: null, status: "needs_info", questions: ["Which size?"] }),
      line({ lineId: "L2", kind: "item", intent: { menuItemId: VANILLA_COKE, quantity: 1, options: [] }, compiled: { menuItemId: VANILLA_COKE, variantId: null, quantity: 1, modifiers: [], notes: null } }),
    ]);
    expect(toCanonicalFromCart(state, snapshot).lines.map((l) => l.item)).toEqual([VANILLA_COKE]);
  });

  it("combo: picks carry the engine's slot labels; the placed payload re-derives the same labels", async () => {
    // Build the combo line through the REAL compiler so the wire shape is authentic.
    const b = createFakeBackend(snapshot);
    const r = await b.buildLine({
      slug: SLUG,
      kind: "combo",
      intent: {
        menuItemId: LARGE_WINGS_COMBO,
        picks: [
          { menuItemId: LARGE3, toppings: [{ name: "pepperoni", placement: "left" }, { name: "mushrooms", placement: "right" }] },
          { menuItemId: WINGS, options: ["hot mixed"] },
        ],
      },
      askGroupIds: [],
    });
    expect(r.ok).toBe(true);
    const intentPicks = [{ pickId: "P1", menuItemId: LARGE3 }, { pickId: "P2", menuItemId: WINGS }];
    const state = emptyState([
      line({
        lineId: "L1",
        kind: "combo",
        intent: { menuItemId: LARGE_WINGS_COMBO, quantity: 1, picks: intentPicks as never },
        compiled: r.json.line,
        pickSlots: r.json.pickSlots.map((ps: any, i: number) => ({ pickId: intentPicks[ps.index].pickId, slotLabel: ps.slotLabel })),
      }),
    ]);
    const fromCart = toCanonicalFromCart(state, snapshot);
    const fromPlaced = toCanonicalFromPlaced({ items: [r.json.line] }, snapshot);
    expect(fromCart).toEqual(fromPlaced);
    expect(fromCart.lines[0].picks).toEqual([
      { slot: "chicken wings", item: WINGS, name: "Chicken Wings", size: "20", options: ["hot mixed"] },
      { slot: "pizza", item: LARGE3, name: "Large 3 Topping", options: [], halves: { left: ["pepperoni"], right: ["mushrooms"], whole: [] } },
    ]);
  });
});

describe("parseNotes", () => {
  it("separates NO markers (line and per-child) from free text", () => {
    const p = parseNotes("ring the bell; NO Ham; Chicken Wings: NO Celery; extra crispy");
    expect(p.excluded).toEqual(["ham"]);
    expect(p.note).toBe("ring the bell; extra crispy");
    expect(p.childExcluded.get("chicken wings")).toEqual(["celery"]);
  });
});

describe("normalizeCanonical", () => {
  it("is order-independent, lowercases, sorts, and merges identical lines summing qty", () => {
    const a = normalizeCanonical({
      lines: [
        { item: "B", qty: 1, options: ["Ranch"] },
        { item: "A", qty: 2, options: [], halves: { left: ["Pepperoni"], right: ["Mushrooms"], whole: [] } },
        { item: "A", qty: 1, options: [], halves: { left: ["pepperoni"], right: ["mushrooms"], whole: [] } },
      ],
    });
    const b = normalizeCanonical({
      lines: [
        { item: "A", qty: 3, options: [], halves: { left: ["pepperoni"], right: ["mushrooms"], whole: [] } },
        { item: "B", qty: 1, options: ["ranch"] },
      ],
    });
    expect(a).toEqual(b);
    expect(a.lines.find((l) => l.item === "A")?.qty).toBe(3);
  });

  it("does NOT merge lines that differ in size, options, halves or note", () => {
    const c = normalizeCanonical({
      lines: [
        { item: "A", qty: 1, options: [], size: "large" },
        { item: "A", qty: 1, options: [], size: "medium" },
        { item: "A", qty: 1, options: ["x"] },
        { item: "A", qty: 1, options: [], note: "well done" },
      ],
    });
    expect(c.lines).toHaveLength(4);
  });
});
