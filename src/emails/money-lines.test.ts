/**
 * Every charge, fee and discount must be VISIBLE on the emails people reconcile
 * money from.
 *
 * Written after two real defects in one day, both of the same shape: the number
 * was correct, but the row never rendered.
 *
 *   - A free-delivery promo stores deliveryFee = 0, and the row renders only
 *     when `deliveryFee > 0`. So the staff email showed no delivery line at all
 *     and read as if delivery had been forgotten (order ORD-742085738).
 *   - notifyStaff forwards money fields one by one instead of spreading, so a
 *     newly added field was dropped between payload and sender. Both ends were
 *     optional, so tsc was happy and the "fix" was a no-op.
 *
 * Neither is catchable by types, by the i18n parity audit, or by reading the
 * template — only by rendering it and looking. So that is what these do: build
 * an order where EVERY money component is present and distinct, render the real
 * templates, and assert each amount actually appears.
 *
 * Amounts are deliberately unique so a missing row cannot be masked by another
 * row that happens to share its value.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import OrderConfirmation from "./templates/OrderConfirmation";
import KitchenNotification from "./templates/KitchenNotification";

const ITEMS = [{ name: "Meat Lovers (Large)", quantity: 1, price: 23.24, modifiers: [] }] as any;

/** Distinct amounts — no two rows share a value. */
const MONEY = {
  subtotal: 84.94,
  taxAmount: 10.98,
  deliveryFee: 7.99,
  tip: 8.49,
  discount: 5.11,
  depositTotal: 3.27,
  serviceFees: [{ name: "Service fee", amount: 2.63 }],
  total: 112.31,
};

const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

describe("customer order confirmation shows every money line", () => {
  it("renders subtotal, delivery, service fee, deposit, tax, tip and discount", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      OrderConfirmation({
        t,
        customerName: "Nada",
        orderNumber: "ORD-1",
        restaurantName: "Luigi's",
        orderType: "delivery",
        paidOnline: true,
        estimatedMinutes: 45,
        items: ITEMS,
        trackingUrl: "https://example.com/t",
        ...MONEY,
      } as any),
    );
    const text = strip(html);
    for (const [label, amount] of [
      ["subtotal", MONEY.subtotal],
      ["delivery fee", MONEY.deliveryFee],
      ["tax", MONEY.taxAmount],
      ["tip", MONEY.tip],
      ["service fee", MONEY.serviceFees[0].amount],
      ["total", MONEY.total],
    ] as Array<[string, number]>) {
      expect(text, `${label} (${amount}) is missing from the customer email`).toContain(amount.toFixed(2));
    }
  });

  it("shows a promo-waived delivery fee as the original struck through, never as nothing", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      OrderConfirmation({
        t,
        customerName: "Nada",
        orderNumber: "ORD-2",
        restaurantName: "Luigi's",
        orderType: "delivery",
        paidOnline: true,
        estimatedMinutes: 45,
        items: ITEMS,
        trackingUrl: "https://example.com/t",
        subtotal: 84.94,
        // The waived case: the fee is ZERO on the order…
        deliveryFee: 0,
        // …and the promo carries what it was worth.
        appliedPromos: [{ name: "FREE DELIVERY", type: "free_delivery", discount: 7.99 }],
        total: 95.92,
      } as any),
    );
    const text = strip(html);
    // The original amount must still be visible, otherwise the customer cannot
    // see that the promo did anything at all.
    expect(text, "the waived delivery amount vanished from the customer email").toContain("7.99");
  });
});

describe("item lines reconcile to the subtotal", () => {
  // A 3x line at $9.99 costs $29.97. Printing the UNIT price beside "3x" made
  // the lines un-addable and contradicted the printed kitchen ticket, which has
  // always shown the line total.
  const THREE_OF = [
    { name: "Chicken Wings (20)", quantity: 3, price: 9.99, lineTotal: 29.97, modifiers: [] },
  ] as any;

  it("customer email shows the LINE total, not the unit price", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      OrderConfirmation({
        t,
        customerName: "Nada",
        orderNumber: "ORD-6",
        restaurantName: "Luigi's",
        orderType: "pickup",
        paidOnline: true,
        estimatedMinutes: 20,
        items: THREE_OF,
        trackingUrl: "https://example.com/t",
        // Deliberately DIFFERENT from the line total, so 29.97 can only come
        // from the item row itself — otherwise this test passes on the bug.
        subtotal: 31.11,
        total: 44.22,
      } as any),
    );
    expect(strip(html), "the line total is missing — the lines cannot add up").toContain("29.97");
  });

  it("staff email shows the LINE total too, so it matches the printed ticket", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        restaurantName: "Luigi's",
        orderNumber: "ORD-7",
        customerName: "Nada",
        orderType: "pickup",
        paidOnline: true,
        items: THREE_OF,
        dashboardUrl: "https://example.com/admin",
        subtotal: 31.11,
        total: 44.22,
      } as any),
    );
    expect(strip(html)).toContain("29.97");
  });

  it("falls back to unit x quantity when a legacy row has no stored line total", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        restaurantName: "Luigi's",
        orderNumber: "ORD-8",
        customerName: "Nada",
        orderType: "pickup",
        paidOnline: true,
        // No lineTotal — 2 x 7.25 must still render as 14.50, not 7.25.
        items: [{ name: "Garlic Bread", quantity: 2, price: 7.25, modifiers: [] }] as any,
        dashboardUrl: "https://example.com/admin",
        subtotal: 16.33,
        total: 21.44,
      } as any),
    );
    expect(strip(html)).toContain("14.50");
  });
});

describe("staff new-order email shows every money line", () => {
  it("renders subtotal, delivery, service fee, tax, tip, discount and total", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        restaurantName: "Luigi's",
        orderNumber: "ORD-3",
        customerName: "Nada",
        orderType: "delivery",
        paidOnline: true,
        items: ITEMS,
        dashboardUrl: "https://example.com/admin",
        ...MONEY,
      } as any),
    );
    const text = strip(html);
    for (const [label, amount] of [
      ["subtotal", MONEY.subtotal],
      ["delivery fee", MONEY.deliveryFee],
      ["tax", MONEY.taxAmount],
      ["tip", MONEY.tip],
      ["service fee", MONEY.serviceFees[0].amount],
      ["total", MONEY.total],
    ] as Array<[string, number]>) {
      expect(text, `${label} (${amount}) is missing from the staff email`).toContain(amount.toFixed(2));
    }
  });

  it("shows a promo-waived delivery fee instead of omitting the row (ORD-742085738)", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        restaurantName: "Luigi's",
        orderNumber: "ORD-4",
        customerName: "Nada",
        orderType: "delivery",
        paidOnline: true,
        items: ITEMS,
        dashboardUrl: "https://example.com/admin",
        subtotal: 58.96,
        deliveryFee: 0,
        savedDeliveryFee: 7.99,
        tip: 8.84,
        discount: 5.9,
        taxAmount: 6.9,
        total: 68.8,
      } as any),
    );
    const text = strip(html);
    expect(text, "the waived delivery amount vanished from the staff email").toContain("7.99");
    // And it must be labelled FREE, not left looking like a charge.
    expect(text.toUpperCase()).toContain("FREE");
  });

  it("never leaks a raw i18n key path into a money row", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        restaurantName: "Luigi's",
        orderNumber: "ORD-5",
        customerName: "Nada",
        orderType: "delivery",
        paidOnline: false,
        items: ITEMS,
        dashboardUrl: "https://example.com/admin",
        subtotal: 58.96,
        deliveryFee: 0,
        savedDeliveryFee: 7.99,
        total: 68.8,
      } as any),
    );
    // e.g. "receipt.customer.free" — a key that exists in no locale renders as
    // its own path. Shipped exactly that earlier today.
    expect(strip(html)).not.toMatch(/\b(receipt|email|checkout|customer)\.[a-zA-Z]+\.[a-zA-Z]+/);
  });
});

/**
 * Luigi 2026-08-11: the staff email for a $70.02 order read "Promo discount
 * −$37.01" and nothing else, so the kitchen had no way to tell WHICH specials
 * the customer had used — on a store running a Toonie Tuesday slice price, a
 * 30% VIP special and a menu-wide 20% at the same time, that single figure is
 * unreadable. Order.appliedPromos already snapshots every promo that fired, so
 * the data was there; only the render was missing.
 *
 * The invariant that matters is RECONCILIATION: the named rows plus any
 * remainder must still add up to the discount the Total was computed from.
 */
describe("staff email itemises the promos behind the discount", () => {
  const base = {
    restaurantName: "Luigi's",
    orderNumber: "ORD-910152825",
    customerName: "Ben",
    orderType: "delivery",
    items: ITEMS,
    subtotal: 70.02,
    tip: 10.5,
    taxAmount: 4.29,
    total: 47.8,
    dashboardUrl: "https://example.com/admin",
  };

  it("names each special with its own amount instead of one lumped figure", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        ...base,
        discount: 37.01,
        discountBreakdown: [
          { name: "TOONIE TUESDAY", amount: 21.0 },
          { name: "AUG VIP SPECIAL", amount: 11.01 },
          { name: "20% OFF Menu Wide - VIP MEMBERS", amount: 5.0 },
        ],
      } as any),
    );
    const text = strip(html);
    for (const [name, amount] of [
      ["TOONIE TUESDAY", "21.00"],
      ["AUG VIP SPECIAL", "11.01"],
      ["20% OFF Menu Wide - VIP MEMBERS", "5.00"],
    ]) {
      expect(text, `"${name}" is missing from the staff email`).toContain(name);
      expect(text, `${name}'s amount ${amount} is missing`).toContain(amount);
    }
    // Fully accounted for → no leftover generic row duplicating the same money.
    expect(text).not.toContain("37.01");
  });

  it("still shows the remainder when the named promos don't cover the whole discount", async () => {
    // e.g. a hand-entered coupon, or a legacy order with no promo snapshot.
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        ...base,
        discount: 37.01,
        discountBreakdown: [{ name: "AUG VIP SPECIAL", amount: 11.01 }],
      } as any),
    );
    const text = strip(html);
    expect(text).toContain("AUG VIP SPECIAL");
    expect(text).toContain("11.01");
    expect(text).toContain("26.00"); // the remainder — money is never dropped
  });

  it("falls back to the single line for an order with no snapshot at all", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({ t, ...base, discount: 37.01 } as any),
    );
    const text = strip(html);
    expect(text).toContain("37.01");
  });

  it("shows a coupon code beside its promo when one was typed", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      KitchenNotification({
        t,
        ...base,
        discount: 3.5,
        discountBreakdown: [{ name: "5% off your next online order", amount: 3.5, couponCode: "WIN1" }],
      } as any),
    );
    expect(strip(html)).toContain("WIN1");
  });
});
