import { describe, it, expect, vi, beforeEach } from "vitest";

// Stateful Prisma + provider mocks so we can exercise the real dispatch
// functions (not just the pure guard). vi.hoisted so the (hoisted) vi.mock
// factories can reference them.
const { prismaMock, dispatchOrderNowMock, shouldDispatchToShipdayMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { findUnique: vi.fn() },
    feeFreeDeliveryConfig: { findUnique: vi.fn() },
    deliveryAssignment: { create: vi.fn() },
    restaurant: { findUnique: vi.fn() },
  },
  dispatchOrderNowMock: vi.fn(),
  shouldDispatchToShipdayMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/shipday-dispatch", () => ({ dispatchOrderNow: dispatchOrderNowMock }));
vi.mock("@/lib/shipday", () => ({ shouldDispatchToShipday: shouldDispatchToShipdayMock }));

import { assertDispatchable, resolveDeliveryProvider, assignToFeeFreeDriver, dispatchDeliveryNow, type DispatchableOrder } from "./delivery-dispatch";

const base = (over: Partial<DispatchableOrder> = {}): DispatchableOrder => ({
  type: "delivery",
  status: "accepted",
  deliveryAddress: "12 Main St",
  deliveryCity: "Milton",
  deliveryZip: "L9T",
  paymentStatus: "paid",
  total: 25,
  creditApplied: 0,
  restaurant: { address: "1 Shop Rd", city: "Milton", state: "ON", zip: "L9T" },
  ...over,
});

// Milton, ON — inside the FeeFree service area (the anchor). Default so feefree
// resolves; individual tests override for the out-of-area case.
const IN_AREA = { lat: 43.5183, lng: -79.8774 };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.restaurant.findUnique.mockResolvedValue(IN_AREA);
});

describe("assertDispatchable (shared ShipDay + FeeFree guards)", () => {
  it("accepts a prepaid, addressed, live delivery and returns composed addresses", () => {
    const g = assertDispatchable(base());
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.customerAddress).toBe("12 Main St, Milton, L9T");
      expect(g.restaurantAddress).toBe("1 Shop Rd, Milton, ON, L9T");
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
    expect(assertDispatchable(base({ restaurant: { address: null, city: null, state: null, zip: null } }))).toEqual({ ok: false, skipped: "missing_address" });
  });
  it("rejects unpaid orders (prepaid-only — drivers never collect cash)", () => {
    expect(assertDispatchable(base({ paymentStatus: "pending", total: 25, creditApplied: 0 }))).toEqual({ ok: false, skipped: "not_prepaid" });
  });
  it("accepts an unpaid order fully covered by store credit", () => {
    expect(assertDispatchable(base({ paymentStatus: "pending", total: 20, creditApplied: 20 })).ok).toBe(true);
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
  it("creates a queued assignment for a valid prepaid delivery", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...base(), id: "o1", restaurantId: "r1", deliveryAssignment: null });
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
    prismaMock.feeFreeDeliveryConfig.findUnique.mockResolvedValue({ enabled: true });
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
