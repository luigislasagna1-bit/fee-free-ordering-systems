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
