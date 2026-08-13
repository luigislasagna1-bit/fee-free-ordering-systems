/**
 * The live-basket contract, tested against the REAL tool executor in the voice
 * service (`services/nabil-voice/src/tools.ts`).
 *
 * Every case here was a confirmed defect in the 2026-08-11 adversarial review
 * or the Loman-parity gap it exposed:
 *   • the basket survived place_order, so "oh — and a Coke" re-sent the whole
 *     first order as a second one;
 *   • there was no way to CHANGE a line, so "actually make that a large"
 *     produced two pizzas and a doubled total;
 *   • quote_order and place_order priced different customers, so the promo the
 *     caller agreed to could vanish at the till.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// CONFIG reads these at import time and throws without them.
process.env.APP_BASE_URL = "http://localhost:3001";
process.env.INTERNAL_API_SECRET = "test-internal";
process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
process.env.ANTHROPIC_API_KEY = "test-anthropic";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    buildLine: vi.fn(),
    placeOrder: vi.fn(),
    dryRunOrder: vi.fn(),
    itemOptions: vi.fn(),
    sendSms: vi.fn(),
    checkAddress: vi.fn(),
  },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { executeTool, type ToolContext } from "../../../services/nabil-voice/src/tools";

const line = (id: string) => ({
  menuItemId: id,
  variantId: "v_l",
  quantity: 1,
  modifiers: [{ modifierOptionId: "o_pep", name: "Pepperoni" }],
});

function ctx(): ToolContext {
  return {
    token: { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+16475550000" },
    cfg: {
      canTakeOrders: true,
      canBookReservations: true,
      canAnswerFaq: true,
      quoteEta: true,
      smsConfirmations: true,
      maxCallSeconds: 600,
      allowScheduledOrders: false,
      afterHoursBehavior: "take_orders",
      allowPizzaCombo: true,
      pizzaAskGroups: [],
      languages: [],
    },
    menu: null,
    context: null,
    returning: null,
    cashDeliveryBlocked: false,
    pendingTransfer: null,
    placedOrders: [],
    basket: [],
  } as unknown as ToolContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.placeOrder.mockResolvedValue({ ok: true, json: { id: "ord_1", orderNumber: "ORD-1", total: 24.5 } });
  apiMock.dryRunOrder.mockResolvedValue({ ok: true, json: { total: 24.5, subtotal: 20, tax: 4.5 } });
});

describe("place_order empties the basket", () => {
  it("a follow-up order does NOT re-send the food that was already placed", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza with Pepperoni", pricingNote: null, unresolved: [] },
    });

    await executeTool("add_pizza", { menuItemId: "mi_pizza", size: "large" }, c);
    expect(c.basket).toHaveLength(1);

    await executeTool("place_order", { type: "pickup", customerName: "Ada Lovelace", items: [] }, c);
    expect(c.basket).toHaveLength(0);

    // "Oh — can I also get a Coke?"
    await executeTool(
      "place_order",
      { type: "pickup", customerName: "Ada Lovelace", items: [{ menuItemId: "mi_coke", quantity: 1 }] },
      c,
    );
    const second = apiMock.placeOrder.mock.calls[1][0] as { items: Array<{ menuItemId: string }> };
    expect(second.items.map((i) => i.menuItemId)).toEqual(["mi_coke"]);
  });

  it("still refuses to place the SAME basket twice (the 2026-08-10 duplicate)", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza", size: "large" }, c);
    await executeTool("place_order", { type: "pickup", customerName: "Ada Lovelace" }, c);

    // A second "yes" with nothing new added must not create a second order.
    const again = (await executeTool(
      "place_order",
      { type: "pickup", customerName: "Ada Lovelace", items: [{ menuItemId: "mi_coke", quantity: 1 }] },
      c,
    )) as Record<string, unknown>;
    expect(apiMock.placeOrder).toHaveBeenCalledTimes(2); // genuinely different basket
    expect(again.ok).toBe(true);
  });
});

describe("revise_line changes a line instead of adding another", () => {
  it("replaces the line in place and recompiles through the compiler", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Medium Pizza with Pepperoni", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza", size: "medium" }, c);

    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza with Pepperoni", pricingNote: null, unresolved: [] },
    });
    const out = (await executeTool("revise_line", { lineNumber: 1, size: "large" }, c)) as Record<string, unknown>;

    expect(c.basket).toHaveLength(1);
    expect(out.changed).toBe("Large Pizza with Pepperoni");
    // The change was MERGED into the original intent and recompiled — never
    // patched onto the compiled payload.
    const secondCall = apiMock.buildLine.mock.calls[1][0] as { intent: Record<string, unknown> };
    expect(secondCall.intent).toMatchObject({ menuItemId: "mi_pizza", size: "large" });
  });

  it("merges a topping change rather than wiping the rest of the pizza", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool(
      "add_pizza",
      { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "onion" }, { name: "pepperoni" }] },
      c,
    );
    await executeTool(
      "revise_line",
      { lineNumber: 1, removeToppings: ["onion"], addToppings: [{ name: "mushroom", placement: "left" }] },
      c,
    );
    const intent = (apiMock.buildLine.mock.calls[1][0] as { intent: any }).intent;
    expect(intent.toppings).toEqual([{ name: "pepperoni" }, { name: "mushroom", placement: "left" }]);
  });

  it("leaves the order UNCHANGED when the compiler needs more information", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza", size: "large" }, c);
    const before = c.basket[0];

    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: { line: null, readBack: "", pricingNote: null, unresolved: ["Which crust?"] },
    });
    const out = (await executeTool("revise_line", { lineNumber: 1, crust: "sourdough" }, c)) as Record<string, unknown>;

    expect(out.needsInfo).toBe(true);
    expect(c.basket[0]).toBe(before);
  });

  it("asks which line when the number doesn't exist", async () => {
    const c = ctx();
    const out = (await executeTool("revise_line", { lineNumber: 3 }, c)) as Record<string, unknown>;
    expect(out.error).toBe(true);
    expect(out.code).toBe("no_such_line");
  });
});

describe("remove_line", () => {
  it("takes the line off and renumbers what's left", async () => {
    const c = ctx();
    apiMock.buildLine
      .mockResolvedValueOnce({ ok: true, json: { line: line("a"), readBack: "Pizza A", pricingNote: null, unresolved: [] } })
      .mockResolvedValueOnce({ ok: true, json: { line: line("b"), readBack: "Pizza B", pricingNote: null, unresolved: [] } });
    await executeTool("add_pizza", { menuItemId: "a" }, c);
    await executeTool("add_pizza", { menuItemId: "b" }, c);

    const out = (await executeTool("remove_line", { lineNumber: 1 }, c)) as Record<string, unknown>;
    expect(out.removed).toBe("Pizza A");
    expect(out.order).toEqual([{ line: 1, description: "Pizza B" }]);
  });
});

describe("quote_order prices what place_order will charge", () => {
  it("refuses to quote a delivery order without the address", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c);

    const out = (await executeTool("quote_order", { type: "delivery" }, c)) as Record<string, unknown>;
    expect(out.code).toBe("delivery_address_needed");
    expect(apiMock.dryRunOrder).not.toHaveBeenCalled();
  });

  it("sends the delivery address so the quote carries the right zone fee", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c);
    await executeTool(
      "quote_order",
      { type: "delivery", deliveryStreet: "14 Kent St", deliveryCity: "Milton", deliveryZip: "L9T" },
      c,
    );
    expect(apiMock.dryRunOrder.mock.calls[0][0]).toMatchObject({
      deliveryAddress: "14 Kent St",
      deliveryCity: "Milton",
      deliveryZip: "L9T",
    });
  });

  it("quotes and charges the SAME customer once a number is given", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large Pizza", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c);

    await executeTool("quote_order", { type: "pickup", customerPhone: "+14165550142" }, c);
    await executeTool("place_order", { type: "pickup", customerName: "Ada Lovelace" }, c);

    const quoted = apiMock.dryRunOrder.mock.calls[0][0] as { customerPhone: string };
    const charged = apiMock.placeOrder.mock.calls[0][0] as { customerPhone: string };
    expect(quoted.customerPhone).toBe("+14165550142");
    expect(charged.customerPhone).toBe(quoted.customerPhone);
  });
});

/**
 * ORD-342105315, 2026-08-11 — the first real pizza order Luigi placed by phone.
 * The model called add_pizza AND restated the same pizza in place_order's
 * `items`, so the kitchen got two pizzas and the caller was quoted $36.98 for
 * one. The restated copy carried no modifiers, so the included-topping credit
 * came off with nothing to pay for it: $17.74 billed as $14.99.
 *
 * The adversarial review raised exactly this and two skeptics talked me out of
 * it. It is pinned here so nobody can be talked out of it again.
 */
describe("a pizza can never reach the order as a hand-written item", () => {
  const withBuilders = () => {
    const c = ctx();
    (c as { builderItemIds?: Set<string> }).builderItemIds = new Set(["mi_pizza", "mi_combo"]);
    return c;
  };

  it("drops a pizza the model restates in `items` alongside the compiled one", async () => {
    const c = withBuilders();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large 1 Topping with Pepperoni", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza", size: "large", toppings: [{ name: "pepperoni" }] }, c);

    await executeTool(
      "place_order",
      {
        type: "pickup",
        customerName: "Sam Phone",
        // exactly what the model did on the live call
        items: [{ menuItemId: "mi_pizza", quantity: 1 }],
      },
      c,
    );

    const sent = apiMock.placeOrder.mock.calls[0][0] as { items: Array<{ menuItemId: string }> };
    expect(sent.items).toHaveLength(1);
    expect(sent.items[0]).toHaveProperty("modifiers"); // the COMPILED line, not the bare one
  });

  it("drops a pizza even when nothing was compiled — it must go through add_pizza", async () => {
    const c = withBuilders();
    const out = (await executeTool(
      "place_order",
      { type: "pickup", customerName: "Sam Phone", items: [{ menuItemId: "mi_pizza", quantity: 1 }] },
      c,
    )) as Record<string, unknown>;
    expect(out.code).toBe("empty_order");
    expect(apiMock.placeOrder).not.toHaveBeenCalled();
  });

  it("still lets a simple item through", async () => {
    const c = withBuilders();
    await executeTool(
      "place_order",
      { type: "pickup", customerName: "Sam Phone", items: [{ menuItemId: "mi_coke", quantity: 2 }] },
      c,
    );
    const sent = apiMock.placeOrder.mock.calls[0][0] as { items: Array<{ menuItemId: string }> };
    expect(sent.items.map((i) => i.menuItemId)).toEqual(["mi_coke"]);
  });

  it("quote_order drops it too, so the spoken total matches what gets charged", async () => {
    const c = withBuilders();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large 1 Topping", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c);
    await executeTool("quote_order", { type: "pickup", items: [{ menuItemId: "mi_pizza", quantity: 1 }] }, c);
    const quoted = apiMock.dryRunOrder.mock.calls[0][0] as { items: unknown[] };
    expect(quoted.items).toHaveLength(1);
  });
});

/**
 * DAY DEALS. Luigi tested on a Tuesday and paid $17.74 for a pizza his own menu
 * was selling at $11.99 that day. The saving is computed server-side and comes
 * back on the add_pizza result; the model's only job is to offer it and, if the
 * caller says yes, ask for the swap — which recompiles like any other change.
 */
describe("day deals", () => {
  it("passes the owner's setting through so deals are only hunted when enabled", async () => {
    const c = ctx();
    (c.cfg as { offerDayDeals?: boolean }).offerDayDeals = true;
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large 1 Topping", pricingNote: null, unresolved: [] },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c);
    expect((apiMock.buildLine.mock.calls[0][0] as { offerDeals: boolean }).offerDeals).toBe(true);
  });

  it("surfaces the deal with the SERVER's saving, never a recomputed one", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: {
        line: line("mi_pizza"),
        readBack: "Large 1 Topping with Pepperoni",
        pricingNote: null,
        unresolved: [],
        betterDeal: { menuItemId: "mi_tuesday", name: "Tuesday - Large Pizza Special", saving: 5.75, subtotal: 11.99, readBack: "Tuesday Special with Pepperoni" },
      },
    });
    const out = (await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c)) as any;
    expect(out.betterDeal).toEqual({
      name: "Tuesday - Large Pizza Special",
      saves: 5.75,
      swapTo: "mi_tuesday",
      lineNumber: 1,
    });
    expect(String(out.instruction)).toContain("Tuesday - Large Pizza Special");
  });

  it("says nothing when there is no deal today", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValue({
      ok: true,
      json: { line: line("mi_pizza"), readBack: "Large 1 Topping", pricingNote: null, unresolved: [], betterDeal: null },
    });
    const out = (await executeTool("add_pizza", { menuItemId: "mi_pizza" }, c)) as any;
    expect(out.betterDeal).toBeUndefined();
    expect(String(out.instruction)).not.toContain("TELL THEM ABOUT THE DEAL");
  });

  it("accepting the deal SWAPS the line rather than adding a second pizza", async () => {
    const c = ctx();
    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: {
        line: line("mi_pizza"),
        readBack: "Large 1 Topping with Pepperoni",
        pricingNote: null,
        unresolved: [],
        betterDeal: { menuItemId: "mi_tuesday", name: "Tuesday Special", saving: 5.75, subtotal: 11.99, readBack: "Tuesday Special" },
      },
    });
    await executeTool("add_pizza", { menuItemId: "mi_pizza", toppings: [{ name: "pepperoni" }] }, c);

    apiMock.buildLine.mockResolvedValueOnce({
      ok: true,
      json: { line: line("mi_tuesday"), readBack: "Tuesday Special with Pepperoni", pricingNote: null, unresolved: [] },
    });
    await executeTool("revise_line", { lineNumber: 1, swapToItemId: "mi_tuesday" }, c);

    expect(c.basket).toHaveLength(1);
    const swapped = apiMock.buildLine.mock.calls[1][0] as { intent: any };
    expect(swapped.intent.menuItemId).toBe("mi_tuesday");
    // the caller's toppings survive the swap
    expect(swapped.intent.toppings).toEqual([{ name: "pepperoni" }]);
  });
});

describe("get_item_options gives the model what add_combo demands", () => {
  // 2026-08-13, live call: a caller ordering the Large/Wings combo asked for
  // honey garlic wings. This tool handed back bare NAMES, but add_combo requires
  // picks[].menuItemId — so the model went hunting the main menu for "Wings",
  // found the CATERING wings (50/100/200 pc), had the slot reject it, and
  // narrated three retries out loud at the caller.
  const comboRes = () => ({
    item: { name: "Large / Wings Combo", variants: [], modifierGroups: [] },
    combo: {
      sharedToppings: 6,
      slots: [
        {
          label: "Pick your wings",
          min: 1,
          max: 1,
          choices: [
            { menuItemId: "mi_wings_20", name: "Wings", variants: [{ variantId: "v20", name: "20 pc" }] },
            { menuItemId: "mi_wings_catering", name: "Wings", variants: [] },
          ],
        },
      ],
    },
  });

  it("returns each slot choice's menuItemId, not just its name", async () => {
    apiMock.itemOptions.mockResolvedValue(comboRes());
    const out = (await executeTool("get_item_options", { menuItemId: "mi_combo" }, ctx())) as any;
    const choices = out.combo.slots[0].choices;
    expect(choices[0]).toMatchObject({ name: "Wings", menuItemId: "mi_wings_20" });
    // Two choices share the name "Wings" — the id is the ONLY thing that
    // distinguishes the combo's 20pc from the catering tray.
    expect(choices.map((c: any) => c.menuItemId)).toEqual(["mi_wings_20", "mi_wings_catering"]);
  });

  it("carries the sizes a slot restricts, so an unorderable one is never offered", async () => {
    apiMock.itemOptions.mockResolvedValue(comboRes());
    const out = (await executeTool("get_item_options", { menuItemId: "mi_combo" }, ctx())) as any;
    expect(out.combo.slots[0].choices[0].sizes).toEqual(["20 pc"]);
    expect(out.combo.slots[0].choices[1].sizes).toBeUndefined();
  });

  it("passes sharedToppings through so the model stops inventing a per-pizza limit", async () => {
    apiMock.itemOptions.mockResolvedValue(comboRes());
    const out = (await executeTool("get_item_options", { menuItemId: "mi_combo" }, ctx())) as any;
    expect(out.combo.sharedToppings).toBe(6);
    expect(String(out.instruction)).toContain("SHARE");
  });

  it("tells the model to use the id given here and no other", async () => {
    apiMock.itemOptions.mockResolvedValue(comboRes());
    const out = (await executeTool("get_item_options", { menuItemId: "mi_combo" }, ctx())) as any;
    expect(String(out.instruction)).toContain("never an id you found elsewhere");
  });

  it("still trims modifier options to names — those resolve by name, not id", async () => {
    apiMock.itemOptions.mockResolvedValue({
      item: {
        name: "Large Pizza",
        variants: [{ name: "Large", price: 18 }],
        modifierGroups: [{ name: "Toppings", pizzaRole: "topping", required: false, options: [{ name: "Pepperoni", id: "o_pep" }] }],
        pizzaConfig: { includedToppings: 3 },
      },
      combo: null,
    });
    const out = (await executeTool("get_item_options", { menuItemId: "mi_pizza" }, ctx())) as any;
    expect(out.groups[0].choices).toEqual(["Pepperoni"]);
    expect(out.combo).toBeNull();
  });
});

describe("check_delivery_address — the quote and the charge must resolve the SAME zone", () => {
  const located = (over: Record<string, unknown> = {}) => ({
    ok: true,
    json: {
      hasZones: true, located: true, inside: true,
      lat: 43.51, lng: -79.88, matchedAddress: "17 Commercial St, Milton",
      zoneName: "Zone 1", deliveryFee: 7.99, minimumOrder: 25, estimatedMinutes: 45,
      distanceKm: 2.1, currency: "cad", instruction: "We deliver to this address.",
      ...over,
    },
  });

  const withAddress = async () => {
    const c = ctx();
    apiMock.checkAddress.mockResolvedValue(located());
    await executeTool("check_delivery_address", { street: "17 Commercial St", city: "Milton", zip: "L9T2J3" }, c);
    return c;
  };

  it("keeps the resolved pin and sends it to place_order as deliveryLat/Lng", async () => {
    const c = await withAddress();
    c.basket.push(line("mi_pizza") as any);
    await executeTool(
      "place_order",
      { type: "delivery", customerName: "Sam", customerPhone: "6476690808", deliveryStreet: "17 Commercial St", deliveryCity: "Milton", deliveryZip: "L9T2J3" },
      c,
    );
    const sent = apiMock.placeOrder.mock.calls[0][0] as any;
    // Without these the order lands in the "zone unverified" third state and is
    // billed the restaurant's flat fee instead of the zone's.
    expect(sent.deliveryLat).toBe(43.51);
    expect(sent.deliveryLng).toBe(-79.88);
  });

  it("sends the same pin to quote_order, so the quote can't price a different zone", async () => {
    const c = await withAddress();
    c.basket.push(line("mi_pizza") as any);
    await executeTool(
      "quote_order",
      { type: "delivery", deliveryStreet: "17 Commercial St", deliveryCity: "Milton", deliveryZip: "L9T2J3" },
      c,
    );
    const sent = apiMock.dryRunOrder.mock.calls[0][0] as any;
    expect(sent.deliveryLat).toBe(43.51);
    expect(sent.deliveryLng).toBe(-79.88);
  });

  it("NEVER lets a pin follow the caller to a different address", async () => {
    const c = await withAddress();
    c.basket.push(line("mi_pizza") as any);
    // Caller corrects the street; the old pin belongs to the old address.
    await executeTool(
      "place_order",
      { type: "delivery", customerName: "Sam", customerPhone: "6476690808", deliveryStreet: "900 Nowhere Rd", deliveryCity: "Milton" },
      c,
    );
    const sent = apiMock.placeOrder.mock.calls[0][0] as any;
    expect(sent.deliveryLat).toBeUndefined();
    expect(sent.deliveryLng).toBeUndefined();
  });

  it("matches an address back regardless of punctuation and case", async () => {
    const c = await withAddress();
    c.basket.push(line("mi_pizza") as any);
    await executeTool(
      "place_order",
      { type: "delivery", customerName: "Sam", customerPhone: "6476690808", deliveryStreet: "17 commercial st.", deliveryCity: "MILTON", deliveryZip: "l9t 2j3" },
      c,
    );
    expect((apiMock.placeOrder.mock.calls[0][0] as any).deliveryLat).toBe(43.51);
  });

  it("drops the previous pin the moment a NEW address is checked, even if that check fails", async () => {
    const c = await withAddress();
    apiMock.checkAddress.mockResolvedValue({ ok: false, status: 500, json: {} });
    await executeTool("check_delivery_address", { street: "900 Nowhere Rd" }, c);
    expect(c.deliveryCoords).toBeNull();
  });

  it("an unlocatable address does NOT dead-end the caller", async () => {
    const c = ctx();
    apiMock.checkAddress.mockResolvedValue({
      ok: true,
      json: { hasZones: true, located: false, instruction: "Ask once for the missing piece." },
    });
    const out = (await executeTool("check_delivery_address", { street: "asdfgh" }, c)) as any;
    expect(out.located).toBe(false);
    expect(c.deliveryCoords).toBeNull();
    // No pin, but nothing refuses the order either — hard-blocking an
    // unlocatable address is what stranded a real customer on 2026-08-01.
    expect(out.error).toBeUndefined();
  });

  it("a geocoder outage tells the model to carry on, not to blame the caller", async () => {
    const c = ctx();
    apiMock.checkAddress.mockResolvedValue({ ok: false, status: 502, json: { code: "upstream" } });
    const out = (await executeTool("check_delivery_address", { street: "17 Commercial St" }, c)) as any;
    expect(String(out.instruction)).toContain("do NOT refuse the order");
    expect(String(out.instruction)).toContain("Do NOT tell the caller anything about systems");
  });

  it("passes an out-of-zone answer through with its fee instead of refusing", async () => {
    const c = ctx();
    apiMock.checkAddress.mockResolvedValue(
      located({ inside: false, zoneName: "Zone 8", deliveryFee: 49.99, instruction: "This address is BEYOND every delivery zone." }),
    );
    const out = (await executeTool("check_delivery_address", { street: "Far Away Rd" }, c)) as any;
    expect(out.inside).toBe(false);
    expect(out.deliveryFee).toBe(49.99);
    // Still pinned — the caller may well accept it, and if they do the order
    // must resolve that same outer zone.
    expect(c.deliveryCoords).not.toBeNull();
  });
});
