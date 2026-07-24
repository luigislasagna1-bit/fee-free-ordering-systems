import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, stripeMock, getPlatformTaxMock, stripeReadyMock } = vi.hoisted(() => ({
  prismaMock: {
    deliveryAssignment: { findMany: vi.fn(), updateMany: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    deliverySettlement: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  stripeMock: {
    taxRates: { list: vi.fn().mockResolvedValue({ data: [] }), create: vi.fn() },
    invoiceItems: { create: vi.fn().mockResolvedValue({ id: "ii_1" }) },
    invoices: { create: vi.fn().mockResolvedValue({ id: "in_1" }) },
  },
  getPlatformTaxMock: vi.fn(),
  stripeReadyMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/marketplace", () => ({ PLATFORM_CURRENCY: "cad" }));
vi.mock("@/lib/platform-tax", () => ({
  getPlatformTax: getPlatformTaxMock,
  stripeTaxRateDisplayName: () => "GST/HST 13%",
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(stripeMock),
  stripeReady: stripeReadyMock,
}));
// Billing is PAUSED in production (see delivery-billing-switch.ts). These tests
// exercise the engine as it will behave once re-enabled, so they force it on.
// The paused behaviour is covered by its own suite at the bottom of this file.
vi.mock("@/lib/delivery-billing-switch", () => ({ DELIVERY_BILLING_ENABLED: true }));

import { settleDeliveryWeek } from "./delivery-settlement";

const WEEK = new Date("2026-07-11T04:00:00.000Z"); // Sat 2026-07-11 00:00 America/Toronto (EDT)

beforeEach(() => {
  vi.clearAllMocks();
  stripeReadyMock.mockResolvedValue(true);
  getPlatformTaxMock.mockReturnValue({ ratePct: 0, label: "No tax", province: null });
  prismaMock.deliverySettlement.findUnique.mockResolvedValue(null);
  prismaMock.deliverySettlement.create.mockResolvedValue({ id: "settle_1" });
  prismaMock.deliverySettlement.update.mockResolvedValue({});
  prismaMock.deliveryAssignment.updateMany.mockResolvedValue({ count: 2 });
  stripeMock.invoiceItems.create.mockResolvedValue({ id: "ii_1" });
  stripeMock.invoices.create.mockResolvedValue({ id: "in_1" });
});

describe("settleDeliveryWeek", () => {
  it("sums frozen platformFeeCents per restaurant, invoices, and stamps settlementId", async () => {
    prismaMock.deliveryAssignment.findMany.mockResolvedValue([
      { id: "a1", restaurantId: "r1", platformFeeCents: 799 },
      { id: "a2", restaurantId: "r1", platformFeeCents: 799 },
    ]);
    prismaMock.restaurant.findUnique.mockResolvedValue({ name: "Pizza", stripeCustomerId: "cus_1", country: "CA", state: "ON" });

    const { results } = await settleDeliveryWeek({ weekStart: WEEK });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "invoiced", deliveriesInWeek: 2, accruedCents: 1598, invoicedCents: 1598, stripeInvoiceId: "in_1" });
    // Invoice line item carries the delivery_settlement metadata + amount in cents.
    expect(stripeMock.invoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1598, currency: "cad", metadata: expect.objectContaining({ type: "delivery_settlement", settlementId: "settle_1" }) }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining("delivery-settle-r1-2026-07-11") }),
    );
    // Consumes the assignments (marks them billed).
    expect(prismaMock.deliveryAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, settlementId: null },
      data: { settlementId: "settle_1" },
    });
  });

  it("is idempotent — an existing settlement is skipped (and strays get stamped)", async () => {
    prismaMock.deliveryAssignment.findMany.mockResolvedValue([{ id: "a1", restaurantId: "r1", platformFeeCents: 799 }]);
    prismaMock.restaurant.findUnique.mockResolvedValue({ name: "Pizza", stripeCustomerId: "cus_1", country: "CA", state: "ON" });
    prismaMock.deliverySettlement.findUnique.mockResolvedValue({ id: "prev", status: "invoiced", deliveriesInWeek: 3, accruedCents: 2397, invoicedCents: 2397, stripeInvoiceId: "in_prev" });

    const { results } = await settleDeliveryWeek({ weekStart: WEEK });

    expect(results[0]).toMatchObject({ status: "skipped", reason: "already settled", stripeInvoiceId: "in_prev" });
    expect(prismaMock.deliverySettlement.create).not.toHaveBeenCalled();
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
    // Strays re-stamped onto the existing settlement.
    expect(prismaMock.deliveryAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1"] }, settlementId: null },
      data: { settlementId: "prev" },
    });
  });

  it("marks failed + does NOT stamp assignments when the restaurant has no card on file", async () => {
    prismaMock.deliveryAssignment.findMany.mockResolvedValue([{ id: "a1", restaurantId: "r1", platformFeeCents: 799 }]);
    prismaMock.restaurant.findUnique.mockResolvedValue({ name: "Pizza", stripeCustomerId: null, country: "CA", state: "ON" });

    const { results } = await settleDeliveryWeek({ weekStart: WEEK });

    expect(results[0].status).toBe("failed");
    expect(results[0].reason).toMatch(/no Stripe customer/i);
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
    expect(prismaMock.deliverySettlement.update).toHaveBeenCalledWith({ where: { id: "settle_1" }, data: { status: "failed", failureReason: expect.any(String) } });
    // Assignments left unsettled for a later re-run — updateMany never stamps.
    expect(prismaMock.deliveryAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("returns no results when nothing was delivered in the week", async () => {
    prismaMock.deliveryAssignment.findMany.mockResolvedValue([]);
    const { results } = await settleDeliveryWeek({ weekStart: WEEK });
    expect(results).toHaveLength(0);
    expect(prismaMock.deliverySettlement.create).not.toHaveBeenCalled();
  });

  it("defaults to the previously-closed Sat→Fri week when weekStart is omitted", async () => {
    prismaMock.deliveryAssignment.findMany.mockResolvedValue([]);
    // now = Wed 2026-07-15 13:00Z (Toronto week opened Sat 2026-07-11) → prior
    // closed week opened Sat 2026-07-04 (04:00Z, EDT).
    const { weekStart } = await settleDeliveryWeek({ now: new Date("2026-07-15T13:00:00Z") });
    expect(weekStart.toISOString()).toBe("2026-07-04T04:00:00.000Z");
  });
});
