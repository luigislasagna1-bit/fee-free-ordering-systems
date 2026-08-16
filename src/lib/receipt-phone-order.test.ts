/**
 * Nabil AI phone-order receipts.
 *
 * Luigi 2026-08-16: "ensure there is a separate receipt layout print for phone
 * orders, and ensure it says clearly at the top of the receipt that it's a
 * PHONE ORDER and the payment status."
 *
 * Why it matters on paper: at Luigi's store every WEB order is prepaid by card,
 * so a phone order (pay at pickup) is the ONLY unpaid ticket on the rail — and
 * without a banner it looks exactly like every other ticket, so the counter
 * could hand it over without collecting the money.
 *
 * What is asserted, for BOTH builders (ESC/POS bytes = the GOLDEN pipeline,
 * and the StarXpand line builder behind the native LAN printer):
 *   - the PHONE template leads with "PHONE ORDER" + "NOT PAID - $X DUE ON …";
 *   - the customer receipt carries the same banner for a phone order only;
 *   - a web order's tickets are byte-for-byte free of it;
 *   - PAID phone orders say PAID, not the amount-due line;
 *   - the synthetic voice e-mail never prints.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import defaults from "./default-receipt-config.json";
import {
  buildKitchenReceiptFromConfig,
  buildCustomerReceiptFromConfig,
  isPhoneOrder,
  phoneOrderPaymentLine,
  printableCustomerEmail,
  type ReceiptOrder,
  type ReceiptRestaurant,
} from "./receipt";
import { buildKitchenReceiptLines, buildCustomerReceiptLines } from "./receipt-lines";
import {
  parseReceiptConfig,
  DEFAULT_PHONE_CONFIG,
  DEFAULT_KITCHEN_CONFIG,
  DEFAULT_CUSTOMER_CONFIG,
  PHONE_ORDER_CHANNEL,
  type CustomerConfig,
  type KitchenConfig,
  type PhoneConfig,
} from "./receipt-schema";
import { getDict } from "./i18n-dict";

const KITCHEN = (defaults as { kitchen: KitchenConfig }).kitchen;
const CUSTOMER = (defaults as { customer: CustomerConfig }).customer;
const PHONE = (defaults as { phone: PhoneConfig }).phone;

const RESTAURANT: ReceiptRestaurant = {
  name: "Luigi's Lasagna & Pizzeria",
  currency: "cad",
  timezone: "America/Toronto",
  hoursFormat: "12h",
} as ReceiptRestaurant;

/** A Nabil AI order as /api/orders stores it: channel "voice", cash, pending,
 *  the synthetic e-mail the voice service has to send. */
const PHONE_ORDER: ReceiptOrder = {
  orderNumber: "1228700001",
  type: "pickup",
  status: "accepted",
  customerName: "roya safi",
  customerPhone: "+14168315144",
  customerEmail: "voice.14168315144@voice.nabil.invalid",
  notes: null,
  subtotal: 30.53,
  taxAmount: 3.97,
  deliveryFee: 0,
  tip: 0,
  total: 34.5,
  paymentMethod: "cash",
  paymentStatus: "pending",
  channel: PHONE_ORDER_CHANNEL,
  createdAt: new Date("2026-08-16T21:25:00Z"),
  items: [{ name: "Lasagna", quantity: 1, price: 16.99, subtotal: 16.99, modifiers: [] }],
} as unknown as ReceiptOrder;

/** The same order placed on the website: card, paid, a real e-mail, no channel. */
const WEB_ORDER: ReceiptOrder = {
  ...PHONE_ORDER,
  customerEmail: "roya@example.com",
  paymentMethod: "card",
  paymentStatus: "paid",
  channel: null,
};

const bytesText = (buf: Buffer) => buf.toString("latin1");
const linesText = (lines: Array<{ text?: string }>) => lines.map((l) => l.text ?? "").join("\n");

async function kitchenBoth(order: ReceiptOrder, cfg: KitchenConfig | PhoneConfig) {
  return [
    bytesText(await buildKitchenReceiptFromConfig(order, RESTAURANT, cfg, "80mm", "plaintext", "en")),
    linesText(await buildKitchenReceiptLines(order, RESTAURANT, cfg, "80mm", "en")),
  ];
}

async function customerBoth(order: ReceiptOrder, cfg: CustomerConfig = CUSTOMER) {
  return [
    bytesText(await buildCustomerReceiptFromConfig(order, RESTAURANT, cfg, "80mm", "plaintext", "en")),
    linesText(await buildCustomerReceiptLines(order, RESTAURANT, cfg, "80mm", "en")),
  ];
}

describe("phone-order template (the separate layout)", () => {
  it("leads with the PHONE ORDER banner, before anything else on the ticket", async () => {
    for (const out of await kitchenBoth(PHONE_ORDER, PHONE)) {
      const banner = out.indexOf("PHONE ORDER");
      expect(banner).toBeGreaterThanOrEqual(0);
      // The kitchen title, order type badge and order number all come AFTER it.
      expect(banner).toBeLessThan(out.indexOf("KITCHEN ORDER"));
      expect(banner).toBeLessThan(out.indexOf("#1228700001"));
    }
  });

  it("prints the payment status with the amount still owed, right under the banner", async () => {
    for (const out of await kitchenBoth(PHONE_ORDER, PHONE)) {
      expect(out).toContain("NOT PAID - $34.50 DUE ON PICKUP");
      const banner = out.indexOf("PHONE ORDER");
      const status = out.indexOf("NOT PAID");
      expect(status).toBeGreaterThan(banner);
      expect(status - banner).toBeLessThan(80); // adjacent lines, not buried further down
    }
  });

  it("says PAID (and no amount due) once the order is paid", async () => {
    const paid = { ...PHONE_ORDER, paymentStatus: "paid" } as ReceiptOrder;
    for (const out of await kitchenBoth(paid, PHONE)) {
      expect(out).toContain("PHONE ORDER");
      expect(out).not.toContain("NOT PAID");
      // The banner's own PAID line — beyond the k_prep "Payment: PAID" footer.
      expect(out.indexOf("PAID")).toBeLessThan(out.indexOf("KITCHEN ORDER"));
    }
  });

  it("names delivery when the phone order is a delivery", async () => {
    const delivery = { ...PHONE_ORDER, type: "delivery", deliveryAddress: "705 rayner court" } as ReceiptOrder;
    for (const out of await kitchenBoth(delivery, PHONE)) {
      expect(out).toContain("NOT PAID - $34.50 DUE ON DELIVERY");
    }
  });

  it("subtracts Reward Dollars already applied from the amount due", async () => {
    const withCredit = { ...PHONE_ORDER, rewardsActive: true, creditApplied: 10 } as ReceiptOrder;
    for (const out of await kitchenBoth(withCredit, PHONE)) {
      expect(out).toContain("NOT PAID - $24.50 DUE ON PICKUP");
    }
  });

  it("is otherwise the store's kitchen ticket — same sections, same order, banner in front", () => {
    expect(PHONE.receiptType).toBe("phone");
    expect(PHONE.sections[0].type).toBe("k_phone_order");
    expect(PHONE.sections.slice(1).map((s) => s.type)).toEqual(KITCHEN.sections.map((s) => s.type));
    // The kitchen template itself is untouched — web orders never see the banner.
    expect(KITCHEN.sections.some((s) => s.type === "k_phone_order")).toBe(false);
  });
});

describe("customer receipt — banner only for a phone order", () => {
  it("prints PHONE ORDER + the payment status for a Nabil AI order", async () => {
    for (const out of await customerBoth(PHONE_ORDER)) {
      expect(out).toContain("PHONE ORDER");
      expect(out).toContain("NOT PAID - $34.50 DUE ON PICKUP");
      // Near the top: before the order number, i.e. before the order body.
      expect(out.indexOf("PHONE ORDER")).toBeLessThan(out.indexOf("Order #"));
    }
  });

  it("prints nothing of it on a web order — the section leaves no gap", async () => {
    for (const out of await customerBoth(WEB_ORDER)) {
      expect(out).not.toContain("PHONE ORDER");
      expect(out).not.toContain("NOT PAID");
    }
  });

  it("existing saved customer templates gain the banner section on parse (back-fill), disabled ones stay silent", async () => {
    // A template saved before this shipped has no phone_order section at all.
    const legacy = JSON.stringify({
      ...CUSTOMER,
      sections: CUSTOMER.sections.filter((s) => s.type !== "phone_order"),
    });
    const parsed = parseReceiptConfig(legacy, "customer");
    expect(parsed.sections.some((s) => s.type === "phone_order")).toBe(true);
    for (const out of await customerBoth(PHONE_ORDER, parsed)) expect(out).toContain("PHONE ORDER");

    // The restaurant can switch it off like any other section.
    const off = { ...parsed, sections: parsed.sections.map((s) => (s.type === "phone_order" ? { ...s, enabled: false } : s)) };
    for (const out of await customerBoth(PHONE_ORDER, off)) expect(out).not.toContain("PHONE ORDER");
  });
});

describe("the synthetic voice e-mail never reaches paper", () => {
  it("customer receipt omits voice.<phone>@voice.nabil.invalid, keeps a real address", async () => {
    for (const out of await customerBoth(PHONE_ORDER)) {
      expect(out).not.toContain("voice.nabil.invalid");
      expect(out).toContain("Roya Safi");
      expect(out).toContain("+14168315144");
    }
    for (const out of await customerBoth(WEB_ORDER)) expect(out).toContain("roya@example.com");
  });

  it("printableCustomerEmail is the single rule both builders use", () => {
    expect(printableCustomerEmail(PHONE_ORDER)).toBeNull();
    expect(printableCustomerEmail(WEB_ORDER)).toBe("roya@example.com");
    expect(printableCustomerEmail({ customerEmail: null })).toBeNull();
  });
});

describe("helpers + defaults", () => {
  it("isPhoneOrder keys on Order.channel === 'voice' only", () => {
    expect(isPhoneOrder(PHONE_ORDER)).toBe(true);
    expect(isPhoneOrder(WEB_ORDER)).toBe(false);
    expect(isPhoneOrder({ channel: "marketplace" })).toBe(false);
    expect(isPhoneOrder({ channel: undefined })).toBe(false);
  });

  it("phoneOrderPaymentLine mirrors the payment section's status semantics", async () => {
    const t = await getDict("en");
    const fmt = (n: number) => `$${n.toFixed(2)}`;
    expect(phoneOrderPaymentLine(PHONE_ORDER, t, fmt)).toBe("NOT PAID - $34.50 DUE ON PICKUP");
    expect(phoneOrderPaymentLine({ ...PHONE_ORDER, paymentStatus: "paid" }, t, fmt)).toBe("PAID");
    expect(phoneOrderPaymentLine({ ...PHONE_ORDER, paymentStatus: "partially_refunded" }, t, fmt)).toBe("PARTIALLY REFUNDED");
  });

  it("parseReceiptConfig knows the phone kind and falls back to its default", () => {
    expect(parseReceiptConfig(null, "phone").receiptType).toBe("phone");
    expect(parseReceiptConfig(null, "phone").sections.length).toBe(DEFAULT_PHONE_CONFIG.sections.length);
    // A kitchen template handed in as "phone" is NOT accepted — kinds are strict.
    const kitchenRaw = JSON.stringify(DEFAULT_KITCHEN_CONFIG);
    expect(parseReceiptConfig(kitchenRaw, "phone").receiptType).toBe("phone");
    // Saved phone templates round-trip and get back-filled like the others.
    const saved = JSON.stringify({ ...DEFAULT_PHONE_CONFIG, sections: [] });
    expect(parseReceiptConfig(saved, "phone").sections.length).toBe(DEFAULT_PHONE_CONFIG.sections.length);
    // Customer default carries the banner right after the store header.
    const types = DEFAULT_CUSTOMER_CONFIG.sections.map((s) => s.type);
    expect(types.indexOf("phone_order")).toBeGreaterThan(types.indexOf("store_info"));
    expect(types.indexOf("phone_order")).toBeLessThan(types.indexOf("order_info"));
  });
});
