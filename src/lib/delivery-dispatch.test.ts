import { describe, it, expect, vi, beforeEach } from "vitest";

// Stateful Prisma + provider mocks so we can exercise the real dispatch
// functions (not just the pure guard). vi.hoisted so the (hoisted) vi.mock
// factories can reference them.
const { prismaMock, dispatchOrderNowMock, shouldDispatchToShipdayMock, notifyStaffMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { findUnique: vi.fn() },
    feeFreeDeliveryConfig: { findUnique: vi.fn() },
    deliveryAssignment: { create: vi.fn() },
    restaurant: { findUnique: vi.fn() },
  },
  dispatchOrderNowMock: vi.fn(),
  shouldDispatchToShipdayMock: vi.fn(),
  notifyStaffMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/shipday-dispatch", () => ({ dispatchOrderNow: dispatchOrderNowMock }));
vi.mock("@/lib/shipday", () => ({ shouldDispatchToShipday: shouldDispatchToShipdayMock }));
vi.mock("@/lib/notifications", () => ({ notifyStaff: notifyStaffMock }));

import { assertDispatchable, resolveDeliveryProvider, assignToFeeFreeDriver, dispatchDeliveryNow, dispatchAcceptedOrderSafe, displayDeliveryProvider, isShipdayDispatchRejection, type DispatchableOrder, type DeliveryDispatchResult } from "./delivery-dispatch";

const base = (over: Partial<DispatchableOrder> = {}): DispatchableOrder => ({
  type: "delivery",
  status: "accepted",
  deliveryAddress: "12 Main St",
  deliveryCity: "Milton",
  deliveryZip: "L9T",
  paymentStatus: "paid",
  total: 25,
  creditApplied: 0,
  restaurant: { address: "1 Shop Rd", city: "Milton", state: "ON", zip: "L9T", country: "CA" },
  ...over,
});

// Milton, ON — inside the FeeFree service area (the anchor). Default so feefree
// resolves; individual tests override for the out-of-area case.
const IN_AREA = { lat: 43.5183, lng: -79.8774 };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.restaurant.findUnique.mockResolvedValue(IN_AREA);
  notifyStaffMock.mockResolvedValue(undefined);
});

describe("assertDispatchable (shared ShipDay + FeeFree guards)", () => {
  it("accepts a prepaid, addressed, live delivery and returns composed addresses", () => {
    const g = assertDispatchable(base());
    expect(g.ok).toBe(true);
    if (g.ok) {
      // Province AND country are part of the composed address — without them
      // Uber Direct geocoded the drop into the wrong country and rejected every
      // order as out of area (2026-08-13).
      expect(g.customerAddress).toBe("12 Main St, Milton, ON, L9T, Canada");
      expect(g.restaurantAddress).toBe("1 Shop Rd, Milton, ON, L9T, Canada");
    }
  });
  it("rejects non-delivery orders", () => {
    expect(assertDispatchable(base({ type: "pickup" }))).toEqual({ ok: false, skipped: "not_delivery" });
  });
  it("rejects dead/undecided orders (pending / completed / cancelled)", () => {
    for (const status of ["pending", "completed", "cancelled", "rejected"]) {
      expect(assertDispatchable(base({ status }))).toEqual({ ok: false, skipped: "order_dead" });
    }
    for (const status of ["accepted", "preparing", "ready"]) {
      expect(assertDispatchable(base({ status })).ok).toBe(true);
    }
  });
  it("rejects when either address is missing", () => {
    expect(assertDispatchable(base({ deliveryAddress: null, deliveryCity: null, deliveryZip: null }))).toEqual({ ok: false, skipped: "missing_address" });
    // Province + country are inherited from the store, so a streetless drop
    // still composes to "ON, Canada" — the guard must look at the STREET.
    expect(assertDispatchable(base({ deliveryAddress: null }))).toEqual({ ok: false, skipped: "missing_address" });
    expect(assertDispatchable(base({ restaurant: { address: null, city: null, state: null, zip: null, country: null } }))).toEqual({ ok: false, skipped: "missing_address" });
  });
  it("rejects unpaid orders (prepaid-only — drivers never collect cash)", () => {
    expect(assertDispatchable(base({ paymentStatus: "pending", total: 25, creditApplied: 0 }))).toEqual({ ok: false, skipped: "not_prepaid" });
  });
  it("accepts an unpaid order fully covered by store credit", () => {
    expect(assertDispatchable(base({ paymentStatus: "pending", total: 20, creditApplied: 20 })).ok).toBe(true);
  });
});

describe("displayDeliveryProvider (chooser display, incl. legacy 'both')", () => {
  it("feefree enabled wins regardless of source", () => {
    expect(displayDeliveryProvider(true, "shipday", "shipday")).toBe("feefree");
    expect(displayDeliveryProvider(true, "own", "own")).toBe("feefree");
  });
  it("source=shipday displays shipday", () => {
    expect(displayDeliveryProvider(false, "shipday", "own")).toBe("shipday");
  });
  it("legacy both follows the kitchen mid-shift toggle", () => {
    // both+own: nothing dispatches to ShipDay → must display OWN (the
    // pre-fix chooser showed ShipDay-active here — display/behavior mismatch).
    expect(displayDeliveryProvider(false, "both", "own")).toBe("own");
    expect(displayDeliveryProvider(false, "both", "shipday")).toBe("shipday");
  });
  it("source=own displays own", () => {
    expect(displayDeliveryProvider(false, "own", "own")).toBe("own");
  });
});

describe("resolveDeliveryProvider (feefree > shipday > own)", () => {
  it("returns feefree when its config is enabled", async () => {
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: true });
    expect(await resolveDeliveryProvider("r1")).toBe("feefree");
    expect(shouldDispatchToShipdayMock).not.toHaveBeenCalled(); // feefree short-circuits
  });
  it("falls back to shipday when feefree is off but shipday is configured", async () => {
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: false });
    shouldDispatchToShipdayMock.mockResolvedValue(true);
    expect(await resolveDeliveryProvider("r1")).toBe("shipday");
  });
  it("returns own when neither is configured", async () => {
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue(null);
    shouldDispatchToShipdayMock.mockResolvedValue(false);
    expect(await resolveDeliveryProvider("r1")).toBe("own");
  });
  it("does NOT return feefree when the restaurant is OUTSIDE the service area (falls through)", async () => {
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.restaurant.findUnique.mockResolvedValue({ lat: 45.5019, lng: -73.5674 }); // Montreal, ~500km
    shouldDispatchToShipdayMock.mockResolvedValue(false);
    expect(await resolveDeliveryProvider("r1")).toBe("own");
  });
});

describe("assignToFeeFreeDriver", () => {
  it("creates a queued assignment for a valid prepaid delivery (autoSend on)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ autoSend: true }); // auto-dispatch enabled
    prismaMock.deliveryAssignment.create.mockResolvedValue({ id: "a1" });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: true, provider: "feefree", assignmentId: "a1" });
    expect(prismaMock.deliveryAssignment.create).toHaveBeenCalledWith({ data: { orderId: "o1", restaurantId: "r1", status: "queued" } });
  });
  it("is idempotent — returns the existing assignment, never double-queues", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: { id: "existing" } });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: true, provider: "feefree", assignmentId: "existing" });
    expect(prismaMock.deliveryAssignment.create).not.toHaveBeenCalled();
  });
  it("refuses an unpaid order (skipped=not_prepaid), no assignment created", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base({ paymentStatus: "pending", total: 25, creditApplied: 0 }), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: false, provider: "feefree", skipped: "not_prepaid" });
    expect(prismaMock.deliveryAssignment.create).not.toHaveBeenCalled();
  });
  it("holds for manual dispatch when autoSend is off (no assignment created)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ autoSend: false });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: false, provider: "feefree", skipped: "manual_hold" });
  });

  it("holds by default — manual unless autoSend is explicitly ON (Luigi 2026-07-14)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    // config exists but autoSend not turned on → must NOT auto-fly to a driver
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: true });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: false, provider: "feefree", skipped: "manual_hold" });
    expect(prismaMock.deliveryAssignment.create).not.toHaveBeenCalled();
  });
  it("force=true queues even when autoSend is off (manual Send to driver)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ autoSend: false });
    prismaMock.deliveryAssignment.create.mockResolvedValue({ id: "a1" });
    const r = await assignToFeeFreeDriver("o1", { force: true });
    expect(r).toEqual({ ok: true, provider: "feefree", assignmentId: "a1" });
    expect(prismaMock.feeFreeDeliveryConfig.findUnique).not.toHaveBeenCalled(); // force skips the autoSend read
  });
  it("auto-queues when autoSend is on (default)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ autoSend: true });
    prismaMock.deliveryAssignment.create.mockResolvedValue({ id: "a1" });
    const r = await assignToFeeFreeDriver("o1");
    expect(r).toEqual({ ok: true, provider: "feefree", assignmentId: "a1" });
  });
});

describe("dispatchDeliveryNow (provider branch)", () => {
  it("feefree restaurant → queues an assignment", async () => {
    prismaMock.order.findUnique
      .mockResolvedValueOnce({ id: "o1", restaurantId: "r1", type: "delivery" }) // dispatchDeliveryNow's lookup
      .mockResolvedValueOnce({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null }); // assignToFeeFreeDriver's lookup
    // enabled → resolveDeliveryProvider picks feefree; autoSend → auto-queue (vs manual hold)
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: true, autoSend: true });
    prismaMock.deliveryAssignment.create.mockResolvedValue({ id: "a1" });
    const r = await dispatchDeliveryNow("o1");
    expect(r).toEqual({ ok: true, provider: "feefree", assignmentId: "a1" });
    expect(dispatchOrderNowMock).not.toHaveBeenCalled();
  });
  it("shipday restaurant → delegates to the existing dispatchOrderNow path", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: "o1", restaurantId: "r1", type: "delivery" });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: false });
    shouldDispatchToShipdayMock.mockResolvedValue(true);
    dispatchOrderNowMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd_9" });
    const r = await dispatchDeliveryNow("o1");
    expect(r).toEqual({ ok: true, provider: "shipday", shipdayOrderId: "sd_9" });
    expect(prismaMock.deliveryAssignment.create).not.toHaveBeenCalled();
  });
  it("own restaurant → no-op (nothing dispatched)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: "o1", restaurantId: "r1", type: "delivery" });
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue(null);
    shouldDispatchToShipdayMock.mockResolvedValue(false);
    const r = await dispatchDeliveryNow("o1");
    expect(r).toEqual({ ok: false, provider: "own", skipped: "provider_own" });
    expect(dispatchOrderNowMock).not.toHaveBeenCalled();
    expect(prismaMock.deliveryAssignment.create).not.toHaveBeenCalled();
  });
  it("non-delivery order → skipped, no provider work", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: "o1", restaurantId: "r1", type: "pickup" });
    const r = await dispatchDeliveryNow("o1");
    expect(r).toEqual({ ok: false, provider: "own", skipped: "not_delivery" });
    expect(prismaMock.feeFreeDeliveryConfig.findUnique).not.toHaveBeenCalled();
  });
});

describe("dispatchAcceptedOrderSafe (shared trigger wrapper — kitchen Accept + all auto-accept paths)", () => {
  // Route every scenario through the real dispatchDeliveryNow to the ShipDay
  // branch: feefree off, shipday on.
  const shipdayRestaurant = () => {
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: false });
    shouldDispatchToShipdayMock.mockResolvedValue(true);
  };

  it("pages staff on a genuine ShipDay rejection (auto-accepted orders have no kitchen Accept to surface it)", async () => {
    shipdayRestaurant();
    prismaMock.order.findUnique
      .mockResolvedValueOnce({ id: "o1", restaurantId: "r1", type: "delivery" }) // dispatchDeliveryNow's lookup
      .mockResolvedValueOnce({ restaurantId: "r1", orderNumber: "ORD-1", customerName: "Ada" }); // notify lookup
    dispatchOrderNowMock.mockResolvedValue({ ok: false, error: "ShipDay rejected the order: bad address" });
    await dispatchAcceptedOrderSafe("o1");
    expect(notifyStaffMock).toHaveBeenCalledTimes(1);
    expect(notifyStaffMock.mock.calls[0][0]).toMatchObject({
      restaurantId: "r1",
      payload: { event: "dispatchRejected", orderNumber: "ORD-1", customerName: "Ada", reason: "ShipDay rejected the order: bad address" },
    });
  });

  it("stays silent on a pre-flight guard skip (not prepaid yet, already dispatched, config off…)", async () => {
    shipdayRestaurant();
    prismaMock.order.findUnique.mockResolvedValue({ id: "o1", restaurantId: "r1", type: "delivery" });
    dispatchOrderNowMock.mockResolvedValue({ ok: false, skipped: "not_prepaid" });
    await dispatchAcceptedOrderSafe("o1");
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });

  it("stays silent on success", async () => {
    shipdayRestaurant();
    prismaMock.order.findUnique.mockResolvedValue({ id: "o1", restaurantId: "r1", type: "delivery" });
    dispatchOrderNowMock.mockResolvedValue({ ok: true, shipdayOrderId: "sd_9" });
    await dispatchAcceptedOrderSafe("o1");
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });

  it("never throws — callers are payment webhooks that must not fail on courier errors", async () => {
    prismaMock.order.findUnique.mockRejectedValue(new Error("db down"));
    await expect(dispatchAcceptedOrderSafe("o1")).resolves.toBeUndefined();
  });

  it("never throws even when the staff notification itself fails", async () => {
    shipdayRestaurant();
    prismaMock.order.findUnique
      .mockResolvedValueOnce({ id: "o1", restaurantId: "r1", type: "delivery" })
      .mockResolvedValueOnce({ restaurantId: "r1", orderNumber: "ORD-1", customerName: "Ada" });
    dispatchOrderNowMock.mockResolvedValue({ ok: false, error: "rejected" });
    notifyStaffMock.mockRejectedValue(new Error("smtp down"));
    await expect(dispatchAcceptedOrderSafe("o1")).resolves.toBeUndefined();
  });
});

describe("isShipdayDispatchRejection (the dispatchRejected staff-email trigger condition)", () => {
  it("is true for a genuine ShipDay rejection (not ok, not skipped, shipday)", () => {
    const r: DeliveryDispatchResult = { ok: false, provider: "shipday", error: "ShipDay rejected the order: bad address" };
    expect(isShipdayDispatchRejection(r)).toBe(true);
  });
  it("is false on a successful dispatch", () => {
    const r: DeliveryDispatchResult = { ok: true, provider: "shipday", shipdayOrderId: "sd_1" };
    expect(isShipdayDispatchRejection(r)).toBe(false);
  });
  it("is false for a pre-flight guard skip (not a ShipDay rejection — nothing was even sent)", () => {
    const r: DeliveryDispatchResult = { ok: false, provider: "shipday", skipped: "config_off" };
    expect(isShipdayDispatchRejection(r)).toBe(false);
  });
  it("is false for FeeFree/own rejections — only ShipDay has the manual rescue button today", () => {
    expect(isShipdayDispatchRejection({ ok: false, provider: "feefree", error: "queue failed" })).toBe(false);
    expect(isShipdayDispatchRejection({ ok: false, provider: "own", skipped: "provider_own" })).toBe(false);
  });
});
