/**
 * The offline backend answers like the live app for the reads the session
 * makes, compiles through the REAL compiler, and prices/places like the order
 * route's dryRun / 201 / 409 envelopes. No LLM, no network.
 */
import { describe, expect, it } from "vitest";
import snapshotJson from "./fixtures/luigis.menu.json";
import type { MenuSnapshot } from "./snapshot-types";
import { createFakeBackend } from "./fake-backend";
import { priceOrder, resolveSimAddress } from "./fake-pricer";

const snapshot = snapshotJson as unknown as MenuSnapshot;
const SLUG = snapshot.slug;

// Fixture ids (prod snapshot 2026-08-15) — see scenarios/luigis-ids.ts.
const LARGE1 = "cmpuex5ze0aet04kvpjtep8fd"; // Large 1 Topping (no variants, 1 included @ 2.75)
const LARGE3 = "cmpuex5vp0a7704kve0ywsxp7"; // Large 3 Topping (the Large/Wings combo pizza)
const LARGE_WINGS_COMBO = "cmpuex1ie01rj04kvf6toxs1j";
const WINGS = "cmpuex6kl0ay804kvuo7b8w4d"; // Chicken Wings 10/20/30/40 + "How would you like them?"
const VANILLA_COKE = "cmpuex6qg0b1q04kv88agzzad"; // 3.49, no groups
const HAWAIIAN = "cmpuex5fl098604kvtaehpc6l"; // variants + presets

const modNames = (line: any) => (line?.modifiers ?? []).map((m: any) => m.name);

describe("fake backend — reads", () => {
  it("serves the snapshot menu and marks forced sold-outs", async () => {
    const b = createFakeBackend(snapshot, { soldOut: [VANILLA_COKE] });
    const menu = await b.menu(SLUG);
    const all = menu.menu.flatMap((c: any) => c.items);
    expect(all.find((i: any) => i.menuItemId === VANILLA_COKE)?.isSoldOut).toBe(true);
    expect(all.find((i: any) => i.menuItemId === LARGE1)?.isSoldOut).toBe(false);
    // The snapshot itself is untouched.
    expect(snapshot.menu.menu.flatMap((c) => c.items).find((i) => i.menuItemId === VANILLA_COKE)?.isSoldOut).toBe(false);
    expect(b.calls.map((c) => c.method)).toEqual(["menu"]);
  });

  it("context honours open + config overrides", async () => {
    const b = createFakeBackend(snapshot, { open: true, config: { allowPizzaCombo: false, maxCallSeconds: 120 } });
    const ctx = await b.context(SLUG);
    expect(ctx.open.isOpenNow).toBe(true);
    expect(ctx.open.status.kind).toBe("open");
    expect(ctx.config.allowPizzaCombo).toBe(false);
    expect(ctx.config.maxCallSeconds).toBe(120);
    expect(ctx.config.canTakeOrders).toBe(true); // untouched keys survive
    const closed = await createFakeBackend(snapshot, { open: false }).context(SLUG);
    expect(closed.open.isOpenNow).toBe(false);
  });

  it("itemOptions mirrors the route envelope for a pizza and a combo", async () => {
    const b = createFakeBackend(snapshot);
    const pizza = await b.itemOptions(SLUG, LARGE1);
    expect(pizza.currency).toBe("cad");
    expect(pizza.item.menuItemId).toBe(LARGE1);
    expect(pizza.item.pizzaConfig?.isPizza).toBe(true);
    expect(pizza.combo).toBeNull();

    const combo = await b.itemOptions(SLUG, LARGE_WINGS_COMBO);
    expect(combo.combo?.name).toBe("Large / Wings Combo");
    expect(combo.combo?.slots.map((s: any) => s.label)).toEqual(["Pizza", "Chicken Wings"]);
    // Slot choices are hydrated to full ItemData, with the combo's variant restriction applied.
    const wingsChoice = combo.combo?.slots[1].choices[0];
    expect(wingsChoice.menuItemId).toBe(WINGS);
    expect(wingsChoice.variants.map((v: any) => v.name)).toEqual(["20"]);
    expect(wingsChoice.modifierGroups.length).toBeGreaterThan(0);

    await expect(b.itemOptions(SLUG, "nope")).rejects.toThrow(/404/);
  });

  it("returningCaller / availability answer from opts and fixed slots", async () => {
    const b = createFakeBackend(snapshot, { returningCaller: { found: true, name: "Marco", customerId: "c1" } });
    expect(await b.returningCaller(SLUG, "+16475550100")).toEqual({ found: true, name: "Marco", customerId: "c1" });
    const av = await b.availability(SLUG, "2026-08-20", 4);
    expect(av.available).toBe(true);
    expect(av.slots.length).toBeGreaterThan(3);
  });
});

describe("fake backend — buildLine (real compiler)", () => {
  it("compiles a Large 1 Topping with pepperoni: defaults filled, subtotal at list price", async () => {
    const b = createFakeBackend(snapshot);
    const r = await b.buildLine({ slug: SLUG, kind: "pizza", intent: { menuItemId: LARGE1, toppings: [{ name: "pepperoni", placement: "whole" }] }, askGroupIds: [] });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.json.unresolved).toEqual([]);
    expect(r.json.line.menuItemId).toBe(LARGE1);
    expect(modNames(r.json.line)).toEqual(expect.arrayContaining(["REGULAR", "Pizza Sauce Base", "Regular Cheese", "Regular Cooked", "Pepperoni"]));
    expect(r.json.lineSubtotal).toBe(17.74); // 1 included topping — list price
    expect(r.json.readBack).toMatch(/Large 1 Topping/);
    expect(r.json.autoAppliedDeal).toBeNull(); // no day-deal loader offline
    expect(r.json.switchedTo).toBeNull(); // no size-family loader offline
  });

  it("half/half is written with the (L.H)/(R.H) prefixes and priced at half", async () => {
    const b = createFakeBackend(snapshot);
    const r = await b.buildLine({
      slug: SLUG,
      kind: "pizza",
      intent: {
        menuItemId: LARGE1,
        toppings: [
          { name: "pepperoni", placement: "left" },
          { name: "mushrooms", placement: "right" },
          { name: "bacon", placement: "whole" },
        ],
      },
      askGroupIds: [],
    });
    expect(r.ok).toBe(true);
    expect(modNames(r.json.line)).toEqual(expect.arrayContaining(["(L.H) Pepperoni", "(R.H) Mushrooms", "(W) Bacon"]));
    expect(r.json.halves).toEqual({ left: ["Pepperoni"], right: ["Mushrooms"], whole: ["Bacon"] });
    // 17.74 − 2.75 (1 included) + 1.38 + 1.38 + 2.75 = 20.50 (half lines round per line)
    expect(r.json.lineSubtotal).toBe(20.5);
  });

  it("asks (unresolved) instead of guessing when a size is missing, and refuses sold-out", async () => {
    const b = createFakeBackend(snapshot, { soldOut: [WINGS] });
    const noSize = await b.buildLine({ slug: SLUG, kind: "pizza", intent: { menuItemId: HAWAIIAN, size: "gigantic", toppings: [] }, askGroupIds: [] });
    expect(noSize.ok).toBe(true);
    expect(noSize.json.line).toBeNull();
    expect(noSize.json.unresolved[0]).toMatch(/isn't offered/);
    const sold = await b.buildLine({ slug: SLUG, kind: "item", intent: { menuItemId: WINGS, size: "20", options: ["hot mixed"] }, askGroupIds: [] });
    expect(sold.json.line).toBeNull();
    expect(sold.json.unresolved[0]).toMatch(/sold out/i);
  });

  it("compiles the Large / Wings combo with a pizza pick and a wings pick", async () => {
    const b = createFakeBackend(snapshot);
    const r = await b.buildLine({
      slug: SLUG,
      kind: "combo",
      intent: {
        menuItemId: LARGE_WINGS_COMBO,
        picks: [
          { menuItemId: LARGE3, toppings: [{ name: "pepperoni", placement: "whole" }, { name: "mushrooms", placement: "whole" }, { name: "bacon", placement: "whole" }] },
          { menuItemId: WINGS, options: ["hot mixed"] },
        ],
      },
      askGroupIds: [],
    });
    expect(r.ok).toBe(true);
    expect(r.json.unresolved).toEqual([]);
    expect(r.json.line.isCombo).toBe(true);
    expect(r.json.line.bundleItems).toHaveLength(2);
    expect(r.json.pickSlots.map((p: any) => p.slotLabel)).toEqual(["Pizza", "Chicken Wings"]);
    const wings = r.json.line.bundleItems[1];
    expect(wings.variantId).toBe("cmpuex6l10ayl04kvkvb0eam5"); // the only size the combo allows: 20
    expect(modNames(wings)).toEqual(["Hot Mixed"]);
  });

  it("gates kinds like the route: item on a pizza id is wrong_kind, unknown id is 404", async () => {
    const b = createFakeBackend(snapshot);
    const wrong = await b.buildLine({ slug: SLUG, kind: "item", intent: { menuItemId: LARGE1 }, askGroupIds: [] });
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBe(400);
    expect(wrong.json.code).toBe("wrong_kind");
    expect(wrong.json.actualKind).toBe("pizza");
    const missing = await b.buildLine({ slug: SLUG, kind: "item", intent: { menuItemId: "zzz" }, askGroupIds: [] });
    expect(missing.status).toBe(404);
  });
});

describe("fake backend — address", () => {
  it("with no curated addresses, any numbered street is inside at the flat fee; no number = not located", async () => {
    const b = createFakeBackend(snapshot);
    const ok = await b.checkAddress({ slug: SLUG, street: "123 Main St", city: "Milton", zip: "L9T 2J3" });
    expect(ok.ok).toBe(true);
    expect(ok.json).toMatchObject({ hasZones: true, located: true, inside: true, deliveryFee: 7.99, zoneName: "Sim Zone" });
    expect(typeof ok.json.lat).toBe("number");
    const vague = await b.checkAddress({ slug: SLUG, street: "Main Street" });
    expect(vague.json).toMatchObject({ hasZones: true, located: false });
    expect(vague.json.instruction).toMatch(/could not be pinned down/);
    const none = await b.checkAddress({ slug: SLUG });
    expect(none.ok).toBe(false);
    expect(none.status).toBe(400);
  });

  it("with curated addresses, matches case/punctuation-insensitively and reports the zone fee", () => {
    const withAddr: MenuSnapshot = {
      ...snapshot,
      addresses: [
        { street: "45 Bronte St S", city: "Milton", zip: "L9T 1Y6", lat: 43.51, lng: -79.88, zoneName: "Zone 3", fee: 8.99 },
        { street: "1 Far Away Rd", city: "Guelph", zip: "N1H 1A1", lat: 43.54, lng: -80.25, zoneName: null, fee: null },
      ],
    };
    const hit = resolveSimAddress(withAddr, { street: "45 bronte st. s", city: "MILTON", zip: "l9t1y6" });
    expect(hit).toMatchObject({ located: true, inside: true, zoneName: "Zone 3", fee: 8.99 });
    const outside = resolveSimAddress(withAddr, { street: "1 Far Away Rd" });
    expect(outside).toMatchObject({ located: true, inside: false, fee: 7.99 });
    expect(resolveSimAddress(withAddr, { street: "99 Nowhere Ave" })).toEqual({ located: false });
  });
});

describe("fake backend — orders", () => {
  const cokeX2 = { restaurantSlug: SLUG, type: "pickup", items: [{ menuItemId: VANILLA_COKE, variantId: null, quantity: 2, modifiers: [] }], customerName: "Test Caller", customerPhone: "6475550100" };

  it("dryRun prices subtotal + tax (+ delivery fee) in the route's envelope", async () => {
    const b = createFakeBackend(snapshot);
    const r = await b.dryRunOrder(cokeX2);
    expect(r.ok).toBe(true);
    expect(r.json).toMatchObject({ dryRun: true, subtotal: 6.98, tax: 0.91, deliveryFee: 0, total: 7.89, discount: 0, appliedPromoNames: [], serviceFees: [], deposits: [], tip: 0 });
    expect(r.json.lines).toEqual([{ name: "Vanilla Coke Can", quantity: 2, unitPrice: 3.49, subtotal: 6.98 }]);
    const d = await b.dryRunOrder({ ...cokeX2, type: "delivery", deliveryAddress: "123 Main St", deliveryCity: "Milton" });
    expect(d.json.deliveryFee).toBe(7.99);
    expect(d.json.total).toBe(15.88);
    expect(b.quotes).toHaveLength(2);
  });

  it("prices a half/half pizza exactly like the compiler's lineSubtotal", async () => {
    const b = createFakeBackend(snapshot);
    const built = await b.buildLine({
      slug: SLUG,
      kind: "pizza",
      intent: { menuItemId: LARGE1, quantity: 2, toppings: [{ name: "pepperoni", placement: "left" }, { name: "mushrooms", placement: "right" }, { name: "bacon", placement: "whole" }] },
      askGroupIds: [],
    });
    const p = priceOrder(snapshot, { type: "pickup", items: [built.json.line] });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.subtotal).toBe(built.json.lineSubtotal); // 2 × 20.49
  });

  it("placeOrder: 409 on a stale expectedTotal, 201 otherwise, idempotent on the key", async () => {
    const b = createFakeBackend(snapshot);
    const stale = await b.placeOrder({ ...cokeX2, expectedTotal: 7.5, idempotencyKey: "k1" });
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ code: "total_changed", total: 7.89, appliedPromoNames: [] });
    expect(b.placed).toHaveLength(0);

    const ok = await b.placeOrder({ ...cokeX2, expectedTotal: 7.89, idempotencyKey: "k1" });
    expect(ok.ok).toBe(true);
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ id: "sim_1", orderNumber: "SIM-0001", total: 7.89, promoDiscount: 0, appliedPromoNames: [] });
    expect(b.placed).toHaveLength(1);
    expect(b.placed[0].body.items).toHaveLength(1);

    const again = await b.placeOrder({ ...cokeX2, expectedTotal: 7.89, idempotencyKey: "k1" });
    expect(again.ok).toBe(true);
    expect(again.json.id).toBe("sim_1");
    expect(b.placed).toHaveLength(1);

    const other = await b.placeOrder({ ...cokeX2, idempotencyKey: "k2" });
    expect(other.json.orderNumber).toBe("SIM-0002");
    expect(b.placed).toHaveLength(2);
  });

  it("refuses unknown items and sold-out items at pricing time", async () => {
    const b = createFakeBackend(snapshot, { soldOut: [VANILLA_COKE] });
    const sold = await b.dryRunOrder(cokeX2);
    expect(sold.ok).toBe(false);
    expect(sold.json.code).toBe("sold_out");
    const bad = await b.dryRunOrder({ ...cokeX2, items: [{ menuItemId: "nope", variantId: null, quantity: 1, modifiers: [] }] });
    expect(bad.json.code).toBe("invalid_item");
  });
});

describe("fake backend — knobs and side channels", () => {
  it("failNext fails exactly one call to that method; latencyMs is applied and recorded", async () => {
    const b = createFakeBackend(snapshot, { failNext: { method: "dryRunOrder", code: "boom" }, latencyMs: 30 });
    const body = { type: "pickup", items: [{ menuItemId: VANILLA_COKE, variantId: null, quantity: 1, modifiers: [] }] };
    const first = await b.dryRunOrder(body);
    expect(first).toEqual({ ok: false, status: 500, json: { error: "Simulated failure (boom)", code: "boom" } });
    const second = await b.dryRunOrder(body);
    expect(second.ok).toBe(true);
    expect(b.calls.map((c) => c.ok)).toEqual([false, true]);
    expect(b.calls.every((c) => c.ms >= 25)).toBe(true);
    // GET-style failNext throws, like getInternal does on a non-2xx.
    const g = createFakeBackend(snapshot, { failNext: { method: "menu", code: "down" } });
    await expect(g.menu(SLUG)).rejects.toThrow(/down/);
    expect((await g.menu(SLUG)).menu.length).toBeGreaterThan(0);
  });

  it("records sms / call logs / event flushes and books reservations", async () => {
    const b = createFakeBackend(snapshot);
    expect((await b.sendSms({ to: "+1", linkType: "receipt" })).ok).toBe(true);
    expect((await b.logCallStart({ event: "start", callSid: "x" })).ok).toBe(true);
    expect((await b.logEvents({ event: "events", events: [{ type: "asr" }, { type: "turn" }] })).ok).toBe(true);
    expect((await b.logCall({ event: "end", callSid: "x" })).ok).toBe(true);
    expect(b.sms).toHaveLength(1);
    expect(b.events).toHaveLength(2);
    expect(b.logs.map((l: any) => l.event)).toEqual(["start", "events", "end"]);
    const res = await b.bookReservation({ partySize: 2 });
    expect(res.status).toBe(201);
    expect(res.json.confirmationCode).toMatch(/^SIMR/);
  });
});
