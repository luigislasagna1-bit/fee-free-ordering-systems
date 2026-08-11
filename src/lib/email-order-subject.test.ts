/**
 * The SUBJECT LINE of the order-confirmation email.
 *
 * The audit of the auto-accept fix found this branch completely untested: the
 * subject is chosen in sendOrderConfirmationEmail (src/lib/email.ts), OUTSIDE
 * the template, so the template-render tests cannot reach it and
 * notifications.test.ts mocks the sender away. It is also the one line most
 * customers actually read — "awaiting confirmation" sitting in the inbox of
 * someone whose order the kitchen already took is the whole bug.
 *
 * Drives the real function through a mocked Resend transport.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock, prismaMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => ({ data: { id: "email_1" }, error: null })),
  prismaMock: { platformSettings: { findUnique: vi.fn(async () => null) } },
}));

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// A transport must exist for send() to reach the Resend client, and the dev
// guard must be lifted — otherwise send() short-circuits before the subject
// ever reaches a mock we can assert on.
process.env.RESEND_API_KEY = "re_test_key_not_real";
process.env.ALLOW_DEV_EMAIL = "1";

import { sendOrderConfirmationEmail } from "./email";

const BASE = {
  to: "customer@example.com",
  customerName: "Sameem",
  orderNumber: "ORD-519009065",
  restaurantName: "Luigi's Lasagna & Pizzeria",
  items: [{ name: "Lasagna", quantity: 1, price: 15.8 }],
  total: 15.8,
  orderType: "pickup",
  estimatedTime: 20,
  trackingUrl: "https://example.com/t",
  locale: "en",
  currency: "cad",
};

const lastSubject = () => sendMock.mock.calls.at(-1)?.[0]?.subject;

beforeEach(() => {
  sendMock.mockClear();
});

describe("order confirmation subject line", () => {
  it("says AWAITING CONFIRMATION for an order the kitchen still has to accept", async () => {
    await sendOrderConfirmationEmail({ ...BASE } as never);
    expect(lastSubject()).toBe("Order #ORD-519009065 received — awaiting confirmation");
  });

  it("says CONFIRMED for an auto-accepted order", async () => {
    await sendOrderConfirmationEmail({ ...BASE, alreadyAccepted: true } as never);
    expect(lastSubject()).toBe("Order #ORD-519009065 confirmed");
    expect(lastSubject()).not.toContain("awaiting");
  });

  it("localizes the confirmed subject (fr)", async () => {
    await sendOrderConfirmationEmail({ ...BASE, locale: "fr", alreadyAccepted: true } as never);
    expect(lastSubject()).toBe("Commande #ORD-519009065 confirmée");
  });
});
