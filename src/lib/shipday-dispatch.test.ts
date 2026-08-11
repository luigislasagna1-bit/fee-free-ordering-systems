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

const { prismaMock, dispatchToShipdayMock, shouldDispatchMock, payAtDoorMock } = vi.hoisted(() => ({
  prismaMock: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    },
  },
  dispatchToShipdayMock: vi.fn(),
  shouldDispatchMock: vi.fn().mockResolvedValue(true),
  payAtDoorMock: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/shipday", () => ({
  dispatchOrderToShipday: dispatchToShipdayMock,
  shouldDispatchToShipday: shouldDispatchMock,
  shipdayPayAtDoorEnabled: payAtDoorMock,
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
  payAtDoorMock.mockResolvedValue(false);
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

/**
 * PAY AT THE DOOR (Luigi 2026-08-11). "stores should be able to do delivery
 * without accepting payment over the phone, same as pickup. these orders should
 * not be sent with shipday. they should still be populated in shipday — it's
 * the store's responsibility."
 *
 * The dangerous half is the DEFAULT: a store that never opted in must keep the
 * historic prepaid-only refusal, because a ShipDay driver genuinely cannot
 * collect money.
 */
describe("dispatchOrderNow pay-at-door", () => {
  const UNPAID = { ...FULL_ORDER, paymentMethod: "cash", paymentStatus: "pending" };

  it("still REFUSES an unpaid delivery when the store has not opted in", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...UNPAID });
    payAtDoorMock.mockResolvedValue(false);
    const r = await dispatchOrderNow("o1");
    expect(r).toEqual({ ok: false, skipped: "not_prepaid" });
    expect(dispatchToShipdayMock).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled(); // no lease taken
  });

  it("RECORDS an unpaid delivery in ShipDay when the store opted in — no driver requested", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...UNPAID });
    payAtDoorMock.mockResolvedValue(true);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    dispatchToShipdayMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd-9" });

    const r = await dispatchOrderNow("o1");

    expect(r).toEqual({ ok: true, shipdayOrderId: "sd-9", recordOnly: true });
    expect(dispatchToShipdayMock).toHaveBeenCalled();
    // "record_only" is what tells every other surface a driver was NOT summoned.
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shipdayStatus: "record_only", shipdayOrderId: "sd-9" }),
      }),
    );
  });

  it("a PREPAID delivery is still a real dispatch even with pay-at-door on", async () => {
    payAtDoorMock.mockResolvedValue(true);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    dispatchToShipdayMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd-10" });

    const r = await dispatchOrderNow("o1");

    expect(r).toEqual({ ok: true, shipdayOrderId: "sd-10" });
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ shipdayStatus: "assigned" }) }),
    );
  });

  it("a fully store-credit-paid order is prepaid, not pay-at-door", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...FULL_ORDER, paymentMethod: "reward_credit", paymentStatus: "pending", creditApplied: 30.6,
    });
    payAtDoorMock.mockResolvedValue(false);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    dispatchToShipdayMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd-11" });

    const r = await dispatchOrderNow("o1");
    expect(r).toEqual({ ok: true, shipdayOrderId: "sd-11" });
  });
});
