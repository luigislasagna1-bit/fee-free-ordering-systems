/**
 * What the release fan-out TELLS the customer and the kitchen about an order.
 *
 * Two defects found the same afternoon on Luigi's live store, both invisible to
 * types and to the i18n audit because every field involved is optional:
 *
 *   1. ORD-143921044 — auto-accept sets status "accepted" at CREATE, so the
 *      order never transitions pending → accepted and the kitchen-accept email
 *      (the real confirmation) never fires. The customer got "awaiting
 *      restaurant confirmation … you'll get a follow-up email" and nothing ever
 *      followed.
 *   2. ORD-519009065 — a delivery into a 35-minute zone stores
 *      preparationTime = 35 and computes estimatedReady from it, but both
 *      emails printed the restaurant's flat 45-minute default. The timing block
 *      contradicted itself: placed 2:55 PM, "prep 45 minutes", delivery 3:30 PM.
 *
 * These assert the PAYLOADS, which is where both bugs lived.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, notifyCustomerMock, notifyStaffMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { updateMany: vi.fn(), findUnique: vi.fn() },
    reservation: { findFirst: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
  notifyCustomerMock: vi.fn(),
  notifyStaffMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  notifyCustomer: notifyCustomerMock,
  notifyStaff: notifyStaffMock,
}));
vi.mock("@/lib/coupon-ledger", () => ({ recordAppliedCoupons: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendKitchenPush: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/reward-earn", () => ({ projectOrderEarn: vi.fn(() => Promise.resolve(0)) }));
vi.mock("@/lib/order-status-token", () => ({ signActionToken: () => "tok" }));

import { fireOrderNotifications } from "./order-notifications";

const RESTAURANT = {
  id: "r1",
  name: "Luigi's Lasagna & Pizzeria",
  slug: "luigis-lasagna-pizzeria",
  subdomain: null,
  customDomain: null,
  customDomainStatus: null,
  estimatedPickup: 20,
  estimatedDelivery: 45, // the FLAT default the emails used to quote
  defaultLanguage: "en",
  currency: "cad",
  rewardsEnabled: false,
  rewardLabelSingular: null,
  rewardLabelPlural: null,
};

function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderNumber: "ORD-519009065",
    restaurantId: "r1",
    status: "accepted",
    type: "delivery",
    customerName: "Sameem",
    customerEmail: "info@luigislasagna.com",
    customerPhone: "9058649442",
    customerId: null,
    customerLocale: "en",
    total: 10.59,
    subtotal: 9.1,
    taxAmount: 1.49,
    deliveryFee: 0,
    tip: 0,
    couponDiscount: 0,
    promoDiscount: 0,
    appliedPromos: null,
    appliedServiceFees: null,
    creditApplied: 0,
    paymentMethod: "card",
    paymentStatus: "paid",
    preparationTime: 35, // the ZONE-AWARE promise this order was made on
    estimatedReady: new Date("2026-08-11T19:30:00Z"),
    createdAt: new Date("2026-08-11T18:55:00Z"),
    scheduledFor: null,
    scheduledSlotMinutes: null,
    placedWhileClosed: false,
    alertAt: null,
    notes: null,
    deliveryAddress: "17 commercial st",
    restaurant: RESTAURANT,
    items: [{ name: "Dipping Sauce", quantity: 1, price: 1.49, subtotal: 1.49, modifiers: [], bundleItems: null }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.reservation.findFirst.mockResolvedValue(null);
  prismaMock.customer.findUnique.mockResolvedValue(null);
  notifyCustomerMock.mockResolvedValue({ sent: true });
  notifyStaffMock.mockResolvedValue({ sent: true });
});

const customerPayload = () => notifyCustomerMock.mock.calls[0][0].payload;
const staffPayload = () => notifyStaffMock.mock.calls[0][0].payload;

describe("fireOrderNotifications — auto-accepted orders", () => {
  it("marks the confirmation email as the CONFIRMATION when the order is already accepted", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "accepted" }));
    await fireOrderNotifications("o1");
    expect(customerPayload().alreadyAccepted).toBe(true);
  });

  it("leaves a pending order's email promising the kitchen's confirmation", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "pending", preparationTime: null }));
    await fireOrderNotifications("o1");
    expect(customerPayload().alreadyAccepted).toBe(false);
  });

  // ORD-002270106 (Luigi 2026-08-12): the CUSTOMER's copy was fixed above on
  // 2026-08-11, the STORE's was not. An auto-accepted order still mailed the
  // owner "New order — accept it or auto-reject runs" for an order the customer
  // had already been told was confirmed. Both copies must read the same status.
  it("tells the STORE the order is already accepted too, not just the customer", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "accepted" }));
    await fireOrderNotifications("o1");
    expect(staffPayload().alreadyAccepted).toBe(true);
    expect(staffPayload().alreadyAccepted).toBe(customerPayload().alreadyAccepted);
  });

  it("keeps the STORE's accept prompt on an order the kitchen must still accept", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "pending", preparationTime: null }));
    await fireOrderNotifications("o1");
    expect(staffPayload().alreadyAccepted).toBe(false);
    expect(staffPayload().alreadyAccepted).toBe(customerPayload().alreadyAccepted);
  });
});

// Luigi 2026-08-12, alongside the auto-accept fix: the store email printed
// `Order.deliveryAddress` — the STREET only. City and postal code live in their
// own columns and never reached the reader, so the owner's copy of a delivery
// order was missing half the address GloriaFood prints.
describe("fireOrderNotifications — delivery address on the store email", () => {
  it("sends the FULL address — street, postcode, city — properly capitalized", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({ deliveryAddress: "705 rayner court", deliveryCity: "milton", deliveryZip: "l9t0p1" }),
    );
    await fireOrderNotifications("o1");
    expect(staffPayload().deliveryAddress).toBe("705 Rayner Court, L9T 0P1, Milton");
  });

  it("degrades to whatever the order actually has", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({ deliveryAddress: "17 commercial st", deliveryCity: null, deliveryZip: null }),
    );
    await fireOrderNotifications("o1");
    expect(staffPayload().deliveryAddress).toBe("17 Commercial St");
  });

  it("sends null, not an empty string, for an order with no address", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({ type: "pickup", deliveryAddress: null, deliveryCity: null, deliveryZip: null }),
    );
    await fireOrderNotifications("o1");
    expect(staffPayload().deliveryAddress).toBeNull();
  });
});

// The email used to say auto-reject runs "within your configured timeout".
// There is no such setting: it's 4 minutes, or 15 from OPENING when the order
// landed while the shop was closed (Luigi 2026-08-12).
describe("fireOrderNotifications — quoted auto-reject window", () => {
  it("quotes the real 4-minute window on a normal order", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "pending", preparationTime: null }));
    await fireOrderNotifications("o1");
    expect(staffPayload().autoRejectMinutes).toBe(4);
    expect(staffPayload().placedWhileClosed).toBe(false);
  });

  it("quotes the longer window for an order placed while closed", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({ status: "pending", preparationTime: null, placedWhileClosed: true }),
    );
    await fireOrderNotifications("o1");
    expect(staffPayload().autoRejectMinutes).toBe(15);
    expect(staffPayload().placedWhileClosed).toBe(true);
  });
});

describe("fireOrderNotifications — quoted prep time", () => {
  it("quotes the ORDER's stored prep minutes, not the restaurant's flat default", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow());
    await fireOrderNotifications("o1");
    // 2:55 PM + 35 = the 3:30 PM delivery time the same email prints.
    expect(customerPayload().estimatedTime).toBe(35);
    expect(staffPayload().estimatedMinutes).toBe(35);
  });

  it("falls back to the service default when the order has no confirmed prep time", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow({ status: "pending", preparationTime: null }));
    await fireOrderNotifications("o1");
    expect(customerPayload().estimatedTime).toBe(45);
    expect(staffPayload().estimatedMinutes).toBe(45);
  });

  it("NEVER quotes a scheduled order's distance-to-slot as prep time", async () => {
    // An auto-accepted order booked 3 days out stores preparationTime = 4320
    // (orders/route.ts:2661-2668 — it is the kitchen countdown, not a cooking
    // estimate). Quoting that would read "Prep time: 4320 minutes".
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({
        preparationTime: 4320,
        scheduledFor: new Date("2026-08-14T22:00:00Z"),
        estimatedReady: new Date("2026-08-14T22:00:00Z"),
      }),
    );
    await fireOrderNotifications("o1");
    expect(customerPayload().estimatedTime).toBe(45);
    expect(staffPayload().estimatedMinutes).toBe(45);
    expect(customerPayload().estimatedTime).not.toBe(4320);
  });

  it("uses the PICKUP default for a pickup order with no prep time", async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderRow({ status: "pending", type: "pickup", preparationTime: null }),
    );
    await fireOrderNotifications("o1");
    expect(customerPayload().estimatedTime).toBe(20);
    expect(staffPayload().estimatedMinutes).toBe(20);
  });
});

describe("fireOrderNotifications — release claim", () => {
  it("never fans out twice for the same order (webhook retry)", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const r = await fireOrderNotifications("o1");
    expect(r.fired).toBe(false);
    expect(notifyCustomerMock).not.toHaveBeenCalled();
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });
});
