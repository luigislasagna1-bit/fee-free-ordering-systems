/**
 * The kill-switch half of the settlement suite. Lives in its own file because
 * vi.mock is module-scoped: delivery-settlement.test.ts forces the switch ON to
 * exercise the engine, this file leaves it OFF (the real production value) and
 * proves that nothing reaches Stripe or the database.
 *
 * If someone flips DELIVERY_BILLING_ENABLED to true without doing the Sat→Fri +
 * driver-tip work, this suite fails loudly — that is the point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, stripeMock, stripeReadyMock } = vi.hoisted(() => ({
  prismaMock: {
    deliveryAssignment: { findMany: vi.fn(), updateMany: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    deliverySettlement: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  stripeMock: {
    taxRates: { list: vi.fn(), create: vi.fn() },
    invoiceItems: { create: vi.fn() },
    invoices: { create: vi.fn() },
  },
  stripeReadyMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/marketplace", () => ({ PLATFORM_CURRENCY: "cad" }));
vi.mock("@/lib/platform-tax", () => ({
  getPlatformTax: () => ({ ratePct: 0, label: "No tax", province: null }),
  stripeTaxRateDisplayName: () => "GST/HST 13%",
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(stripeMock),
  stripeReady: stripeReadyMock,
}));

import { DELIVERY_BILLING_ENABLED } from "./delivery-billing-switch";
import { settleDeliveryWeek } from "./delivery-settlement";

const WEEK = new Date(Date.UTC(2026, 6, 6));

beforeEach(() => {
  vi.clearAllMocks();
  stripeReadyMock.mockResolvedValue(true);
  prismaMock.deliveryAssignment.findMany.mockResolvedValue([
    { id: "a1", restaurantId: "r1", platformFeeCents: 799 },
    { id: "a2", restaurantId: "r1", platformFeeCents: 799 },
  ]);
  prismaMock.restaurant.findUnique.mockResolvedValue({
    name: "Pizza",
    stripeCustomerId: "cus_1",
    country: "CA",
    state: "ON",
  });
});

describe("FeeFreeDelivery billing kill-switch", () => {
  it("is OFF in production — Luigi: do not automatically bill anyone yet", () => {
    expect(DELIVERY_BILLING_ENABLED).toBe(false);
  });

  it("charges nobody while paused, even with billable deliveries waiting", async () => {
    const { results, weekStart } = await settleDeliveryWeek({ weekStart: WEEK });

    expect(results).toEqual([]);
    expect(weekStart).toEqual(WEEK);
    // The money path: not a single Stripe call.
    expect(stripeMock.invoices.create).not.toHaveBeenCalled();
    expect(stripeMock.invoiceItems.create).not.toHaveBeenCalled();
  });

  it("leaves delivered assignments unsettled so nothing is lost while paused", async () => {
    await settleDeliveryWeek({ weekStart: WEEK });

    // No settlement row, and crucially no settlementId stamped — the assignments
    // stay billable so the real Sat→Fri run can pick them up later.
    expect(prismaMock.deliverySettlement.create).not.toHaveBeenCalled();
    expect(prismaMock.deliveryAssignment.updateMany).not.toHaveBeenCalled();
  });
});
