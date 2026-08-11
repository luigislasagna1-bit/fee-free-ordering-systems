/**
 * An AUTO-ACCEPTED order gets exactly ONE customer email — this one.
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
