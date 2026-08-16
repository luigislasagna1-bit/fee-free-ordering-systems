/**
 * The receipt editor's live preview is the THIRD renderer of every template
 * (beside receipt.ts ESC/POS and receipt-lines.ts StarXpand) and promises
 * "Preview = Print". This renders it server-side and checks the Nabil AI
 * phone-order banner behaves like the printed ticket: present on the phone
 * template and on a phone order's customer receipt, absent on a web order,
 * with the same words as receipt.ts `phoneOrderPaymentLine`. Luigi 2026-08-16.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import defaults from "@/lib/default-receipt-config.json";
import type { CustomerConfig, KitchenConfig, PhoneConfig } from "@/lib/receipt-schema";
import { ReceiptRenderer, makeSampleOrder } from "./ReceiptRenderer";

const PHONE = (defaults as { phone: PhoneConfig }).phone;
const KITCHEN = (defaults as { kitchen: KitchenConfig }).kitchen;
const CUSTOMER = (defaults as { customer: CustomerConfig }).customer;
const RESTAURANT = { name: "Luigi's Lasagna", currency: "cad", address: "1 Main St", city: "Milton" };

function render(props: Parameters<typeof ReceiptRenderer>[0]): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages: en as any, timeZone: "America/Toronto" },
      createElement(ReceiptRenderer as any, props),
    ),
  );
}

describe("receipt editor preview — phone-order banner", () => {
  it("phone template preview leads with PHONE ORDER + the amount due", () => {
    const html = render({ type: "phone", config: PHONE, restaurant: RESTAURANT, order: makeSampleOrder("pickup", { phoneOrder: true }) });
    const banner = html.indexOf("PHONE ORDER");
    expect(banner).toBeGreaterThanOrEqual(0);
    // Sample: total 93.52 − 10.00 store credit already applied = 83.52 owed.
    expect(html).toContain("NOT PAID - $83.52 DUE ON PICKUP");
    expect(banner).toBeLessThan(html.indexOf("KITCHEN ORDER"));
  });

  it("customer preview shows the banner only when previewing a phone order", () => {
    const web = render({ type: "customer", config: CUSTOMER, restaurant: RESTAURANT, order: makeSampleOrder("pickup") });
    expect(web).not.toContain("PHONE ORDER");
    const phone = render({ type: "customer", config: CUSTOMER, restaurant: RESTAURANT, order: makeSampleOrder("delivery", { phoneOrder: true }) });
    expect(phone).toContain("PHONE ORDER");
    expect(phone).toContain("DUE ON DELIVERY");
    // Banner sits after the store header and before the order number.
    expect(phone.indexOf("PHONE ORDER")).toBeGreaterThan(phone.indexOf("Luigi&#x27;s Lasagna"));
    expect(phone.indexOf("PHONE ORDER")).toBeLessThan(phone.indexOf("ORD-001234"));
  });

  it("kitchen template preview never shows it (phone orders don't use that template)", () => {
    const html = render({ type: "kitchen", config: KITCHEN, restaurant: RESTAURANT, order: makeSampleOrder("pickup", { phoneOrder: true }) });
    expect(html).not.toContain("PHONE ORDER");
  });

  it("says PAID for a paid phone order", () => {
    const paid = { ...makeSampleOrder("pickup", { phoneOrder: true }), paymentStatus: "paid" };
    const html = render({ type: "phone", config: PHONE, restaurant: RESTAURANT, order: paid });
    expect(html).toContain("PHONE ORDER");
    expect(html).not.toContain("NOT PAID");
  });
});
