/**
 * The delivery address on a printed ticket.
 *
 * Luigi 2026-08-12: "ensure the full proper delivery address prints. addresses
 * should be capitalized and correctly formatted. many orders come in just with
 * lowercase street name. doesn't look good."
 *
 * Two things were wrong on paper: the street printed exactly as typed (usually
 * lowercase), and the POSTAL CODE never printed at all — the column has always
 * held it, but no receipt section read it, so a driver working off the ticket
 * alone had an incomplete address.
 *
 * The slip has TWO builders that must stay in lockstep — the ESC/POS byte
 * builder (receipt.ts, the GOLDEN pipeline) and the line builder behind the
 * native LAN printer (receipt-lines.ts). Fixing one and forgetting the other is
 * invisible until paper comes out wrong, so both are asserted here.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import defaults from "./default-receipt-config.json";
import {
  buildKitchenReceiptFromConfig,
  buildCustomerReceiptFromConfig,
  type ReceiptOrder,
  type ReceiptRestaurant,
} from "./receipt";
import { buildKitchenReceiptLines, buildCustomerReceiptLines } from "./receipt-lines";
import type { CustomerConfig, KitchenConfig } from "./receipt-schema";

const KITCHEN = (defaults as { kitchen: KitchenConfig }).kitchen;
const CUSTOMER = (defaults as { customer: CustomerConfig }).customer;

const RESTAURANT: ReceiptRestaurant = {
  name: "Luigi's Lasagna & Pizzeria",
  currency: "cad",
  timezone: "America/Toronto",
  hoursFormat: "12h",
} as ReceiptRestaurant;

/** Felcy's real order, as a customer actually types it on a phone. */
const ORDER: ReceiptOrder = {
  orderNumber: "1228616868",
  type: "delivery",
  status: "accepted",
  customerName: "felcy alexander",
  customerPhone: "+14168315144",
  customerEmail: "felcy1187@gmail.com",
  deliveryAddress: "705 rayner court",
  deliveryCity: "milton",
  deliveryZip: "l9t0p1",
  notes: null,
  subtotal: 57.22,
  taxAmount: 7.44,
  deliveryFee: 0,
  tip: 5.82,
  total: 70.48,
  createdAt: new Date("2026-08-12T21:25:00Z"),
  items: [{ name: "Margherita", quantity: 1, price: 16.99, modifiers: [] }],
} as unknown as ReceiptOrder;

const bytesText = (buf: Buffer) => buf.toString("latin1");
const linesText = (lines: Array<{ text?: string }>) => lines.map((l) => l.text ?? "").join("\n");

async function bothKitchen() {
  return [
    bytesText(await buildKitchenReceiptFromConfig(ORDER, RESTAURANT, KITCHEN, "80mm", "escpos", "en")),
    linesText(await buildKitchenReceiptLines(ORDER, RESTAURANT, KITCHEN, "80mm", "en")),
  ];
}

async function bothCustomer() {
  return [
    bytesText(await buildCustomerReceiptFromConfig(ORDER, RESTAURANT, CUSTOMER, "80mm", "escpos", "en")),
    linesText(await buildCustomerReceiptLines(ORDER, RESTAURANT, CUSTOMER, "80mm", "en")),
  ];
}

describe("printed delivery address — kitchen ticket", () => {
  it("capitalizes the street the customer typed in lowercase", async () => {
    for (const out of await bothKitchen()) {
      expect(out).toContain("705 Rayner Court");
      expect(out).not.toContain("705 rayner court");
    }
  });

  it("prints the postal code, which never reached paper before", async () => {
    for (const out of await bothKitchen()) {
      // City + postal code share one line, so the full address costs no extra
      // line on an 80mm ticket.
      expect(out).toContain("Milton L9T 0P1");
    }
  });

  it("capitalizes the customer name too, matching the kitchen screen", async () => {
    // The tile has said "Felcy Alexander" since 2026-07-03 while the paper one
    // line above the address still said "felcy alexander".
    for (const out of await bothKitchen()) {
      expect(out).toContain("Felcy Alexander");
      expect(out).not.toContain("felcy alexander");
    }
  });
});

describe("printed delivery address — customer receipt", () => {
  it("formats the same address the same way", async () => {
    for (const out of await bothCustomer()) {
      expect(out).toContain("705 Rayner Court");
      expect(out).toContain("Milton L9T 0P1");
    }
  });
});

describe("printed delivery address — degradation", () => {
  it("prints nothing extra when the order has no city or postcode", async () => {
    const bare = { ...ORDER, deliveryCity: null, deliveryZip: null } as ReceiptOrder;
    const out = bytesText(
      await buildKitchenReceiptFromConfig(bare, RESTAURANT, KITCHEN, "80mm", "escpos", "en"),
    );
    expect(out).toContain("705 Rayner Court");
    expect(out).not.toContain("Milton");
  });

  it("leaves a pickup order's ticket without any address at all", async () => {
    const pickup = { ...ORDER, type: "pickup" } as ReceiptOrder;
    for (const out of [
      bytesText(await buildKitchenReceiptFromConfig(pickup, RESTAURANT, KITCHEN, "80mm", "escpos", "en")),
      linesText(await buildKitchenReceiptLines(pickup, RESTAURANT, KITCHEN, "80mm", "en")),
    ]) {
      expect(out).not.toContain("Rayner");
      expect(out).not.toContain("L9T 0P1");
    }
  });
});
