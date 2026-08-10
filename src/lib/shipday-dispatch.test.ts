/**
 * CLAIM-BEFORE-SEND tests for dispatchOrderNow (2026-08-10): with five
 * possible dispatch triggers (kitchen Accept, payment-verify, Stripe webhook,
 * creation, watchdog) and no unique constraint on the ShipDay side, the
 * atomic dispatchedAt lease is the only thing standing between a race and a
 * customer getting two drivers. These tests lock:
 *   - losing the claim => skipped "already_dispatched", ShipDay never called
 *   - winning + ShipDay ok => shipdayOrderId stored
 *   - winning + ShipDay rejects => lease released immediately (Retry works)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, dispatchToShipdayMock, shouldDispatchMock } = vi.hoisted(() => ({
  prismaMock: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    },
  },
  dispatchToShipdayMock: vi.fn(),
  shouldDispatchMock: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/shipday", () => ({
  dispatchOrderToShipday: dispatchToShipdayMock,
  shouldDispatchToShipday: shouldDispatchMock,
}));

import { dispatchOrderNow } from "./shipday-dispatch";

const FULL_ORDER = {
  restaurantId: "r1", type: "delivery", status: "accepted", shipdayOrderId: null,
  orderNumber: "ORD-1", customerName: "Ada", customerEmail: "a@x.com",
  customerPhone: "6475550000", deliveryAddress: "12 Main St", deliveryCity: "Milton",
  deliveryZip: "L9T", deliveryLat: 43.5, deliveryLng: -79.9,
  notes: null, subtotal: 20, taxAmount: 2.6,
  deliveryFee: 5, tip: 3, total: 30.6, creditApplied: 0,
  paymentMethod: "card", paymentStatus: "paid", preparationTime: 30,
  scheduledFor: null,
  items: [{ name: "Lasagna", quantity: 1, price: 20 }],
  restaurant: { name: "Luigi's", address: "1 Shop Rd", city: "Milton", state: "ON", zip: "L9T", phone: "9055551234", lat: 43.51, lng: -79.88 },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.findUnique.mockResolvedValue({ ...FULL_ORDER });
  prismaMock.order.update.mockResolvedValue({});
  shouldDispatchMock.mockResolvedValue(true);
});

describe("dispatchOrderNow claim-before-send", () => {
  it("losing the atomic claim => already_dispatched, ShipDay NEVER called (the two-drivers race)", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 }); // a concurrent trigger won
    const r = await dispatchOrderNow("o1");
    expect(r).toEqual({ ok: false, skipped: "already_dispatched" });
    expect(dispatchToShipdayMock).not.toHaveBeenCalled();
  });

  it("winning the claim + ShipDay accepts => shipdayOrderId stored", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    dispatchToShipdayMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd_1" });
    const r = await dispatchOrderNow("o1");
    expect(r).toEqual({ ok: true, shipdayOrderId: "sd_1" });
    const claimWhere = prismaMock.order.updateMany.mock.calls[0][0].where;
    expect(claimWhere.shipdayOrderId).toBeNull(); // claim is atomic on never-dispatched
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shipdayOrderId: "sd_1" }) }),
    );
  });

  it("winning the claim + ShipDay REJECTS => lease released so Retry/watchdog work immediately", async () => {
    prismaMock.order.updateMany
      .mockResolvedValueOnce({ count: 1 })  // the claim
      .mockResolvedValueOnce({ count: 1 }); // the lease release
    dispatchToShipdayMock.mockResolvedValue({ ok: false, error: "no delivery option" });
    const r = await dispatchOrderNow("o1");
    expect(r).toEqual({ ok: false, error: "no delivery option" });
    const release = prismaMock.order.updateMany.mock.calls[1][0];
    expect(release.where).toEqual({ id: "o1", shipdayOrderId: null });
    expect(release.data).toEqual({ dispatchedAt: null });
  });

  it("stale-lease reclaim is part of the claim filter (crashed attempt self-heals)", async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    dispatchToShipdayMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd_2" });
    await dispatchOrderNow("o1");
    const claimWhere = prismaMock.order.updateMany.mock.calls[0][0].where;
    expect(claimWhere.OR).toEqual([
      { dispatchedAt: null },
      { dispatchedAt: { lt: expect.any(Date) } },
    ]);
  });
});
