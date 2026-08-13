/**
 * An AUTO-ACCEPTED order gets exactly ONE email PER SIDE — the customer's
 * placement confirmation and the store's placement ping. Both must say
 * "confirmed"; neither gets a follow-up. Customer side first, store side below.
 *
 * The bug (Luigi 2026-08-11, ORD-143921044): auto-accept sets status
 * "accepted" at CREATE, so the order never transitions pending → accepted and
 * the kitchen-accept email — the one that normally carries the confirmation —
 * never fires. Yet this placement email still said "Awaiting restaurant
 * confirmation … you'll get a follow-up email the moment they accept". The
 * follow-up never came. The restaurant owner reasonably concluded auto-accept
 * was broken; it wasn't — the email was lying about it.
 *
 * Types can't catch this (the flag is optional at both ends) and neither can
 * the i18n audit. Only rendering the template and reading it can. So: render
 * it, and assert what the customer actually sees.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import OrderConfirmation from "./templates/OrderConfirmation";
import KitchenNotification from "./templates/KitchenNotification";

const strip = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

async function render(extra: Record<string, unknown>) {
  const t = await getDict("en");
  const html = await renderEmail(
    OrderConfirmation({
      t,
      customerName: "Sameem",
      orderNumber: "ORD-143921044",
      restaurantName: "Luigi's Lasagna & Pizzeria",
      orderType: "pickup",
      paidOnline: true,
      estimatedMinutes: 20,
      items: [{ name: "Lasagna", quantity: 1, price: 15.8, modifiers: [] }],
      subtotal: 15.8,
      total: 15.8,
      trackingUrl: "https://example.com/t",
      ...extra,
    } as any),
  );
  return strip(html);
}

describe("order confirmation email — pending vs already-accepted", () => {
  it("still promises a follow-up when the order really is awaiting the kitchen", async () => {
    const text = await render({});
    expect(text).toContain("Awaiting restaurant confirmation");
    expect(text).toContain("the restaurant will confirm it shortly");
    expect(text).toContain("follow-up email the moment they accept");
  });

  it("is the confirmation itself for an auto-accepted ASAP order", async () => {
    const text = await render({ alreadyAccepted: true });
    expect(text).toContain("Order confirmed");
    expect(text).toContain("Confirmed by the restaurant");
    expect(text).toContain("is confirmed and the kitchen is starting on it now");
    // The two promises that never get kept on an auto-accept store.
    expect(text).not.toContain("the restaurant will confirm it shortly");
    expect(text).not.toContain("follow-up email the moment they accept");
    expect(text).not.toContain("Awaiting restaurant confirmation");
  });

  it("does not claim the kitchen started on a SCHEDULED auto-accepted order", async () => {
    const text = await render({ alreadyAccepted: true, scheduledLabel: "Friday, Aug 15, 6:00 PM" });
    expect(text).toContain("booked in for the time shown below");
    expect(text).not.toContain("starting on it now");
    // The scheduled banner still renders — the customer needs the actual slot.
    expect(text).toContain("Friday, Aug 15, 6:00 PM");
  });

  it("does not claim the kitchen started when the order landed while CLOSED", async () => {
    const text = await render({
      alreadyAccepted: true,
      placedWhileClosed: true,
      opensAtLabel: "Tuesday, 12 Aug, 11:00 AM",
    });
    expect(text).toContain("the kitchen will start on it when the restaurant opens");
    expect(text).not.toContain("starting on it now");
    // Must NOT point at "the time shown below": a closed store's estimatedReady
    // is a now+prep guess landing inside its own closed hours.
    expect(text).not.toContain("booked in for the time shown below");
    // Closed note survives and still names the opening time.
    expect(text).toContain("Tuesday, 12 Aug, 11:00 AM");
  });

  it("never promises a second 'update when they open' on an accepted closed order", async () => {
    // The whole point of the change: an auto-accepted order is not queued
    // awaiting an update, and nothing fires at the named opening instant.
    const accepted = await render({
      alreadyAccepted: true,
      placedWhileClosed: true,
      opensAtLabel: "Tuesday, 12 Aug, 11:00 AM",
    });
    expect(accepted).not.toContain("you'll get an update as soon as they open");
    expect(accepted).not.toContain("your order is queued");
    expect(accepted).toContain("your order is already confirmed");

    // A PENDING closed order keeps the original promise — it is true there,
    // because the kitchen-accept email really does arrive at opening.
    const pending = await render({ placedWhileClosed: true, opensAtLabel: "Tuesday, 12 Aug, 11:00 AM" });
    expect(pending).toContain("your order is queued");
  });

  it("keeps the money + timing detail identical either way", async () => {
    const pending = await render({ estimatedReady: new Date("2026-08-11T18:02:00Z") });
    const accepted = await render({ alreadyAccepted: true, estimatedReady: new Date("2026-08-11T18:02:00Z") });
    for (const text of [pending, accepted]) {
      expect(text).toContain("Lasagna");
      expect(text).toContain("15.80");
    }
  });
});

// ── The STORE's copy of the same order (Luigi 2026-08-12, ORD-002270106) ──────
// The customer side above shipped 2026-08-11; the owner's did not. His
// auto-accepted $58.34 order arrived badged "New order" with "Accept this order
// … auto-reject runs if no action is taken" — for an order the customer had
// already been told was confirmed. Same fix, other side of the wire.
async function renderStaff(extra: Record<string, unknown>) {
  const t = await getDict("en");
  const html = await renderEmail(
    KitchenNotification({
      t,
      restaurantName: "Luigi's Lasagna & Pizzeria",
      orderNumber: "ORD-002270106",
      customerName: "Sameem",
      orderType: "delivery",
      paidOnline: true,
      items: [{ name: "SUPER PARTY SIZE", quantity: 1, price: 49.99, modifiers: [] }],
      subtotal: 49.99,
      total: 58.34,
      dashboardUrl: "https://example.com/admin/orders",
      ...extra,
    } as any),
  );
  return strip(html);
}

describe("kitchen new-order email — pending vs auto-accepted", () => {
  it("still tells the kitchen to accept an order that really is pending", async () => {
    const text = await renderStaff({});
    expect(text).toContain("New order");
    expect(text).toContain("Accept this order from the Kitchen Order App");
    expect(text).not.toContain("Auto-accepted");
  });

  // The old sentence pointed at "your configured timeout" — a setting that has
  // never existed. The real window is 4 minutes, or 15 measured from OPENING on
  // an order placed while closed (Luigi 2026-08-12).
  it("names the real accept window instead of an imaginary setting", async () => {
    const text = await renderStaff({ autoRejectMinutes: 4 });
    expect(text).toContain("within 4 minutes");
    expect(text).not.toContain("your configured timeout");
  });

  it("does not start a closed-store order's clock at placement", async () => {
    // Its 15 minutes run from when the shop opens; quoting them as a countdown
    // would be a lie for an order that lands overnight.
    const text = await renderStaff({ autoRejectMinutes: 15, placedWhileClosed: true });
    expect(text).toContain("parked until you open");
    expect(text).toContain("15 minutes to accept it");
    expect(text).not.toContain("your configured timeout");
  });

  it("keeps the old generic sentence when the caller doesn't know the window", async () => {
    // The kitchen test-order ping passes no minutes.
    const text = await renderStaff({});
    expect(text).toContain("your configured timeout");
  });

  it("never shows an accept window on an auto-accepted order", async () => {
    const text = await renderStaff({ autoAccepted: true, autoRejectMinutes: 4 });
    expect(text).not.toContain("within 4 minutes");
    expect(text).toContain("No action needed");
  });

  it("says AUTO-ACCEPTED and drops the accept prompt when auto-accept already ran", async () => {
    const text = await renderStaff({ autoAccepted: true });
    expect(text).toContain("Auto-accepted");
    expect(text).toContain("No action needed");
    expect(text).toContain("the customer has already been sent their confirmation");
    // The contradiction Luigi photographed: an order that cannot be
    // auto-rejected must never be threatened with auto-rejection.
    expect(text).not.toContain("Accept this order from the Kitchen Order App");
    expect(text).not.toContain("Auto-reject runs");
  });

  it("keeps the kitchen ticket itself identical either way", async () => {
    const pending = await renderStaff({});
    const accepted = await renderStaff({ autoAccepted: true });
    for (const text of [pending, accepted]) {
      expect(text).toContain("SUPER PARTY SIZE");
      expect(text).toContain("58.34");
      expect(text).toContain("Open Kitchen Order App");
    }
  });

  it("lets the acceptance email's own headline win over the auto-accept badge", async () => {
    // sendOrderAcceptedNotificationEmail passes headline "Order confirmed" and
    // showAcceptHint:false. It must not start rendering "Auto-accepted".
    const text = await renderStaff({ headline: "Order confirmed", showAcceptHint: false });
    expect(text).toContain("Order confirmed");
    expect(text).not.toContain("Auto-accepted");
    expect(text).not.toContain("Accept this order from the Kitchen Order App");
  });
});
