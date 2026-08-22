/**
 * The order-tool contract, tested against the REAL tool executor in the voice
 * service (`services/nabil-voice/src/tools.ts`) driving the REAL cart engine
 * (`cart-engine.ts`) — with the app's HTTP surface (`VoiceApi`) mocked at the
 * boundary, exactly the way `session.ts` wires it (the compiler port is an
 * adapter over `api.buildLine`, copied from session.ts's `compile`).
 *
 * Every case here was a confirmed defect on a live call, or the parity gap one
 * exposed. The tools changed shape on 2026-08-15 (authoritative cart, stable
 * lineIds, no more `items[]` on place_order) — the BEHAVIOURS pinned here did
 * not:
 *   • the basket survived place_order, so "oh — and a Coke" re-sent the whole
 *     first order as a second one;
 *   • there was no way to CHANGE a line, so "actually make that a large"
 *     produced two pizzas and a doubled total;
 *   • quote_order and place_order priced different customers, so the promo the
 *     caller agreed to could vanish at the till (Roya, ORD-264127463);
 *   • the model restated a compiled pizza as a hand-written item and the
 *     kitchen got two (ORD-342105315).
 */
import { describe, expect, it, vi } from "vitest";

// config.ts reads these at import time; tools.ts imports it as a TYPE only, but
// keep the sibling test's convention so a future value import can't bite.
process.env.APP_BASE_URL = "http://localhost:3001";
process.env.INTERNAL_API_SECRET = "test-internal";
process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
process.env.ANTHROPIC_API_KEY = "test-anthropic";

import { autofillPicks, executeTool, toolsForConfig, canonicalPhone, TOOLS, type ToolContext } from "../../../services/nabil-voice/src/tools";
import { CartEngine, type CompileResponse } from "../../../services/nabil-voice/src/cart-engine";
import { buildMenuIndex } from "../../../services/nabil-voice/src/menu-index";
import { normalizeAgentConfig, type AgentConfig } from "../../../services/nabil-voice/src/agent-config";
import { fnv1a } from "../../../services/nabil-voice/src/basket-signature";
import type { VoiceApi } from "../../../services/nabil-voice/src/api";

/* ───────────────────────────── the call's menu ─────────────────────────── */

const MENU = {
  restaurant: { id: "r1", name: "Luigi's", currency: "usd" },
  menu: [
    {
      category: "Pizzas",
      items: [
        { menuItemId: "pz_large", name: "Large 1 Topping", price: 17.74, isPizza: true, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "pz_xl", name: "Extra Large 1 Topping", price: 21.99, isPizza: true, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "pz_tuesday", name: "Tuesday - Large Pizza Special", price: 11.99, isPizza: true, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "pz_byo", name: "Build Your Own Pizza", price: 14.99, isPizza: true, isCombo: false, hasVariants: true, sizeNames: ["Medium", "Large"] },
      ],
    },
    {
      category: "Combos",
      items: [{ menuItemId: "cb_wings", name: "Large / Wings Combo", price: 29.99, isPizza: false, isCombo: true, hasVariants: false }],
    },
    {
      category: "Drinks & Sides",
      items: [
        { menuItemId: "dr_coke", name: "Coke", price: 1.99, isPizza: false, isCombo: false, hasVariants: false, variants: [] },
        {
          menuItemId: "wings",
          name: "Wings",
          price: 12,
          isPizza: false,
          isCombo: false,
          hasVariants: true,
          variants: [
            { variantId: "v10", name: "10 pc", price: 12 },
            { variantId: "v20", name: "20 pc", price: 22 },
          ],
        },
        { menuItemId: "lasagna", name: "Lasagna", price: 15, isPizza: false, isCombo: false, hasVariants: false, variants: [], isSoldOut: true },
      ],
    },
  ],
  notToday: [{ name: "Thursday Smash Burger", available: "Thursdays" }],
};

const nameOf = (id: string) => MENU.menu.flatMap((c) => c.items).find((i) => i.menuItemId === id)?.name ?? id;
const cap = (s: string) => String(s).replace(/^\w/, (c) => c.toUpperCase());
const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** The /api/internal/voice/build-line JSON a real server would send back for
 *  the intents these tests use. Wings without a size come back unresolved. */
function defaultBuild(body: any) {
  const it = body?.intent ?? {};
  const qty = it.quantity ?? 1;
  const name = nameOf(it.menuItemId);
  if (it.menuItemId === "wings" && !it.size) {
    return { ok: true, status: 200, json: { line: null, readBack: `${qty}× Wings`, pricingNote: null, unresolved: ["Which size for Wings? 10 pc, 20 pc."] } };
  }
  if (body.kind === "combo") {
    const picks = (it.picks ?? []) as any[];
    return {
      ok: true,
      status: 200,
      json: {
        line: { menuItemId: it.menuItemId, variantId: null, quantity: qty, modifiers: [], isCombo: true, bundleItems: picks.map((p) => ({ menuItemId: p.menuItemId, variantId: null, name: nameOf(p.menuItemId), modifiers: [] })) },
        readBack: `${qty}× ${name}: ${picks.map((p) => nameOf(p.menuItemId)).join(", ")}`,
        pricingNote: null,
        unresolved: [],
        pickSlots: picks.map((_p, index) => ({ index, slotId: `s${index}`, slotLabel: `Slot ${index + 1}` })),
        lineSubtotal: 29.99,
      },
    };
  }
  const toppings = (it.toppings ?? []) as Array<{ name: string; placement: string }>;
  const mods = toppings.map((t) => ({ modifierOptionId: `o_${slug(t.name)}`, name: cap(t.name) }));
  const line = { menuItemId: it.menuItemId, variantId: it.size ? `v_${slug(it.size)}` : null, quantity: qty, modifiers: mods };
  const readBack = `${qty}× ${it.size ? cap(it.size) + " " : ""}${name}${mods.length ? " with " + mods.map((m) => m.name).join(", ") : ""}`;
  return { ok: true, status: 200, json: { line, readBack, pricingNote: null, unresolved: [], lineSubtotal: 10 * qty } };
}

/** A located, in-zone /check-address answer. */
const located = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: {
    hasZones: true,
    located: true,
    inside: true,
    lat: 43.51,
    lng: -79.88,
    // No matchedAddress by default: the tests below check many different
    // spoken streets against this one stub, and A6's street-mismatch gate
    // (tested with its own labelled hits further down) would flag them all.
    zoneName: "Zone 1",
    deliveryFee: 7.99,
    minimumOrder: 25,
    estimatedMinutes: 45,
    distanceKm: 2.1,
    currency: "usd",
    instruction: "We deliver to this address.",
    ...over,
  },
});

/** The session's compiler port, verbatim: HTTP build-line → CompileResponse. */
function compilerOver(api: any, restaurantSlug: string) {
  return {
    async compile(req: any): Promise<CompileResponse> {
      const res = await api.buildLine({ slug: restaurantSlug, kind: req.kind, intent: req.intent, askGroupIds: req.askGroupIds, ...(req.offerDeals ? { offerDeals: true } : {}) });
      if (!res.ok) {
        const code = String(res.json?.code ?? `http_${res.status}`);
        return { ok: false, code, message: String(res.json?.error ?? "I couldn't build that.") };
      }
      const j = res.json ?? {};
      return {
        ok: true,
        line: j.line ?? null,
        readBack: String(j.readBack ?? ""),
        pricingNote: j.pricingNote ?? null,
        unresolved: Array.isArray(j.unresolved) ? j.unresolved.map(String) : [],
        halves: j.halves ?? null,
        lineSubtotal: typeof j.lineSubtotal === "number" ? j.lineSubtotal : null,
        notices: Array.isArray(j.notices) ? j.notices.map(String) : undefined,
        toppings: Array.isArray(j.toppings) ? j.toppings : undefined,
        pickSlots: Array.isArray(j.pickSlots) ? j.pickSlots : undefined,
        autoAppliedDeal: j.autoAppliedDeal ? { standardItemName: String(j.autoAppliedDeal.standardItemName), dealName: String(j.autoAppliedDeal.dealName), dealMenuItemId: String(j.autoAppliedDeal.dealMenuItemId), saving: Number(j.autoAppliedDeal.saving ?? 0) } : null,
        switchedTo: j.switchedTo ? { from: String(j.switchedTo.from), to: String(j.switchedTo.to), menuItemId: j.switchedTo.menuItemId ? String(j.switchedTo.menuItemId) : undefined, saving: Number(j.switchedTo.saving ?? 0) } : null,
      };
    },
  };
}

function makeCtx(o: { cfg?: Partial<AgentConfig>; from?: string; currency?: string } = {}) {
  const api = {
    buildLine: vi.fn(defaultBuild),
    placeOrder: vi.fn(),
    dryRunOrder: vi.fn(),
    itemOptions: vi.fn(),
    sendSms: vi.fn(),
    checkAddress: vi.fn(),
    availability: vi.fn(),
    bookReservation: vi.fn(),
    menu: vi.fn(),
    context: vi.fn(),
    returningCaller: vi.fn(),
    previewOrder: vi.fn(),
    logCallStart: vi.fn(),
    logCall: vi.fn(),
    logEvents: vi.fn(),
    leaveMessage: vi.fn(),
    recentOrders: vi.fn(),
  };
  api.recentOrders.mockResolvedValue({ found: 0, orders: [] });
  api.leaveMessage.mockResolvedValue({ ok: true, status: 200, json: { ok: true, id: "msg_1" } });
  api.placeOrder.mockResolvedValue({ ok: true, status: 200, json: { id: "ord_1", orderNumber: "ORD-1", total: 24.5 } });
  api.dryRunOrder.mockResolvedValue({ ok: true, status: 200, json: { total: 24.5, subtotal: 20, tax: 4.5 } });
  api.sendSms.mockResolvedValue({ ok: true, status: 200, json: {} });
  api.checkAddress.mockResolvedValue(located());
  const cfg: AgentConfig = { ...normalizeAgentConfig({ allowPizzaCombo: true }), ...(o.cfg ?? {}) };
  const token = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: o.from ?? "+16475550000" };
  const menu = buildMenuIndex(MENU);
  const cart = new CartEngine({
    compiler: compilerOver(api, token.slug),
    menu,
    askGroupIds: cfg.pizzaAskGroups,
    offerDeals: cfg.offerDayDeals,
    allowPizzaCombo: cfg.allowPizzaCombo,
    callerId: canonicalPhone(token.from) || null,
    knownName: null,
  });
  cart.beginTurn();
  const ctx: ToolContext = {
    token,
    cfg,
    api: api as unknown as VoiceApi,
    cart,
    menu,
    cashDeliveryBlocked: false,
    pendingTransfer: null,
    itemOptionsCache: new Map(),
    speakExactlyThisTurn: [],
    currency: o.currency ?? "usd",
  };
  return { ctx, api };
}

const run = (ctx: ToolContext, name: string, input: any = {}) => executeTool(name, input, ctx) as Promise<any>;
const addPizza = (ctx: ToolContext, extra: Record<string, unknown> = {}) =>
  run(ctx, "add_to_order", { menuItemId: "pz_large", toppings: [{ name: "pepperoni", placement: "whole" }], ...extra });
/** Pickup + a name: everything quote_order needs besides food. */
async function ready(ctx: ToolContext, name = "Ada Lovelace") {
  await run(ctx, "set_fulfilment", { type: "pickup" });
  await run(ctx, "set_customer", { name });
}

/* ═══════════════════════════════ place_order ═══════════════════════════════ */

describe("place_order empties the cart", () => {
  it("a follow-up order does NOT re-send the food that was already placed", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    expect(ctx.cart.lines()).toHaveLength(1);
    await run(ctx, "quote_order");
    const placed = await run(ctx, "place_order");
    expect(placed.ok).toBe(true);
    expect(placed.orderNumber).toBe("ORD-1");
    expect(ctx.cart.lines()).toHaveLength(0);
    expect(placed.state.lines).toEqual([]);
    expect(placed.state.placed).toEqual([{ orderNumber: "ORD-1", total: 24.5 }]);

    // "Oh — can I also get a Coke?"
    const coke = await run(ctx, "add_to_order", { menuItemId: "dr_coke" });
    expect(coke.ok).toBe(true);
    expect(coke.lineId).toBe("L2"); // ids keep counting — never reused
    api.placeOrder.mockResolvedValue({ ok: true, status: 200, json: { id: "ord_2", orderNumber: "ORD-2", total: 2.25 } });
    await run(ctx, "quote_order");
    const second = await run(ctx, "place_order");
    expect(second.ok).toBe(true);
    const sent = api.placeOrder.mock.calls[1][0] as { items: Array<{ menuItemId: string }> };
    expect(sent.items.map((i) => i.menuItemId)).toEqual(["dr_coke"]);
  });

  it("refuses to place the SAME basket twice (the 2026-08-10 duplicate)", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    await run(ctx, "place_order");
    expect(api.placeOrder).toHaveBeenCalledTimes(1);

    // A second "yes" with nothing new — the cart is empty: reassure with the
    // SAME order (alreadyPlaced), never place again and never say "can't".
    const stray = await run(ctx, "place_order");
    expect(stray.alreadyPlaced).toBe(true);
    expect(api.placeOrder).toHaveBeenCalledTimes(1);

    // The same food built again and quoted again is the order ALREADY placed.
    ctx.cart.beginTurn();
    ctx.cart.beginTurn();
    ctx.cart.beginTurn();
    await addPizza(ctx);
    await run(ctx, "quote_order");
    const again = await run(ctx, "place_order");
    expect(again.ok).toBe(true);
    expect(again.alreadyPlaced).toBe(true);
    expect(again.orderNumber).toBe("ORD-1");
    expect(again.total).toBe(24.5);
    expect(String(again.instruction)).toContain("ALREADY placed");
    expect(api.placeOrder).toHaveBeenCalledTimes(1);
  });
});

describe("place_order and the quote", () => {
  it("sends the quoted total as expectedTotal so the server can refuse a moved price", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    await run(ctx, "place_order");
    const charged = api.placeOrder.mock.calls[0][0] as { expectedTotal?: number };
    expect(charged.expectedTotal).toBe(24.5);
  });

  it("refuses to place (not_quoted) when the cart changed after the quote — a stale total is never sent", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    // "Oh — and a Coke." A legitimately different total: quote again first.
    await run(ctx, "add_to_order", { menuItemId: "dr_coke" });
    const out = await run(ctx, "place_order");
    expect(out.error).toBe(true);
    expect(out.code).toBe("not_quoted");
    expect(out.notPlaced).toBe(true);
    expect(String(out.instruction)).toContain("quote_order");
    expect(api.placeOrder).not.toHaveBeenCalled();
    // and never quoted at all ⇒ same refusal
    const { ctx: c2, api: a2 } = makeCtx();
    await addPizza(c2);
    await ready(c2);
    const never = await run(c2, "place_order");
    expect(never.code).toBe("not_quoted");
    expect(a2.placeOrder).not.toHaveBeenCalled();
  });

  it("a 409 from the price gate means NO order was placed and the caller must be re-asked", async () => {
    const { ctx, api } = makeCtx();
    api.dryRunOrder.mockResolvedValue({ ok: true, status: 200, json: { total: 23.37, subtotal: 20, tax: 3.37, appliedPromoNames: ["First-time customer special"] } });
    api.placeOrder.mockResolvedValue({ ok: false, status: 409, json: { code: "total_changed", total: 25.97, expectedTotal: 23.37, appliedPromoNames: [] } });
    await addPizza(ctx);
    await ready(ctx, "Roya Safi");
    const q = await run(ctx, "quote_order");
    expect(q.discountNames).toEqual(["First-time customer special"]);
    expect(ctx.cart.lastQuote()?.discountNames).toEqual(["First-time customer special"]);

    const out = await run(ctx, "place_order");
    expect(out.error).toBe(true);
    expect(out.code).toBe("total_changed");
    expect(out.notPlaced).toBe(true);
    expect(out.total).toBe(25.97);
    expect(out.quotedTotal).toBe(23.37);
    // The agent must be told WHY, from the real promo diff — never a guess.
    expect(String(out.instruction)).toContain("First-time customer special did not apply");
    // Money is spoken in WORDS now (Luigi 2026-08-15: "CA$0.02" became "about 2 cents").
    expect(String(out.instruction)).toContain("twenty-five dollars and ninety-seven cents");
    expect(String(out.instruction)).toContain("NOT PLACED");
    // Nothing was created, so nothing may be remembered as placed …
    expect(ctx.cart.placedOrders()).toHaveLength(0);
    // … the quote is retired so a bare retry cannot re-send the old total …
    expect(ctx.cart.quoteStillApplies()).toBe(false);
    const retry = await run(ctx, "place_order");
    expect(retry.code).toBe("not_quoted");
    expect(api.placeOrder).toHaveBeenCalledTimes(1);
    // … and no receipt may go out for an order that does not exist.
    expect(api.sendSms).not.toHaveBeenCalled();
  });

  it("does not claim an order failed when placement timed out", async () => {
    const { ctx, api } = makeCtx();
    api.placeOrder.mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    const out = await run(ctx, "place_order");
    // Aborting our side does not un-create an order — so never retry, and never
    // tell the caller either way.
    expect(out.error).toBe(true);
    expect(out.code).toBe("place_order_unknown");
    expect(String(out.instruction)).toContain("MAY or MAY NOT");
    expect(String(out.instruction)).toContain("transfer_to_human");
    expect(String(out.instruction)).not.toMatch(/failed/i);
    expect(ctx.cart.placedOrders()).toHaveLength(0);
  });

  it("stamps idempotencyKey = voice-<callSid>-<fnv1a(basket signature)>", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    const sig = ctx.cart.signature();
    await run(ctx, "place_order");
    const sent = api.placeOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.idempotencyKey).toBe(`voice-CA1-${fnv1a(sig)}`);
    expect(sent.channel).toBe("voice");
    expect(sent.marketingConsent).toBe(false);
    expect(sent.restaurantSlug).toBe("luigis");
  });

  it("carries the order-level note and the two-token name guard", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx, "Ada");
    await run(ctx, "quote_order");
    await run(ctx, "place_order", { orderNotes: "ring the buzzer" });
    const sent = api.placeOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.notes).toBe("ring the buzzer");
    expect(sent.customerName).toBe("Ada (phone)");
    expect(sent.type).toBe("pickup");
  });
});

/**
 * ORD-264127463, 2026-08-13 — quote and charge priced DIFFERENT customers. The
 * quote ran on caller ID (`+14168338405`) because the caller hadn't been asked
 * yet, and the charge ran on the digits they then dictated (`4168338405`).
 * `promo-order-context.ts` counts a customer's prior orders with an EXACT
 * string match on `Order.customerPhone`, so those were two people: Roya Safi
 * was quoted $23.37 as a first-timer and charged $25.87 as the regular she is.
 */
describe("identity: quote and place price the SAME customer", () => {
  it("prices the same person whether the number comes from caller ID or the caller's mouth", async () => {
    const { ctx, api } = makeCtx({ from: "+14168338405" });
    await addPizza(ctx);
    await run(ctx, "set_fulfilment", { type: "pickup" });
    // Quoted before the caller was asked — identity comes from caller ID.
    await run(ctx, "set_customer", { name: "Roya Safi" });
    await run(ctx, "quote_order");
    // Then they read their number out, formatted differently. Same person.
    const sc = await run(ctx, "set_customer", { phone: "(416) 833-8405" });
    expect(String(sc.instruction)).toBe("Noted. Carry on.");
    expect(ctx.cart.customer().phone).toBe("4168338405");
    expect(ctx.cart.quoteStillApplies()).toBe(true);
    await run(ctx, "place_order");

    const quoted = api.dryRunOrder.mock.calls[0][0] as { customerPhone: string; customerEmail: string };
    const charged = api.placeOrder.mock.calls[0][0] as { customerPhone: string; customerEmail: string; expectedTotal?: number };
    expect(quoted.customerPhone).toBe("4168338405");
    expect(charged.customerPhone).toBe(quoted.customerPhone);
    expect(quoted.customerEmail).toBe("voice.4168338405@voice.nabil.invalid");
    expect(charged.customerEmail).toBe(quoted.customerEmail);
    expect(charged.expectedTotal).toBe(24.5);
  });

  it("retires the quote when the caller gives a DIFFERENT number after it", async () => {
    const { ctx, api } = makeCtx({ from: "+14168338405" });
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    expect(ctx.cart.lastQuote()?.total).toBe(24.5);
    // A spouse's line, a work number — a different customer to the promo
    // engine, so the total we quoted no longer describes what we would charge.
    const sc = await run(ctx, "set_customer", { phone: "905 555 0199" });
    expect(String(sc.instruction)).toContain("quote again before placing");
    expect(ctx.cart.customer()).toMatchObject({ phone: "9055550199", phoneSource: "spoken" });
    expect(ctx.cart.quoteStillApplies()).toBe(false);
    const out = await run(ctx, "place_order");
    expect(out.code).toBe("not_quoted");
    expect(api.placeOrder).not.toHaveBeenCalled();
    // Re-quoted for the new identity, it goes through on that number.
    await run(ctx, "quote_order");
    await run(ctx, "place_order");
    expect((api.dryRunOrder.mock.calls[1][0] as any).customerPhone).toBe("9055550199");
    expect((api.placeOrder.mock.calls[0][0] as any).customerPhone).toBe("9055550199");
  });
});

describe("payment modes", () => {
  it("'paid' refuses BOTH quote and place — an owner who asked for prepayment must not be handed an unpaid order", async () => {
    const { ctx, api } = makeCtx({ cfg: { pickupPaymentMode: "paid" } });
    await addPizza(ctx);
    await ready(ctx);
    const q = await run(ctx, "quote_order");
    expect(q.error).toBe(true);
    expect(q.code).toBe("prepayment_required");
    expect(String(q.message)).toContain("send_sms_link");
    expect(api.dryRunOrder).not.toHaveBeenCalled();
    // Even with a quote on record, placement is refused.
    ctx.cart.recordQuote({ total: 24.5 });
    const p = await run(ctx, "place_order");
    expect(p.ok).toBe(false);
    expect(p.refused).toBe("prepayment_required");
    expect(api.placeOrder).not.toHaveBeenCalled();
  });

  it("delivery uses the DELIVERY mode, pickup the pickup mode", async () => {
    const { ctx, api } = makeCtx({ cfg: { deliveryPaymentMode: "paid", pickupPaymentMode: "unpaid" } });
    await addPizza(ctx);
    await run(ctx, "set_customer", { name: "Ada Lovelace" });
    await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton", zip: "L9T2J3" });
    expect((await run(ctx, "quote_order")).code).toBe("prepayment_required");
    await run(ctx, "set_fulfilment", { type: "pickup" });
    expect((await run(ctx, "quote_order")).ok).toBe(true);
    expect(api.dryRunOrder).toHaveBeenCalledTimes(1);
  });

  it.each(["unpaid", "both"] as const)("'%s' quotes and places as a cash order", async (mode) => {
    const { ctx, api } = makeCtx({ cfg: { pickupPaymentMode: mode } });
    await addPizza(ctx);
    await ready(ctx);
    expect((await run(ctx, "quote_order")).ok).toBe(true);
    expect((await run(ctx, "place_order")).ok).toBe(true);
    expect((api.dryRunOrder.mock.calls[0][0] as any).paymentMethod).toBe("cash");
    expect((api.placeOrder.mock.calls[0][0] as any).paymentMethod).toBe("cash");
  });
});

describe("the receipt text is raced with a deadline", () => {
  it("texted ⇒ tell them, and do NOT read the order number", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    const out = await run(ctx, "place_order");
    expect(out.receiptTexted).toBe(true);
    expect(api.sendSms).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: "r1", slug: "luigis", to: "6475550000", linkType: "receipt", orderId: "ord_1", orderNumber: "ORD-1", total: 24.5 }));
    expect(String(out.instruction)).toContain("ALREADY been texted");
    expect(String(out.instruction)).toContain("do NOT read the order number");
  });

  it("the text is slow ⇒ receiptTexted false and the number is read aloud (the order is still placed)", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, api } = makeCtx();
      api.sendSms.mockReturnValue(new Promise(() => {})); // never settles
      await addPizza(ctx);
      await ready(ctx);
      await run(ctx, "quote_order");
      const pending = run(ctx, "place_order");
      // let placeOrder resolve and the deadline timer get armed
      for (let i = 0; i < 10; i++) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_600);
      const out = await pending;
      expect(out.ok).toBe(true);
      expect(out.receiptTexted).toBe(false);
      expect(String(out.instruction)).toContain("Read the caller their order number");
      expect(ctx.cart.placedOrders()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the text fails ⇒ receiptTexted false; texting off ⇒ no text is even attempted", async () => {
    const { ctx, api } = makeCtx();
    api.sendSms.mockRejectedValue(new Error("boom"));
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    const out = await run(ctx, "place_order");
    expect(out.ok).toBe(true);
    expect(out.receiptTexted).toBe(false);

    const { ctx: c2, api: a2 } = makeCtx({ cfg: { smsConfirmations: false } });
    await addPizza(c2);
    await ready(c2);
    await run(c2, "quote_order");
    const out2 = await run(c2, "place_order");
    expect(out2.receiptTexted).toBe(false);
    expect(a2.sendSms).not.toHaveBeenCalled();
    expect(String(out2.instruction)).toContain("Read the caller their order number");
  });
});

/**
 * ORD-342105315, 2026-08-11 — the first real pizza order Luigi placed by phone.
 * The model called add_pizza AND restated the same pizza in place_order's
 * `items`, so the kitchen got two pizzas. That is now structurally impossible:
 * place_order takes no items at all — the payload IS the cart's compiled lines.
 */
describe("a pizza can never reach the order as a hand-written item", () => {
  it("place_order sends exactly cart.wireItems() and ignores anything the model puts in its input", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx, { size: "large" });
    await run(ctx, "add_to_order", { menuItemId: "dr_coke", quantity: 2 });
    await ready(ctx, "Sam Phone");
    await run(ctx, "quote_order");
    const wire = JSON.parse(JSON.stringify(ctx.cart.wireItems()));
    // exactly what the model did on the live call
    await run(ctx, "place_order", { items: [{ menuItemId: "pz_large", quantity: 1 }], type: "pickup", customerName: "Sam Phone" });
    const sent = api.placeOrder.mock.calls[0][0] as { items: any[] };
    expect(sent.items).toEqual(wire);
    expect(sent.items).toHaveLength(2);
    expect(sent.items[0]).toMatchObject({ menuItemId: "pz_large", modifiers: [{ modifierOptionId: "o_pepperoni", name: "Pepperoni" }] });
    // quote priced the same items, so the spoken total matches what gets charged
    expect((api.dryRunOrder.mock.calls[0][0] as any).items).toEqual(wire);
  });

  it("an unfinished line never reaches the wire — quote AND place refuse until it is complete", async () => {
    const { ctx, api } = makeCtx();
    await run(ctx, "add_to_order", { menuItemId: "wings" }); // no size ⇒ needs_info
    await ready(ctx);
    expect(ctx.cart.wireItems()).toEqual([]);
    const q = await run(ctx, "quote_order");
    expect(q.code).toBe("cart_invalid");
    expect(q.problems).toEqual([expect.objectContaining({ code: "line_incomplete", lineId: "L1", blocking: true, questions: ["Which size for Wings? 10 pc, 20 pc."] })]);
    const p = await run(ctx, "place_order");
    expect(p.code).toBe("cart_invalid");
    expect(api.dryRunOrder).not.toHaveBeenCalled();
    expect(api.placeOrder).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════ update_line ═══════════════════════════════ */

describe("update_line changes a line instead of adding another", () => {
  it("replaces the line in place and recompiles through the compiler with the MERGED intent", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx, { size: "medium" });
    expect(ctx.cart.getLine("L1")!.readBack).toBe("1× Medium Large 1 Topping with Pepperoni");
    const out = await run(ctx, "update_line", { lineId: "L1", size: "large" });
    expect(out.ok).toBe(true);
    expect(out.lineId).toBe("L1");
    expect(ctx.cart.lines()).toHaveLength(1);
    expect(out.line.description).toBe("1× Large Large 1 Topping with Pepperoni");
    expect(out.speakExactly).toBe("1× Large Large 1 Topping with Pepperoni");
    // Natural recap, not a word-for-word ticket read (Luigi's live call 2026-08-15).
    expect(String(out.instruction)).toContain("naturally");
    expect(String(out.instruction)).not.toContain("WORD FOR WORD");
    // The change was MERGED into the original intent and recompiled — never
    // patched onto the compiled payload.
    const second = api.buildLine.mock.calls[1][0] as { kind: string; intent: Record<string, unknown> };
    expect(second.kind).toBe("pizza");
    expect(second.intent).toMatchObject({ menuItemId: "pz_large", size: "large", toppings: [{ name: "pepperoni", placement: "whole" }] });
    expect(ctx.speakExactlyThisTurn).toContain("1× Large Large 1 Topping with Pepperoni");
  });

  it("merges a topping change rather than wiping the rest of the pizza", async () => {
    const { ctx, api } = makeCtx();
    await run(ctx, "add_to_order", { menuItemId: "pz_large", size: "large", toppings: [{ name: "onion", placement: "whole" }, { name: "pepperoni", placement: "whole" }] });
    const out = await run(ctx, "update_line", { lineId: "L1", removeToppings: [{ name: "onion" }], addToppings: [{ name: "mushroom", placement: "left" }] });
    expect(out.ok).toBe(true);
    const intent = (api.buildLine.mock.calls[1][0] as { intent: any }).intent;
    expect(intent.toppings).toEqual([{ name: "pepperoni", placement: "whole" }, { name: "mushroom", placement: "left" }]);
    expect(intent.size).toBe("large");
  });

  it("leaves the order UNCHANGED when the compiler needs more information", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx, { size: "large" });
    const before = JSON.stringify(ctx.cart.getLine("L1"));
    api.buildLine.mockResolvedValueOnce({ ok: true, status: 200, json: { line: null, readBack: "", pricingNote: null, unresolved: ["Which crust?"] } });
    const out = await run(ctx, "update_line", { lineId: "L1", crust: "sourdough" });
    expect(out.ok).toBe(false);
    expect(out.needsInfo).toBe(true);
    expect(out.code).toBe("needs_info");
    expect(out.lineId).toBe("L1");
    expect(out.questions).toEqual(["Which crust?"]);
    expect(String(out.instruction)).toContain("The order is unchanged");
    expect(JSON.stringify(ctx.cart.getLine("L1"))).toBe(before);
    expect(out.state.quote).toBeNull();
  });

  it("no_such_line and ambiguous_line come back with candidates, never a guess", async () => {
    const { ctx } = makeCtx();
    const none = await run(ctx, "update_line", { lineId: "L3", size: "large" });
    expect(none.ok).toBe(false);
    expect(none.error).toBe(true);
    expect(none.code).toBe("no_such_line");
    expect(none.candidates).toEqual([]);

    await addPizza(ctx);
    await run(ctx, "add_to_order", { menuItemId: "pz_large", toppings: [{ name: "mushrooms", placement: "whole" }] });
    const missing = await run(ctx, "update_line", { lineId: "L9", size: "large" });
    expect(missing.code).toBe("no_such_line");
    expect(missing.candidates.map((c: any) => c.lineId)).toEqual(["L1", "L2"]);

    const amb = await run(ctx, "update_line", { hint: "the pizza", size: "large" });
    expect(amb.ok).toBe(false);
    expect(amb.code).toBe("ambiguous_line");
    expect(amb.needsInfo).toBe(true);
    expect(amb.candidates.map((c: any) => c.lineId)).toEqual(["L1", "L2"]);
    expect(String(amb.instruction)).toContain("Ask the caller WHICH one");
    // a hint that names the topping resolves without asking
    const ok = await run(ctx, "update_line", { hint: "the mushroom one", size: "large" });
    expect(ok.ok).toBe(true);
    expect(ok.lineId).toBe("L2");
  });
});

describe("remove_line", () => {
  it("takes the line off; the other ids do NOT move (stable ids, no renumbering)", async () => {
    const { ctx } = makeCtx();
    await addPizza(ctx);
    await run(ctx, "add_to_order", { menuItemId: "dr_coke" });
    const out = await run(ctx, "remove_line", { lineId: "L1" });
    expect(out.ok).toBe(true);
    expect(out.lineId).toBe("L1");
    expect(out.speakExactly).toBe("Took off 1× Large 1 Topping with Pepperoni.");
    expect(String(out.instruction)).toContain("ask if that's everything");
    expect(out.state.lines.map((l: any) => l.lineId)).toEqual(["L2"]);
    // L2 is still L2; the next add is L3, and L1 is never reused.
    const upd = await run(ctx, "update_line", { lineId: "L2", quantity: 3 });
    expect(upd.ok).toBe(true);
    expect(upd.line.quantity).toBe(3);
    const next = await run(ctx, "add_to_order", { menuItemId: "wings", size: "10 pc" });
    expect(next.lineId).toBe("L3");
    expect((await run(ctx, "remove_line", { lineId: "L1" })).code).toBe("no_such_line");
  });
});

/* ═══════════════════════════════ quote_order ═══════════════════════════════ */

describe("quote_order prices what place_order will charge", () => {
  it("refuses without pickup/delivery settled (cart_invalid + problems) — a missing NAME never blocks a quote (A6/C16)", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    const out = await run(ctx, "quote_order");
    expect(out.error).toBe(true);
    expect(out.code).toBe("cart_invalid");
    expect(out.problems.map((p: any) => p.code)).toEqual(["fulfilment_missing"]);
    expect(String(out.instruction)).toContain("Nothing was quoted");
    expect(api.dryRunOrder).not.toHaveBeenCalled();
    await run(ctx, "set_fulfilment", { type: "delivery" }); // no street yet
    const noAddr = await run(ctx, "quote_order");
    expect(noAddr.problems.map((p: any) => p.code)).toContain("address_missing");
    expect(api.dryRunOrder).not.toHaveBeenCalled();
  });

  it("speakExactly is the full read-back plus the authoritative total; discount names are remembered", async () => {
    const { ctx, api } = makeCtx();
    api.dryRunOrder.mockResolvedValue({ ok: true, status: 200, json: { total: 24.5, subtotal: 20, tax: 4.5, discount: 2, appliedPromoNames: ["WELCOME", 7, ""] } });
    await addPizza(ctx);
    await run(ctx, "add_to_order", { menuItemId: "dr_coke", quantity: 2 });
    await ready(ctx);
    const out = await run(ctx, "quote_order");
    expect(out.ok).toBe(true);
    expect(out.total).toBe(24.5);
    expect(out.discountNames).toEqual(["WELCOME"]);
    // The pre-quote read-back is the SPOKEN order (no numbered list, no "CA$"),
    // then the total in words — what a person behind the counter would say.
    expect(out.speakExactly).toBe(`${ctx.cart.spokenOrder()} For pickup, your total comes to twenty-four dollars and fifty cents, tax included.`);
    expect(out.speakExactly).toContain("So that's 1× Large 1 Topping with Pepperoni, and 2× Coke.");
    expect(out.speakExactly).not.toMatch(/CA\$|\d\.\s/);
    expect(ctx.speakExactlyThisTurn).toContain(out.speakExactly);
    expect(ctx.cart.lastQuote()).toEqual({ total: 24.5, signature: ctx.cart.signature(), discountNames: ["WELCOME"] });
    expect(out.state.quote).toEqual({ total: 24.5, stale: false });
    expect(String(out.instruction)).toContain("Do NOT mention any discount yet");
  });

  it("relays a server refusal plainly instead of quoting", async () => {
    const { ctx, api } = makeCtx();
    api.dryRunOrder.mockResolvedValue({ ok: false, status: 400, json: { code: "delivery_out_of_area", error: "This address is outside the restaurant's delivery area." } });
    await addPizza(ctx);
    await ready(ctx);
    const out = await run(ctx, "quote_order");
    expect(out.error).toBe(true);
    expect(out.code).toBe("delivery_out_of_area");
    expect(out.message).toContain("outside");
    expect(ctx.cart.lastQuote()).toBeNull();
  });
});

describe("delivery: the quote and the charge must resolve the SAME zone", () => {
  const withAddress = async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await run(ctx, "set_customer", { name: "Sam Phone" });
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton", zip: "L9T2J3" });
    return { ctx, api, out };
  };

  it("sends the address AND the resolved pin to quote_order and place_order as deliveryLat/Lng", async () => {
    const { ctx, api } = await withAddress();
    await run(ctx, "quote_order");
    await run(ctx, "place_order");
    for (const sent of [api.dryRunOrder.mock.calls[0][0], api.placeOrder.mock.calls[0][0]] as any[]) {
      expect(sent).toMatchObject({ type: "delivery", deliveryAddress: "17 Commercial St", deliveryCity: "Milton", deliveryZip: "L9T2J3" });
      // Without these the order lands in the "zone unverified" third state and
      // is billed the restaurant's flat fee instead of the zone's.
      expect(sent.deliveryLat).toBe(43.51);
      expect(sent.deliveryLng).toBe(-79.88);
    }
  });

  it("NEVER lets a pin follow the caller to a different address (even when the new check fails)", async () => {
    const { ctx, api } = await withAddress();
    api.checkAddress.mockResolvedValue({ ok: false, status: 500, json: {} });
    // Caller corrects the street; the old pin belongs to the old address.
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "900 Nowhere Rd", city: "Milton" });
    expect(out.checked).toBe(false);
    expect(ctx.cart.deliveryPin()).toBeNull();
    expect(ctx.cart.fulfilment().check).toMatchObject({ located: null });
    await run(ctx, "quote_order");
    const sent = api.dryRunOrder.mock.calls[0][0] as any;
    expect(sent.deliveryAddress).toBe("900 Nowhere Rd");
    expect(sent.deliveryLat).toBeUndefined();
    expect(sent.deliveryLng).toBeUndefined();
  });

  it("matches an address back regardless of punctuation and case — and does not re-geocode it", async () => {
    const { ctx, api } = await withAddress();
    const again = await run(ctx, "set_fulfilment", { type: "delivery", street: "17 commercial st.", city: "MILTON", zip: "l9t 2j3" });
    expect(api.checkAddress).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ ok: true, located: true, inside: true, deliveryFee: 7.99, minimumOrder: 25, zoneName: "Zone 1" });
    expect(String(again.instruction)).toContain("already checked");
    expect(ctx.cart.deliveryPin()).toEqual({ lat: 43.51, lng: -79.88 });
    await run(ctx, "quote_order");
    expect((api.dryRunOrder.mock.calls[0][0] as any).deliveryLat).toBe(43.51);
  });

  it("a geocoder outage tells the model to carry on, not to blame the caller — and the quote still runs", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue({ ok: false, status: 502, json: { code: "upstream" } });
    await addPizza(ctx);
    await run(ctx, "set_customer", { name: "Sam Phone" });
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton" });
    expect(out.ok).toBe(true);
    expect(out.checked).toBe(false);
    expect(String(out.instruction)).toContain("do NOT refuse");
    expect(String(out.instruction)).toContain("Do NOT mention systems or maps");
    // address_unverified is advisory, not blocking: hard-blocking an
    // unlocatable address is what stranded a real customer on 2026-08-01.
    expect(ctx.cart.validate().find((p) => p.code === "address_unverified")?.blocking).toBe(false);
    const q = await run(ctx, "quote_order");
    expect(q.ok).toBe(true);
    expect((api.dryRunOrder.mock.calls[0][0] as any).deliveryLat).toBeUndefined();
  });

  it("an unlocatable address does NOT dead-end the caller", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue({ ok: true, status: 200, json: { hasZones: true, located: false, instruction: "Ask once for the missing piece." } });
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "asdfgh" });
    expect(out.ok).toBe(true);
    expect(out.located).toBe(false);
    expect(out.error).toBeUndefined();
    expect(ctx.cart.deliveryPin()).toBeNull();
    expect(out.state.fulfilment).toMatchObject({ type: "delivery", address: "asdfgh", verified: false });
  });

  it("passes an out-of-zone answer through with its fee instead of refusing, and keeps the pin", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue(located({ inside: false, zoneName: "Zone 8", deliveryFee: 49.99, instruction: "This address is BEYOND every delivery zone." }));
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "Far Away Rd" });
    expect(out.ok).toBe(true);
    expect(out.inside).toBe(false);
    expect(out.deliveryFee).toBe(49.99);
    expect(out.error).toBeUndefined();
    // Still pinned — the caller may well accept it, and if they do the order
    // must resolve that same outer zone.
    expect(ctx.cart.deliveryPin()).toEqual({ lat: 43.51, lng: -79.88 });
    expect(ctx.cart.fulfilment().check).toMatchObject({ inside: false, fee: 49.99, zoneName: "Zone 8" });
  });
});

/* ══════════════════════════════ set_fulfilment ═════════════════════════════ */

describe("set_fulfilment", () => {
  it("pickup is recorded and the model carries on", async () => {
    const { ctx, api } = makeCtx();
    const out = await run(ctx, "set_fulfilment", { type: "pickup" });
    expect(out).toMatchObject({ ok: true, fulfilment: "pickup" });
    expect(out.state.fulfilment).toEqual({ type: "pickup" });
    expect(String(out.instruction)).toContain("Pickup it is");
    expect(api.checkAddress).not.toHaveBeenCalled();
    expect((await run(ctx, "set_fulfilment", { type: "drone" })).code).toBe("bad_type");
  });

  it("delivery without a street asks for the full address BEFORE food, and checks nothing yet", async () => {
    const { ctx, api } = makeCtx();
    const out = await run(ctx, "set_fulfilment", { type: "delivery" });
    expect(out).toMatchObject({ ok: true, fulfilment: "delivery", addressNeeded: true });
    expect(String(out.instruction)).toContain("street address");
    expect(api.checkAddress).not.toHaveBeenCalled();
    expect(ctx.cart.validate().some((p) => p.code === "address_missing" && p.blocking)).toBe(true);
  });

  it("with a street it checks the address once and records located/inside/fee/pin", async () => {
    const { ctx, api } = makeCtx();
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton", zip: "L9T2J3" });
    expect(api.checkAddress).toHaveBeenCalledWith({ slug: "luigis", street: "17 Commercial St", city: "Milton", zip: "L9T2J3" });
    expect(out).toMatchObject({ ok: true, fulfilment: "delivery", located: true, inside: true, deliveryFee: 7.99, minimumOrder: 25 });
    expect(ctx.cart.fulfilment().check).toMatchObject({ located: true, inside: true, fee: 7.99, minimumOrder: 25, zoneName: "Zone 1" });
    expect(ctx.cart.deliveryPin()).toEqual({ lat: 43.51, lng: -79.88 });
    expect(out.state.fulfilment).toEqual({ type: "delivery", address: "17 Commercial St, Milton, L9T2J3", verified: true, fee: 7.99 });
    // The very same address again ⇒ no second geocode.
    await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton", zip: "L9T2J3" });
    expect(api.checkAddress).toHaveBeenCalledTimes(1);
  });

  it("switching to pickup and back keeps nothing stale about the address check", async () => {
    const { ctx } = makeCtx();
    await addPizza(ctx);
    await run(ctx, "set_customer", { name: "Sam Phone" });
    await run(ctx, "set_fulfilment", { type: "delivery", street: "17 Commercial St", city: "Milton" });
    await run(ctx, "quote_order");
    expect(ctx.cart.quoteStillApplies()).toBe(true);
    await run(ctx, "set_fulfilment", { type: "pickup" });
    // a fulfilment change retires the quote — the total is different now
    expect(ctx.cart.quoteStillApplies()).toBe(false);
    expect(ctx.cart.validate().filter((p) => p.blocking)).toEqual([]);
  });
});

/* ══════════════════════════════════ day deals ══════════════════════════════ */

/**
 * DAY DEALS. Luigi tested on a Tuesday and paid $17.74 for a pizza his own menu
 * was selling at $11.99 that day. The deal is now AUTO-APPLIED: when a deal
 * item is cheaper, the compiler swaps it in server-side and the agent announces
 * the savings. No offer/accept cycle needed.
 */
describe("day deals", () => {
  const autoAppliedDeal = { standardItemName: "Large 1 Topping", dealName: "Tuesday - Large Pizza Special", dealMenuItemId: "pz_tuesday", saving: 5.75 };

  it("passes the owner's setting to the compiler on ADDS only — never on an update", async () => {
    const { ctx, api } = makeCtx({ cfg: { offerDayDeals: true } });
    await addPizza(ctx);
    expect((api.buildLine.mock.calls[0][0] as any).offerDeals).toBe(true);
    await run(ctx, "update_line", { lineId: "L1", size: "large" });
    expect((api.buildLine.mock.calls[1][0] as any).offerDeals).toBeUndefined();
    // and not at all when the owner has it off
    const { ctx: c2, api: a2 } = makeCtx({ cfg: { offerDayDeals: false } });
    await addPizza(c2);
    expect((a2.buildLine.mock.calls[0][0] as any).offerDeals).toBeUndefined();
  });

  it("surfaces the auto-applied deal with the SERVER's saving", async () => {
    const { ctx, api } = makeCtx();
    api.buildLine.mockResolvedValueOnce({ ok: true, status: 200, json: { line: defaultBuild({ kind: "pizza", intent: { menuItemId: "pz_tuesday", quantity: 1 } }).json.line, readBack: "1× Tuesday - Large Pizza Special with Pepperoni", pricingNote: null, unresolved: [], autoAppliedDeal } });
    const out = await addPizza(ctx);
    expect(out.ok).toBe(true);
    expect(out.autoAppliedDeal).toEqual(autoAppliedDeal);
    expect(String(out.instruction)).toContain("GOOD NEWS");
    expect(String(out.instruction)).toContain("Tuesday - Large Pizza Special");
    expect(String(out.instruction)).not.toContain("update_line");
    expect(out.state.lines).toHaveLength(1);
  });

  it("says nothing when there is no deal today", async () => {
    const { ctx } = makeCtx();
    const out = await addPizza(ctx);
    expect(out.autoAppliedDeal).toBeUndefined();
    expect(String(out.instruction)).not.toContain("GOOD NEWS");
  });

  it("replaceWithItemId still SWAPS the line in place", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    const out = await run(ctx, "update_line", { lineId: "L1", replaceWithItemId: "pz_tuesday" });
    expect(out.ok).toBe(true);
    expect(out.lineId).toBe("L1");
    expect(ctx.cart.lines()).toHaveLength(1);
    expect(ctx.cart.getLine("L1")!.intent.menuItemId).toBe("pz_tuesday");
    expect(out.line.description).toBe("1× Tuesday - Large Pizza Special with Pepperoni");
    const swapped = api.buildLine.mock.calls[1][0] as { intent: any };
    expect(swapped.intent.menuItemId).toBe("pz_tuesday");
    // the caller's toppings survive the swap
    expect(swapped.intent.toppings).toEqual([{ name: "pepperoni", placement: "whole" }]);
    // a swap to an id that is not on this menu is refused before the compiler
    expect((await run(ctx, "update_line", { lineId: "L1", replaceWithItemId: "mi_evil" })).code).toBe("unknown_item");
    expect(api.buildLine).toHaveBeenCalledTimes(2);
  });
});

/* ══════════════════════════════ get_item_options ═══════════════════════════ */

describe("get_item_options gives the model what add_to_order demands", () => {
  // 2026-08-13, live call: a caller ordering the Large/Wings combo asked for
  // honey garlic wings. The tool handed back bare NAMES, but a combo pick needs
  // menuItemId — so the model went hunting the main menu for "Wings", found the
  // CATERING wings, had the slot reject it, and narrated three retries.
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
        { label: "Drink", min: 1, max: 2, choices: [{ menuItemId: "dr_coke", name: "Coke" }] },
      ],
    },
  });

  it("returns each slot choice's menuItemId (not just its name), the sizes a slot restricts, and sharedToppings", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue(comboRes());
    const out = await run(ctx, "get_item_options", { menuItemId: "cb_wings" });
    expect(api.itemOptions).toHaveBeenCalledWith("luigis", "cb_wings");
    expect(out.name).toBe("Large / Wings Combo");
    expect(out.menuItemId).toBe("cb_wings");
    const choices = out.combo.slots[0].choices;
    expect(choices[0]).toMatchObject({ name: "Wings", menuItemId: "mi_wings_20" });
    // Two choices share the name "Wings" — the id is the ONLY thing that
    // distinguishes the combo's 20pc from the catering tray.
    expect(choices.map((c: any) => c.menuItemId)).toEqual(["mi_wings_20", "mi_wings_catering"]);
    expect(choices[0].sizes).toEqual(["20 pc"]);
    expect(choices[1].sizes).toBeUndefined();
    expect(out.combo.slots[0].choose).toBe(1);
    expect(out.combo.slots[1].choose).toBe("1-2");
    expect(out.combo.sharedToppings).toBe(6);
    expect(String(out.instruction)).toContain("SHARE");
    expect(String(out.instruction)).toContain("EXACTLY as given here");
    expect(out.isPizza).toBe(false);
  });

  it("trims modifier options to names (+ surcharge) — those resolve by NAME, and pizza rules ride along", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue({
      item: {
        name: "Large 1 Topping",
        variants: [{ name: "Large", price: 17.74 }],
        modifierGroups: [
          { name: "Toppings", pizzaRole: "topping", required: false, minSelect: 0, maxSelect: 5, options: [{ name: "Pepperoni", id: "o_pep" }, { name: "Extra Cheese", id: "o_xc", priceAdjustment: 2.5 }] },
          { name: "Crust", pizzaRole: "crust", required: true, options: [{ name: "Regular" }, { name: "Thin" }] },
        ],
        pizzaConfig: { includedToppings: 1, extraToppingPrice: 2.5, allowHalfHalf: true, presetToppings: [] },
      },
      combo: null,
    });
    const out = await run(ctx, "get_item_options", { menuItemId: "pz_large" });
    expect(out.sizes).toEqual([{ name: "Large", price: 17.74 }]);
    expect(out.groups[0]).toEqual({ name: "Toppings", role: "topping", required: false, choose: "0-5", choices: ["Pepperoni", "Extra Cheese (+$2.50)"] });
    expect(out.groups[1]).toMatchObject({ name: "Crust", role: "crust", required: true, choose: "0+" });
    expect(out.combo).toBeNull();
    expect(out).toMatchObject({ isPizza: true, includedToppings: 1, extraToppingPrice: 2.5, allowHalfHalf: true });
  });

  it("refuses an id that isn't on this call's menu without asking the app", async () => {
    const { ctx, api } = makeCtx();
    const out = await run(ctx, "get_item_options", { menuItemId: "mi_not_here" });
    expect(out.error).toBe(true);
    expect(out.code).toBe("unknown_item");
    expect(api.itemOptions).not.toHaveBeenCalled();
  });
});

/**
 * The on-demand item lookup was the largest source of context that grows while
 * a caller is on the line: no group cap, no option cap, and no memoisation, so
 * the same topping list could be fetched repeatedly and every copy stayed in
 * the conversation for the rest of the call.
 */
describe("get_item_options does not grow the call", () => {
  const bigItem = () => ({
    item: {
      name: "Build Your Own Pizza",
      variants: [{ name: "Large", price: 14.99 }],
      pizzaConfig: { includedToppings: 0, extraToppingPrice: 2.5, allowHalfHalf: true },
      modifierGroups: Array.from({ length: 12 }, (_, g) => ({
        name: `Group ${g}`,
        required: false,
        options: Array.from({ length: 60 }, (_, o) => ({ name: `Option ${g}-${o}` })),
      })),
    },
    combo: {
      sharedToppings: null,
      slots: [
        { label: "Side", min: 1, max: 1, choices: Array.from({ length: 50 }, (_, i) => ({ menuItemId: `side_${i}`, name: `Side ${i}` })) },
        { label: "Drink", min: 1, max: 1, choicesTruncated: true, choices: [{ menuItemId: "dr_coke", name: "Coke" }] },
      ],
    },
  });

  it("caps groups (8), options (40) and slot choices (40) — and SAYS how many it left out", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue(bigItem());
    const out = await run(ctx, "get_item_options", { menuItemId: "pz_byo" });
    expect(out.groups).toHaveLength(8);
    expect(out.groupsTruncated).toBe(4);
    for (const g of out.groups) {
      expect(g.choices).toHaveLength(40);
      expect(g.truncated).toBe(20);
    }
    expect(out.combo.slots[0].choices).toHaveLength(40);
    expect(out.combo.slots[0].truncated).toBe(10);
    // a slot the SERVER already truncated is marked even when short here
    expect(out.combo.slots[1].truncated).toBe(true);
    expect(String(out.instruction)).toContain("never tell a caller something isn't offered just because it isn't in a truncated list");
  });

  it("answers the second ask from memory — the menu cannot change mid-call", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue(bigItem());
    const first = await run(ctx, "get_item_options", { menuItemId: "pz_byo" });
    const again = await run(ctx, "get_item_options", { menuItemId: "pz_byo" });
    expect(again).toBe(first);
    expect(api.itemOptions).toHaveBeenCalledTimes(1);
    expect(ctx.itemOptionsCache.get("pz_byo")).toBe(first);
  });

  it("still looks up a DIFFERENT item", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue(bigItem());
    await run(ctx, "get_item_options", { menuItemId: "pz_byo" });
    await run(ctx, "get_item_options", { menuItemId: "pz_large" });
    expect(api.itemOptions).toHaveBeenCalledTimes(2);
    expect(ctx.itemOptionsCache.size).toBe(2);
  });
});

/* ══════════════════════════════ find_menu_item ═════════════════════════════ */

describe("find_menu_item", () => {
  it("an exact hit says so; a size word becomes sizeHint", async () => {
    const { ctx } = makeCtx();
    const out = await run(ctx, "find_menu_item", { query: "coke" });
    expect(out.ok).toBe(true);
    expect(out.exact).toBe(true);
    expect(out.candidates[0]).toMatchObject({ menuItemId: "dr_coke", name: "Coke", kind: "item", category: "Drinks & Sides", price: 1.99, soldOut: false });
    expect(String(out.instruction)).toContain("The first candidate is the item");
    const sized = await run(ctx, "find_menu_item", { query: "large 1 topping" });
    expect(sized.sizeHint).toBe("large");
    expect(sized.candidates[0].menuItemId).toBe("pz_large");
  });

  it("an ambiguous name asks the caller which — never picks for them", async () => {
    const { ctx } = makeCtx();
    const out = await run(ctx, "find_menu_item", { query: "1 topping" });
    expect(out.exact).toBe(false);
    expect(out.candidates.map((c: any) => c.menuItemId).sort()).toEqual(["pz_large", "pz_xl"]);
    expect(String(out.instruction)).toContain("say the top two by name and ask which they meant");
  });

  it("an item that runs on other days is answered honestly (notToday), and sold-out is flagged", async () => {
    const { ctx } = makeCtx();
    const out = await run(ctx, "find_menu_item", { query: "smash burger" });
    expect(out.candidates).toEqual([]);
    expect(out.notToday).toEqual([{ name: "Thursday Smash Burger", available: "Thursdays" }]);
    expect(String(out.instruction)).toContain("runs on other days");
    const nothing = await run(ctx, "find_menu_item", { query: "sushi platter" });
    expect(nothing.candidates).toEqual([]);
    expect(String(nothing.instruction)).toContain("Nothing on this menu matches");
    const so = await run(ctx, "find_menu_item", { query: "lasagna" });
    expect(so.candidates[0]).toMatchObject({ menuItemId: "lasagna", soldOut: true });
    expect((await run(ctx, "find_menu_item", { query: "  " })).code).toBe("missing_query");
  });
});

/* ═══════════════════════════ the rest of the surface ═══════════════════════ */

describe("add_to_order guards", () => {
  it("unknown ids never reach the compiler; sold-out is refused; the duplicate guard asks", async () => {
    const { ctx, api } = makeCtx();
    expect((await run(ctx, "add_to_order", { menuItemId: "mi_evil" })).code).toBe("unknown_item");
    expect((await run(ctx, "add_to_order", { menuItemId: "lasagna" })).code).toBe("sold_out");
    expect(api.buildLine).not.toHaveBeenCalled();
    await run(ctx, "add_to_order", { menuItemId: "dr_coke" });
    const dup = await run(ctx, "add_to_order", { menuItemId: "dr_coke" });
    expect(dup.code).toBe("possible_duplicate");
    expect(dup.needsInfo).toBe(true);
    expect(String(dup.instruction)).toContain("a change to that line or an additional one");
    const another = await run(ctx, "add_to_order", { menuItemId: "dr_coke", confirmAnother: true });
    expect(another.lineId).toBe("L2");
  });

  it("an unfinished add creates the line with the question and tells the model to update_line it", async () => {
    const { ctx } = makeCtx();
    const out = await run(ctx, "add_to_order", { menuItemId: "wings" });
    expect(out.ok).toBe(true);
    expect(out.line.status).toBe("needs_info");
    // An unfinished line has nothing to recap: the model ASKS the question
    // (below) instead of reading a "(not finished) — still need" ticket line.
    expect(out.speakExactly).toBe("");
    expect(out.line.questions?.[0]).toContain("Which size for Wings?");
    expect(String(out.instruction)).toContain("NOT finished");
    expect(String(out.instruction)).toContain("update_line with lineId L1");
    expect(out.state.incomplete).toEqual(["L1"]);
  });
});

describe("get_order_state / set_customer / transfer / sms", () => {
  it("get_order_state returns the authoritative state and the numbered read-back", async () => {
    const { ctx } = makeCtx();
    await addPizza(ctx);
    const out = await run(ctx, "get_order_state");
    expect(out.ok).toBe(true);
    expect(out.readBack).toBe("1. 1× Large 1 Topping with Pepperoni");
    expect(out.state.lines.map((l: any) => l.lineId)).toEqual(["L1"]);
    expect(out.state.customer).toEqual({ name: null, phone: "6475550000", phoneSource: "caller_id" });
  });

  it("transfer_to_human marks the session for hand-off; send_sms_link texts the caller's number", async () => {
    const { ctx, api } = makeCtx();
    const t = await run(ctx, "transfer_to_human", { reason: "caller asked" });
    expect(t.ok).toBe(true);
    expect(ctx.pendingTransfer).toBe("caller asked");
    const s = await run(ctx, "send_sms_link", { linkType: "menu" });
    expect(s.ok).toBe(true);
    expect(api.sendSms).toHaveBeenCalledWith({ restaurantId: "r1", slug: "luigis", to: "6475550000", linkType: "menu", orderId: undefined });
    // a receipt after an order carries the order id
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    await run(ctx, "place_order");
    api.sendSms.mockClear();
    const r = await run(ctx, "send_sms_link", { linkType: "receipt" });
    expect(api.sendSms.mock.calls[0][0]).toMatchObject({ linkType: "receipt", orderId: "ord_1" });
    expect(String(r.instruction)).toContain("follow the order's progress");
  });
});

/* ══════════════════════════════ toolsForConfig ═════════════════════════════ */

describe("toolsForConfig", () => {
  const names = (cfg: Partial<AgentConfig>) => toolsForConfig({ ...normalizeAgentConfig({}), ...cfg }).map((t) => t.name);
  const ORDER = ["find_menu_item", "get_item_options", "add_to_order", "update_line", "remove_line", "set_fulfilment", "set_customer", "get_order_state", "quote_order", "place_order"];

  it("everything on ⇒ the full surface, in TOOLS order", () => {
    expect(names({ canTakeOrders: true, canBookReservations: true, smsConfirmations: true })).toEqual(TOOLS.map((t) => t.name));
    expect(TOOLS.map((t) => t.name)).toEqual([...ORDER, "check_reservation_availability", "book_reservation", "transfer_to_human", "leave_message", "send_sms_link", "lookup_recent_orders"]);
  });

  it("ordering tools are gated on canTakeOrders, reservations on canBookReservations, texting on smsConfirmations — transfer always survives", () => {
    const noOrders = names({ canTakeOrders: false });
    for (const n of ORDER) expect(noOrders).not.toContain(n);
    expect(noOrders).toEqual(["check_reservation_availability", "book_reservation", "transfer_to_human", "leave_message", "send_sms_link", "lookup_recent_orders"]);
    const noRes = names({ canBookReservations: false });
    expect(noRes).not.toContain("book_reservation");
    expect(noRes).not.toContain("check_reservation_availability");
    expect(names({ smsConfirmations: false })).not.toContain("send_sms_link");
    expect(names({ canTakeOrders: false, canBookReservations: false, smsConfirmations: false })).toEqual(["transfer_to_human", "leave_message", "lookup_recent_orders"]);
    // A1b: take-a-message is its own gate; transfer itself always survives.
    expect(names({ transferTakeMessage: false })).not.toContain("leave_message");
    expect(names({ canTakeOrders: false, canBookReservations: false, smsConfirmations: false, transferTakeMessage: false })).toEqual(["transfer_to_human", "lookup_recent_orders"]);
    // A5: order-status lookup is its own gate.
    expect(names({ canAnswerOrderStatus: false })).not.toContain("lookup_recent_orders");
  });

  it("pizza/combo building is NOT a tool gate — the engine refuses inside add_to_order", async () => {
    expect(names({ allowPizzaCombo: false })).toContain("add_to_order");
    const { ctx, api } = makeCtx({ cfg: { allowPizzaCombo: false } });
    const out = await addPizza(ctx);
    expect(out.code).toBe("builder_disabled");
    expect(api.buildLine).not.toHaveBeenCalled();
    expect((await run(ctx, "add_to_order", { menuItemId: "dr_coke" })).ok).toBe(true);
  });
});

/**
 * SLOT AUTO-FILL (Luigi's 00:10 call, 2026-08-16): a combo added bare, then
 * picks filled by slot NAME with no ids → missing_item → a guessed wrong id →
 * get_item_options → third try. Slots with ONE possible item are filled by the
 * tool layer now; the model only supplies toppings and flavour.
 */
describe("combo slot auto-fill", () => {
  const fixedCombo = () => ({
    item: { name: "Large / Wings Combo", variants: [], modifierGroups: [] },
    combo: {
      sharedToppings: null,
      slots: [
        { label: "Pizza", min: 1, max: 1, choices: [{ menuItemId: "pz_large", name: "Large 1 Topping", variants: [] }] },
        { label: "Chicken Wings", min: 1, max: 1, choices: [{ menuItemId: "wings", name: "Wings", variants: [{ variantId: "v20", name: "20 pc" }] }] },
        { label: "Drink", min: 1, max: 1, choices: [{ menuItemId: "dr_coke", name: "Coke" }, { menuItemId: "dr_diet", name: "Diet Coke" }] },
      ],
    },
  });

  it("autofillPicks: bare add synthesizes single-choice slots (with a single size); multi-choice slots are left to ask", () => {
    const slots = [
      { label: "Pizza", min: 1, max: 1, choices: [{ name: "Large 1 Topping", menuItemId: "pz_large" }] },
      { label: "Chicken Wings", min: 1, max: 1, choices: [{ name: "Wings", menuItemId: "wings", sizes: ["20 pc"] }] },
      { label: "Dipping Sauces", min: 2, max: 2, choices: [{ name: "Dipping Sauce", menuItemId: "dip" }] },
      { label: "Drink", min: 1, max: 1, choices: [{ name: "Coke", menuItemId: "dr_coke" }, { name: "Diet Coke", menuItemId: "dr_diet" }] },
    ];
    expect(autofillPicks(undefined, slots, { bare: true })).toEqual([
      { slotLabel: "Pizza", menuItemId: "pz_large" },
      { slotLabel: "Chicken Wings", menuItemId: "wings", size: "20 pc" },
      { slotLabel: "Dipping Sauces", menuItemId: "dip" },
      { slotLabel: "Dipping Sauces", menuItemId: "dip" },
    ]);
    // slotLabel-only picks resolve; a multi-choice slot stays unresolved; an explicit id is untouched
    expect(autofillPicks([{ slotLabel: "chicken wings", options: ["BBQ Mixed"] }, { slotLabel: "Drink" }, { slotLabel: "Pizza", menuItemId: "pz_xl" }], slots, { bare: false })).toEqual([
      { slotLabel: "chicken wings", options: ["BBQ Mixed"], menuItemId: "wings", size: "20 pc" },
      { slotLabel: "Drink" },
      { slotLabel: "Pizza", menuItemId: "pz_xl" },
    ]);
    expect(autofillPicks([{ menuItemId: "x" }], null, { bare: false })).toEqual([{ menuItemId: "x" }]);
  });

  it("add_to_order of a bare combo holds the fixed picks at once; update_line by slotLabel fills the id", async () => {
    const { ctx, api } = makeCtx();
    api.itemOptions.mockResolvedValue(fixedCombo());
    const out = await run(ctx, "add_to_order", { menuItemId: "cb_wings" });
    // The item-options lookup happened once (cached for the call) and the picks were synthesized.
    expect(api.itemOptions).toHaveBeenCalledWith("luigis", "cb_wings");
    const compiled = api.buildLine.mock.calls.at(-1)?.[0] as any;
    expect(compiled.kind).toBe("combo");
    expect(compiled.intent.picks.map((p: any) => p.menuItemId)).toEqual(["pz_large", "wings"]);
    expect(compiled.intent.picks[1].size).toBe("20 pc");
    expect(out.ok).toBe(true);
    // Later: "wings BBQ" by slot name only — no id needed
    const upd = await run(ctx, "update_line", { lineId: out.lineId, picks: [{ slotLabel: "Chicken Wings", options: ["BBQ Mixed"] }] });
    expect(upd.ok).toBe(true);
    expect(api.itemOptions).toHaveBeenCalledTimes(1);
  });
});

describe("delivery fee is never quoted bare when the store gives free delivery (Luigi 2026-08-16)", () => {
  it("set_fulfilment carries freeDeliveryOver into the instruction, the state and the fulfilment check", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue(located({ freeDeliveryOver: 30 }));
    const out = await run(ctx, "set_fulfilment", { type: "delivery", street: "249 Bussel Crescent", city: "Milton" });
    expect(out.ok).toBe(true);
    expect(String(out.instruction)).toContain("free on orders over thirty dollars");
    expect(String(out.instruction)).toContain("never the fee alone");
    expect(out.state.fulfilment.freeDeliveryOver).toBe(30);
    // free everywhere (threshold 0)
    api.checkAddress.mockResolvedValue(located({ freeDeliveryOver: 0 }));
    const out2 = await run(ctx, "set_fulfilment", { type: "delivery", street: "1 Main St", city: "Milton" });
    expect(String(out2.instruction)).toContain("Delivery is FREE here");
    // no promo: plain fee instruction, nothing invented
    api.checkAddress.mockResolvedValue(located());
    const out3 = await run(ctx, "set_fulfilment", { type: "delivery", street: "2 Main St", city: "Milton" });
    expect(String(out3.instruction)).not.toMatch(/free/i);
  });
});

/* ═════════ recipe halves only for a pizza the caller NAMED (cmsw4s0mz, 2026-08-16) ═════════ */

describe("halfRecipes are refused when the caller only listed toppings", () => {
  const MENU_WITH_VEG = {
    ...MENU,
    menu: [
      { ...MENU.menu[0], items: [...MENU.menu[0].items, { menuItemId: "pz_veg", name: "Vegetable Pizza", price: 19.99, isPizza: true, isCombo: false, hasVariants: false, variants: [] }, { menuItemId: "pz_haw", name: "Hawaiian Pizza", price: 19.99, isPizza: true, isCombo: false, hasVariants: false, variants: [] }] },
      ...MENU.menu.slice(1),
    ],
  };
  function vegCtx(recent: string[]) {
    const { ctx, api } = makeCtx();
    const menu = buildMenuIndex(MENU_WITH_VEG);
    (ctx as any).menu = menu;
    // the engine's own whitelist must know the recipe ids too
    (ctx as any).cart = new CartEngine({ compiler: compilerOver(api, "luigis"), menu, askGroupIds: [], allowPizzaCombo: true, callerId: "6475550000", knownName: null });
    ctx.cart.beginTurn();
    ctx.recentUserTexts = recent;
    ctx.lastUserText = recent[recent.length - 1];
    return { ctx, api };
  }

  it("the exact call from 18:24:12 — 'the other side green pepper, mushroom, and tomato' sent as a Vegetable Pizza recipe → recipe_not_named, nothing changed", async () => {
    const { ctx, api } = vegCtx(["Delivery.", "Yeah. Okay. So just do one side, just cheese.", "And then the other side, you can do green pepper, mushroom, and tomato. That's the one?"]);
    await run(ctx, "add_to_order", { menuItemId: "cb_wings", picks: [{ menuItemId: "pz_large" }, { menuItemId: "wings", size: "20 pc" }] });
    const before = api.buildLine.mock.calls.length;
    const out = await run(ctx, "update_line", { lineId: "L1", hint: "other half green pepper, mushroom, tomato", picks: [{ pickId: "P1", halfRecipes: [{ placement: "right", menuItemId: "pz_veg" }] }] });
    expect(out.ok).not.toBe(true);
    expect(out.code).toBe("recipe_not_named");
    expect(String(out.message)).toContain('did not say "Vegetable Pizza"');
    expect(String(out.message)).toMatch(/send exactly the toppings they said/i);
    expect(api.buildLine.mock.calls.length).toBe(before); // nothing compiled, nothing changed
    // …and the toppings-with-placement form goes through
    const ok = await run(ctx, "update_line", { lineId: "L1", hint: "other half green pepper, mushroom, tomato", picks: [{ pickId: "P1", toppings: [{ name: "green pepper", placement: "right" }, { name: "mushroom", placement: "right" }, { name: "tomato", placement: "right" }] }] });
    expect(ok.ok).toBe(true);
  });

  it("a recipe the caller DID name is fine — 'half veggie' (spoken alias), 'make the other half Hawaiian', and a recipe named two turns ago", async () => {
    const a = vegCtx(["Can I get a large pizza, half veggie half pepperoni?"]);
    const outA = await run(a.ctx, "add_to_order", { menuItemId: "pz_large", halfRecipes: [{ placement: "left", menuItemId: "pz_veg" }], toppings: [{ name: "pepperoni", placement: "right" }] });
    expect(outA.ok).toBe(true);
    const b = vegCtx(["Large pizza please.", "Half plain, and make the other half Hawaiian.", "Yes."]);
    await run(b.ctx, "add_to_order", { menuItemId: "pz_large" });
    const outB = await run(b.ctx, "update_line", { lineId: "L1", hint: "other half Hawaiian", halfRecipes: [{ placement: "right", menuItemId: "pz_haw" }] });
    expect(outB.ok).toBe(true);
    // a recipe ALREADY on the line is never re-justified (a topping edit re-sends it)
    const c = vegCtx(["half hawaiian half cheese"]);
    await run(c.ctx, "add_to_order", { menuItemId: "pz_large", halfRecipes: [{ placement: "left", menuItemId: "pz_haw" }] });
    c.ctx.recentUserTexts = ["no pineapple", "and add bacon to the other side"];
    const outC = await run(c.ctx, "update_line", { lineId: "L1", hint: "add bacon other side", halfRecipes: [{ placement: "left", menuItemId: "pz_haw" }], addToppings: [{ name: "bacon", placement: "right" }] });
    expect(outC.ok).toBe(true);
  });

  it("with no caller text at all (harness/edge) the gate never blocks", async () => {
    const { ctx } = vegCtx([]);
    ctx.recentUserTexts = undefined;
    ctx.lastUserText = undefined;
    const out = await run(ctx, "add_to_order", { menuItemId: "pz_large", halfRecipes: [{ placement: "left", menuItemId: "pz_veg" }] });
    expect(out.ok).toBe(true);
  });
});

/* ═════════ an address that can't be found is read back + spelled, once (cmsw4s0mz) ═════════ */

describe("set_fulfilment: a full address the check can't place is read back and spelled — never 'got it'", () => {
  it("first miss: read back + one spelling question; second miss: take the order, store confirms; never a third ask", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue({ ok: true, status: 200, json: { hasZones: true, located: false, currency: "usd", instruction: "That address could not be pinned down." } });
    const first = await run(ctx, "set_fulfilment", { type: "delivery", street: "66 McKechnie Court", city: "Milton", zip: "L9E1E5" });
    expect(first.ok).toBe(true);
    expect(first.heardBack).toBe("66 McKechnie Court in Milton");
    expect(String(first.instruction)).toContain('Do NOT say "got it"');
    expect(String(first.instruction)).toContain("I have 66 McKechnie Court in Milton — could you spell the street name for me");
    expect(String(first.instruction)).toContain("call set_fulfilment again");
    // the caller spells it; still not on the map
    const second = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachern Court", city: "Milton", zip: "L9E1E5" });
    expect(second.ok).toBe(true);
    expect(String(second.instruction)).toContain("Do NOT ask again");
    expect(String(second.instruction)).toContain("store will confirm the delivery details");
    expect(String(second.instruction)).toContain("1166 McEachern Court in Milton");
    // a street with no city/postcode keeps the "ask for the rest" path, unchanged
    const partial = await run(ctx, "set_fulfilment", { type: "delivery", street: "12 Nowhere Lane" });
    expect(String(partial.instruction)).toContain("Ask for the city");
  });
});

/* ══════════════════ temporary closure (owner pause) gates ══════════════════ */

describe("temporary closure (owner pause) gates", () => {
  const FUTURE = new Date(Date.now() + 3600_000).toISOString();
  const PAST = new Date(Date.now() - 3600_000).toISOString();
  const PAUSED = { offered: true, pausedNow: true, pausedUntil: FUTURE, resumesLocal: "this evening at 8:00 PM" };
  const OPEN = { offered: true, pausedNow: false };

  it("set_fulfilment refuses a paused delivery BEFORE address/cart work, naming pickup + the resume time", async () => {
    const { ctx, api } = makeCtx();
    ctx.services = { pickup: OPEN, delivery: PAUSED };
    const r = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachern" });
    expect(r.error).toBe(true);
    expect(r.code).toBe("service_paused");
    expect(r.notSet).toBe(true);
    expect(r.alternatives).toEqual(["pickup"]);
    expect(r.resumesLocal).toBe("this evening at 8:00 PM");
    expect(String(r.message)).toContain("Offer pickup instead");
    expect(ctx.cart.fulfilment().type).not.toBe("delivery");
    expect(api.checkAddress).not.toHaveBeenCalled();
  });

  it("paused pickup mirrors: refuses and offers delivery", async () => {
    const { ctx } = makeCtx();
    ctx.services = { pickup: PAUSED, delivery: OPEN };
    const r = await run(ctx, "set_fulfilment", { type: "pickup" });
    expect(r.code).toBe("service_paused");
    expect(r.alternatives).toEqual(["delivery"]);
  });

  it("no alternative when the other channel is not offered", async () => {
    const { ctx } = makeCtx();
    ctx.services = { pickup: { offered: false, pausedNow: false }, delivery: PAUSED };
    const r = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachern" });
    expect(r.code).toBe("service_paused");
    expect(r.alternatives).toEqual([]);
    expect(String(r.message)).toContain("No orders can be taken right now");
  });

  it("an EXPIRED pause self-heals mid-call (timestamp beats a stale pausedNow)", async () => {
    const { ctx, api } = makeCtx();
    ctx.services = { pickup: OPEN, delivery: { offered: true, pausedNow: true, pausedUntil: PAST, resumesLocal: "earlier" } };
    const r = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachern" });
    expect(r.code).not.toBe("service_paused");
    expect(api.checkAddress).toHaveBeenCalled();
  });

  it("absent ctx.services (older Vercel payload) does not gate", async () => {
    const { ctx } = makeCtx();
    const r = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachern" });
    expect(r.code).not.toBe("service_paused");
  });

  it("quote_order maps the /api/orders 423 into the same refusal (mid-call pause flip)", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx); // pickup fulfilment set BEFORE the pause lands
    ctx.services = { pickup: PAUSED, delivery: OPEN };
    api.dryRunOrder.mockResolvedValue({ ok: false, status: 423, json: { code: "service_paused", resumesAtIso: FUTURE } });
    const r = await run(ctx, "quote_order");
    expect(r.error).toBe(true);
    expect(r.code).toBe("service_paused");
    expect(r.notQuoted).toBe(true);
    expect(r.resumesAtIso).toBe(FUTURE);
    expect(r.alternatives).toEqual(["delivery"]);
  });

  it("place_order 423 carries resumesAtIso + alternatives and stays not-placed", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await ready(ctx);
    await run(ctx, "quote_order");
    ctx.services = { pickup: PAUSED, delivery: OPEN };
    api.placeOrder.mockResolvedValue({ ok: false, status: 423, json: { code: "service_paused", resumesAtIso: FUTURE } });
    const r = await run(ctx, "place_order");
    expect(r.code).toBe("service_paused");
    expect(r.notPlaced).toBe(true);
    expect(r.resumesAtIso).toBe(FUTURE);
    expect(r.alternatives).toEqual(["delivery"]);
    expect(String(r.message)).toContain("Offer delivery instead");
  });
});

/* ═══════════════════ transfer_to_human under the store policy (A1b) ═══════════════════ */

describe("transfer_to_human under the store transfer policy (A1b)", () => {
  it("immediate (the default): connects on the first ask", async () => {
    const { ctx } = makeCtx();
    const r = await run(ctx, "transfer_to_human", { reason: "wants a person" });
    expect(r.ok).toBe(true);
    expect(r.transferred).toBe(true);
    expect(ctx.pendingTransfer).toBe("wants a person");
  });

  it("never: hands back the store line, never sets pendingTransfer, and is NOT a tool error", async () => {
    const { ctx } = makeCtx({ cfg: { transferPolicy: "never", transferDeflectionMessage: "We're slammed, but I can help." } });
    const r = await run(ctx, "transfer_to_human", { reason: "wants a person" });
    expect(r.ok).toBe(true);
    expect(r.transferred).toBe(false);
    expect(r.code).toBe("transfer_refused");
    expect(r.speakExactly).toBe("We're slammed, but I can help.");
    expect(String(r.instruction)).toMatch(/never say you are connecting/i);
    expect(ctx.pendingTransfer).toBeNull();
    expect(ctx.speakExactlyThisTurn).toContain("We're slammed, but I can help.");
    await run(ctx, "transfer_to_human", { reason: "again" });
    await run(ctx, "transfer_to_human", { reason: "and again" });
    expect(ctx.pendingTransfer).toBeNull();
  });

  it("reluctant: the first ask deflects (localized default line), the second ask connects", async () => {
    const { ctx } = makeCtx({ cfg: { transferPolicy: "reluctant" } });
    const first = await run(ctx, "transfer_to_human", { reason: "person" });
    expect(first.transferred).toBe(false);
    expect(String(first.speakExactly)).toMatch(/busy preparing orders/);
    expect(ctx.pendingTransfer).toBeNull();
    const second = await run(ctx, "transfer_to_human", { reason: "person again" });
    expect(second.transferred).toBe(true);
    expect(ctx.pendingTransfer).toBe("person again");
  });

  it("leave_message stores the message with the caller's number and speaks the confirmation", async () => {
    const { ctx, api } = makeCtx({ cfg: { transferPolicy: "never" } });
    const r = await run(ctx, "leave_message", { message: "Call me about the catering order", callbackName: "Dana" });
    expect(r.ok).toBe(true);
    expect(api.leaveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Call me about the catering order", name: "Dana", callSid: ctx.token.callSid, restaurantId: ctx.token.restaurantId }),
    );
    expect(ctx.speakExactlyThisTurn[ctx.speakExactlyThisTurn.length - 1]).toBe(r.speakExactly);
    expect(String(r.speakExactly)).toMatch(/passed that on/);
  });

  it("leave_message with nothing to pass on asks instead of saving an empty row", async () => {
    const { ctx, api } = makeCtx({ cfg: { transferPolicy: "never" } });
    const r = await run(ctx, "leave_message", { message: "   " });
    expect(r.error).toBe(true);
    expect(r.code).toBe("message_empty");
    expect(api.leaveMessage).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════ A6 engine-contract fixes ═══════════════════════════ */

describe("A6 — quote never waits for a name (C16)", () => {
  it("prices a pickup order with no name yet, and tells the model the name is still needed before placing", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await run(ctx, "set_fulfilment", { type: "pickup" });
    const q = await run(ctx, "quote_order");
    expect(q.ok).toBe(true);
    expect(q.total).toBe(24.5);
    expect(q.nameNeeded).toBe(true);
    expect(String(q.instruction)).toMatch(/still needs a NAME/);
    expect(api.dryRunOrder).toHaveBeenCalledTimes(1);
    // place_order still insists on the name.
    const p = await run(ctx, "place_order");
    expect(p.error).toBe(true);
    expect(p.problems.map((x: any) => x.code)).toEqual(["customer_name_missing"]);
    await run(ctx, "set_customer", { name: "Ada Lovelace" });
    const q2 = await run(ctx, "quote_order");
    expect(q2.nameNeeded).toBe(false);
    expect(String(q2.instruction)).not.toMatch(/still needs a NAME/);
  });
});

describe("A6 — a missing delivery field is NAMED (C12)", () => {
  it("quote_order surfaces the field the order route wants and asks for just that", async () => {
    const { ctx, api } = makeCtx();
    await addPizza(ctx);
    await run(ctx, "set_fulfilment", { type: "delivery", street: "933 Maple Avenue", city: "Milton" });
    api.dryRunOrder.mockResolvedValueOnce({ ok: false, status: 400, json: { error: "Delivery address incomplete", code: "delivery_field_required", field: "buzzer" } });
    const q = await run(ctx, "quote_order");
    expect(q.error).toBe(true);
    expect(q.code).toBe("delivery_field_required");
    expect(q.field).toBe("buzzer");
    expect(q.needsInfo).toBe(true);
    expect(String(q.instruction)).toMatch(/missing the buzzer/);
    expect(String(q.instruction)).toMatch(/Do not re-ask/);
  });
});

describe("A6 — update_line never says 'changed' when nothing changed (C14)", () => {
  it("an unknown key is a no_change, not a success", async () => {
    const { ctx } = makeCtx();
    await addPizza(ctx);
    const r = await run(ctx, "update_line", { lineId: "L1", hint: "the pizza", bogusField: "extra cheese" });
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.code).toBe("no_change");
    expect(String(r.instruction)).toMatch(/NOTHING on that line changed/);
  });
  it("a real change is still reported as a change", async () => {
    const { ctx } = makeCtx();
    await addPizza(ctx);
    const r = await run(ctx, "update_line", { lineId: "L1", hint: "the pizza", quantity: 2 });
    expect(r.ok).toBe(true);
    expect(r.code).not.toBe("no_change");
    expect(ctx.cart.lines()[0].intent.quantity).toBe(2);
  });
});

describe("A6 — the map matched a different street (C13)", () => {
  const hit = (matchedAddress: string) => ({
    ok: true,
    status: 200,
    json: { hasZones: true, located: true, inside: true, lat: 43.5, lng: -79.9, matchedAddress, postcode: "L9T 1A1", zoneName: "Zone 1", deliveryFee: 4.99, minimumOrder: 0, estimatedMinutes: 40 },
  });
  it("is a question, not a verified pin — and confirmAddress accepts it on the second call", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue(hit("12 Rutland Crescent, Milton, ON L9T 1A1"));
    const first = await run(ctx, "set_fulfilment", { type: "delivery", street: "12 Moreland Crescent", city: "Milton" });
    expect(first.ok).toBe(true);
    expect(first.streetMismatch).toBe(true);
    expect(first.located).toBeNull();
    expect(first.matchedAddress).toBe("12 Rutland Crescent, Milton, ON L9T 1A1");
    expect(String(first.instruction)).toMatch(/DIFFERENT street/);
    expect(ctx.cart.fulfilment().check?.located).toBeNull();
    expect(ctx.cart.validate().some((p) => p.code === "address_unverified")).toBe(true);
    // The caller confirms → same address + confirmAddress → the pin is accepted.
    const second = await run(ctx, "set_fulfilment", { type: "delivery", street: "12 Moreland Crescent", city: "Milton", confirmAddress: true });
    expect(second.located).toBe(true);
    expect(second.streetMismatch).toBeUndefined();
    expect(ctx.cart.fulfilment().check?.located).toBe(true);
    expect(api.checkAddress).toHaveBeenCalledTimes(2);
  });
  it("the same street in a different spelling is accepted straight away", async () => {
    const { ctx, api } = makeCtx();
    api.checkAddress.mockResolvedValue(hit("1166 McEachern Crt, Milton, ON L9T 0A1"));
    const r = await run(ctx, "set_fulfilment", { type: "delivery", street: "1166 McEachren Court", city: "Milton" });
    expect(r.located).toBe(true);
    expect(r.streetMismatch).toBeUndefined();
  });
});

describe("A6 — reservation dates (C15)", () => {
  it("'today' resolves to the restaurant's local date; a past date is refused with today echoed; not a struggle", async () => {
    const { ctx, api } = makeCtx();
    ctx.localDate = "2026-08-22";
    api.availability.mockResolvedValue({ available: true, slots: ["17:00", "19:00"] });
    const ok = await run(ctx, "check_reservation_availability", { date: "today", partySize: 2 });
    expect(api.availability).toHaveBeenCalledWith("luigis", "2026-08-22", 2);
    expect(ok.available).toBe(true);
    const past = await run(ctx, "check_reservation_availability", { date: "2025-01-01", partySize: 2 });
    expect(past.error).toBe(true);
    expect(past.code).toBe("date_in_past");
    expect(past.needsInfo).toBe(true);
    expect(past.today).toBe("2026-08-22");
    expect(String(past.instruction)).toMatch(/today is 2026-08-22/);
    expect(api.availability).toHaveBeenCalledTimes(1);
    api.bookReservation.mockResolvedValue({ ok: true, status: 200, json: { confirmationCode: "ABC123", status: "confirmed" } });
    await run(ctx, "book_reservation", { customerName: "Ada Lovelace", partySize: 2, date: "tomorrow", time: "19:00" });
    expect(api.bookReservation).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-08-23" }));
  });
});

/* ═══════════════════ A5 — lookup_recent_orders grounds every status answer ═══════════════════ */

describe("lookup_recent_orders grounds every status answer (A5)", () => {
  const webOrder = {
    id: "ord_web_1",
    orderRef: "4821",
    minutesAgo: 12,
    source: "web",
    thirdParty: false,
    type: "pickup",
    status: "accepted",
    stage: "preparing",
    itemCount: 2,
    items: ["1× Large 2 Topping", "1× Garlic Bread"],
    readyInMinutes: 9,
    scheduledForIso: null,
    dispatch: null,
    matchedBy: "phone",
  };

  it("looks up by the caller's number, speaks the localized status verbatim and the real ready estimate", async () => {
    const { ctx, api } = makeCtx({ from: "+16475550100" });
    api.recentOrders.mockResolvedValue({ found: 1, orders: [webOrder] });
    const r = await run(ctx, "lookup_recent_orders", {});
    expect(api.recentOrders).toHaveBeenCalledWith("luigis", "6475550100", undefined); // caller ID, canonical digits
    expect(r.ok).toBe(true);
    expect(r.found).toBe(1);
    expect(r.orders[0].statusSpoken).toBe("Your order is being prepared right now.");
    expect(r.orders[0]).not.toHaveProperty("total");
    expect(String(r.instruction)).toMatch(/about 9 minutes/);
    expect(String(r.instruction)).toMatch(/Never invent a driver position/);
    expect(ctx.statusOrders).toEqual([{ id: "ord_web_1", ref: "4821" }]);
  });

  it("passes a spoken order number through (digits only) and says so when nothing matches", async () => {
    const { ctx, api } = makeCtx();
    const r = await run(ctx, "lookup_recent_orders", { orderNumber: "ending 48-21" });
    expect(api.recentOrders).toHaveBeenCalledWith("luigis", expect.any(String), "4821");
    expect(r.found).toBe(0);
    expect(String(r.instruction)).toMatch(/No order ending in 4821/);
    expect(String(r.instruction)).toMatch(/Never guess a status/);
  });

  it("a third-party (DoorDash) order is flagged so the agent deflects to that app", async () => {
    const { ctx, api } = makeCtx();
    api.recentOrders.mockResolvedValue({ found: 1, orders: [{ ...webOrder, source: "doordash", thirdParty: true, type: "delivery" }] });
    const r = await run(ctx, "lookup_recent_orders", {});
    expect(r.orders[0].thirdParty).toBe(true);
    expect(String(r.instruction)).toMatch(/third-party app/);
  });

  it("a delivery on the road speaks the out-for-delivery line; the lookup failing never invents a status", async () => {
    const { ctx, api } = makeCtx();
    api.recentOrders.mockResolvedValue({ found: 1, orders: [{ ...webOrder, type: "delivery", stage: "out_for_delivery", dispatch: { status: "picked_up" } }] });
    const r = await run(ctx, "lookup_recent_orders", {});
    expect(r.orders[0].statusSpoken).toBe("Your order is out for delivery and on its way to you.");
    api.recentOrders.mockRejectedValueOnce(new Error("boom"));
    const bad = await run(ctx, "lookup_recent_orders", {});
    expect(bad.error).toBe(true);
    expect(bad.code).toBe("lookup_failed");
    expect(String(bad.instruction)).toMatch(/never guess/i);
  });

  it("send_sms_link tracking texts the looked-up order's live page; without a lookup it asks for one first", async () => {
    const { ctx, api } = makeCtx();
    const none = await run(ctx, "send_sms_link", { linkType: "tracking" });
    expect(none.error).toBe(true);
    expect(none.code).toBe("no_order_to_track");
    api.recentOrders.mockResolvedValue({ found: 1, orders: [webOrder] });
    await run(ctx, "lookup_recent_orders", {});
    const sent = await run(ctx, "send_sms_link", { linkType: "tracking" });
    expect(sent.ok).toBe(true);
    expect(api.sendSms).toHaveBeenCalledWith(expect.objectContaining({ linkType: "tracking", orderId: "ord_web_1" }));
  });

  it("is gated by canAnswerOrderStatus", () => {
    expect(toolsForConfig({ ...normalizeAgentConfig({}), canAnswerOrderStatus: false }).map((t) => t.name)).not.toContain("lookup_recent_orders");
    expect(toolsForConfig(normalizeAgentConfig({})).map((t) => t.name)).toContain("lookup_recent_orders");
  });
});
