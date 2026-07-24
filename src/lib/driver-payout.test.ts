import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    deliveryAssignment: { groupBy: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    driverShift: { findMany: vi.fn() },
    driver: { findMany: vi.fn() },
    driverPayout: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { buildDriverPayoutsForWeek, reconcileTipRefund } from "./driver-payout";

// Saturday 2026-07-11 00:00 America/Toronto (EDT) = 04:00Z — a real Sat→Fri week start.
const WEEK = new Date("2026-07-11T04:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.driverPayout.create.mockResolvedValue({ id: "p1" });
  prismaMock.driverPayout.update.mockResolvedValue({});
  prismaMock.deliveryAssignment.update.mockResolvedValue({});
});

describe("buildDriverPayoutsForWeek", () => {
  it("rolls hours × rate + frozen tips into a pending payout row", async () => {
    prismaMock.deliveryAssignment.groupBy.mockResolvedValue([
      { driverId: "d1", tipCurrency: "cad", _count: { _all: 2 }, _sum: { driverTipCents: 600 } },
    ]);
    // One 4-hour shift fully inside the week (Mon noon→4pm Toronto).
    prismaMock.driverShift.findMany.mockResolvedValue([
      { driverId: "d1", clockInAt: new Date("2026-07-13T16:00:00.000Z"), clockOutAt: new Date("2026-07-13T20:00:00.000Z") },
    ]);
    prismaMock.driver.findMany.mockResolvedValue([{ id: "d1", name: "Dana", hourlyRateCents: 2000 }]);
    prismaMock.driverPayout.findUnique.mockResolvedValue(null);

    const rows = await buildDriverPayoutsForWeek({ weekStart: WEEK });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      driverId: "d1", deliveries: 2, workedSeconds: 14400, hourlyRateCents: 2000,
      hourlyPayCents: 8000, tipsCents: 600, adjustmentCents: 0, totalCents: 8600,
      currency: "cad", status: "pending",
    });
    expect(prismaMock.driverPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ driverId: "d1", tipsCents: 600, hourlyPayCents: 8000, totalCents: 8600, status: "pending" }) }),
    );
  });

  it("never overwrites a PAID row (immutable) — skips it", async () => {
    prismaMock.deliveryAssignment.groupBy.mockResolvedValue([
      { driverId: "d1", tipCurrency: "cad", _count: { _all: 1 }, _sum: { driverTipCents: 300 } },
    ]);
    prismaMock.driverShift.findMany.mockResolvedValue([]);
    prismaMock.driver.findMany.mockResolvedValue([{ id: "d1", name: "Dana", hourlyRateCents: 2000 }]);
    prismaMock.driverPayout.findUnique.mockResolvedValue({ id: "p1", status: "paid", adjustmentCents: 0 });

    const rows = await buildDriverPayoutsForWeek({ weekStart: WEEK });

    expect(rows[0].status).toBe("skipped-paid");
    expect(prismaMock.driverPayout.update).not.toHaveBeenCalled();
    expect(prismaMock.driverPayout.create).not.toHaveBeenCalled();
  });

  it("preserves a pending row's adjustmentCents (clawback carry-in) when rebuilding", async () => {
    prismaMock.deliveryAssignment.groupBy.mockResolvedValue([
      { driverId: "d1", tipCurrency: "cad", _count: { _all: 1 }, _sum: { driverTipCents: 500 } },
    ]);
    prismaMock.driverShift.findMany.mockResolvedValue([]);
    prismaMock.driver.findMany.mockResolvedValue([{ id: "d1", name: "Dana", hourlyRateCents: 0 }]);
    prismaMock.driverPayout.findUnique.mockResolvedValue({ id: "p1", status: "pending", adjustmentCents: -200 });

    const rows = await buildDriverPayoutsForWeek({ weekStart: WEEK });

    // total = 0 hourly + 500 tips + (−200) adjustment = 300; adjustment preserved.
    expect(rows[0]).toMatchObject({ adjustmentCents: -200, tipsCents: 500, totalCents: 300 });
    expect(prismaMock.driverPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ adjustmentCents: -200, totalCents: 300 }) }),
    );
  });

  it("flags a driver-week that spans more than one tip currency (N6)", async () => {
    prismaMock.deliveryAssignment.groupBy.mockResolvedValue([
      { driverId: "d1", tipCurrency: "cad", _count: { _all: 1 }, _sum: { driverTipCents: 300 } },
      { driverId: "d1", tipCurrency: "usd", _count: { _all: 1 }, _sum: { driverTipCents: 200 } },
    ]);
    prismaMock.driverShift.findMany.mockResolvedValue([]);
    prismaMock.driver.findMany.mockResolvedValue([{ id: "d1", name: "Dana", hourlyRateCents: 0 }]);
    prismaMock.driverPayout.findUnique.mockResolvedValue(null);

    const rows = await buildDriverPayoutsForWeek({ weekStart: WEEK });
    expect(rows[0].currencyConflict).toEqual(["cad", "usd"]);
  });
});

describe("reconcileTipRefund", () => {
  it("reduces the frozen tip proportionally to the cumulative refund", async () => {
    prismaMock.deliveryAssignment.findUnique.mockResolvedValue({ driverTipCents: 600 });
    prismaMock.driverPayout.findUnique.mockResolvedValue(null); // delivered-week payout not built

    await reconcileTipRefund({
      assignmentId: "a1", driverId: "d1", deliveredAt: new Date("2026-07-13T16:00:00.000Z"),
      originalTipCents: 600, chargedTotal: 20, refundedTotal: 10, now: new Date("2026-07-14T16:00:00.000Z"),
    });

    // 50% refunded → tip 600 → 300; frozen value updated to the absolute new amount.
    expect(prismaMock.deliveryAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" }, data: { driverTipCents: 300 } }),
    );
  });

  it("is idempotent — a repeated refund to the same total is a no-op", async () => {
    prismaMock.deliveryAssignment.findUnique.mockResolvedValue({ driverTipCents: 300 });
    await reconcileTipRefund({
      assignmentId: "a1", driverId: "d1", deliveredAt: new Date("2026-07-13T16:00:00.000Z"),
      originalTipCents: 600, chargedTotal: 20, refundedTotal: 10, now: new Date("2026-07-14T16:00:00.000Z"),
    });
    expect(prismaMock.deliveryAssignment.update).not.toHaveBeenCalled();
  });

  it("carries a negative adjustment to the current week when the delivered week is already PAID", async () => {
    prismaMock.deliveryAssignment.findUnique.mockResolvedValue({ driverTipCents: 600 });
    // 1st findUnique = delivered-week payout (paid); 2nd = carry-week payout (pending).
    prismaMock.driverPayout.findUnique
      .mockResolvedValueOnce({ status: "paid" })
      .mockResolvedValueOnce({ id: "cur", status: "pending", adjustmentCents: 0, hourlyPayCents: 0, tipsCents: 0 });

    await reconcileTipRefund({
      assignmentId: "a1", driverId: "d1", deliveredAt: new Date("2026-07-13T16:00:00.000Z"),
      originalTipCents: 600, chargedTotal: 20, refundedTotal: 20, now: new Date("2026-07-20T16:00:00.000Z"),
    });

    // Full refund → tip 0, delta −600 carried onto the current week's pending row.
    expect(prismaMock.driverPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cur" }, data: expect.objectContaining({ adjustmentCents: -600, totalCents: -600 }) }),
    );
  });
});
