/**
 * Dispatch-watchdog wiring tests (Luigi 2026-08-10 "never again"): the cron
 * must (a) only sweep orders that could legitimately need a courier, (b) push
 * each through the ONE shared dispatchAcceptedOrderSafe wrapper, (c) count a
 * RESCUE only when the re-read proves a dispatch actually landed, and
 * (d) fail closed on auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, dispatchMock, getSessionUserMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { findMany: vi.fn(), findUnique: vi.fn() },
  },
  dispatchMock: vi.fn().mockResolvedValue(undefined),
  getSessionUserMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/delivery-dispatch", () => ({ dispatchAcceptedOrderSafe: dispatchMock }));
vi.mock("@/lib/session", () => ({ getSessionUser: getSessionUserMock }));

import { POST } from "./route";

function makeReq(auth?: string) {
  return new NextRequest("http://localhost/api/cron/dispatch-watchdog", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-secret");
  prismaMock.order.findMany.mockResolvedValue([]);
  getSessionUserMock.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth", () => {
  it("rejects callers without the cron secret or a superadmin session (fail closed)", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });
  it("accepts the cron secret", async () => {
    const res = await POST(makeReq("Bearer cron-secret"));
    expect(res.status).toBe(200);
  });
});

describe("sweep", () => {
  it("queries only live, PAID, never-dispatched delivery orders at dispatching restaurants, outside the grace window", async () => {
    await POST(makeReq("Bearer cron-secret"));
    const where = prismaMock.order.findMany.mock.calls[0][0].where;
    expect(where.type).toBe("delivery");
    expect(where.status).toEqual({ in: ["accepted", "preparing", "ready"] });
    expect(where.paymentStatus).toBe("paid");
    expect(where.shipdayOrderId).toBeNull();
    expect(where.deliveryAssignment).toEqual({ is: null });
    expect(where.restaurant.OR).toEqual([
      { shipdayConfig: { is: { enabled: true } } },
      { feefreeDeliveryConfig: { is: { enabled: true } } },
    ]);
    // grace: newest candidate must be at least ~10 min old
    const { gte, lte } = where.createdAt;
    expect(Date.now() - lte.getTime()).toBeGreaterThanOrEqual(10 * 60_000 - 5_000);
    expect(Date.now() - gte.getTime()).toBeLessThanOrEqual(48 * 3600_000 + 5_000);
  });

  it("pushes each candidate through dispatchAcceptedOrderSafe and counts a rescue only when the re-read shows a dispatch landed", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: "o1", orderNumber: "ORD-1" },
      { id: "o2", orderNumber: "ORD-2" },
    ]);
    prismaMock.order.findUnique
      .mockResolvedValueOnce({ shipdayOrderId: "sd_1", deliveryAssignment: null }) // o1 rescued
      .mockResolvedValueOnce({ shipdayOrderId: null, deliveryAssignment: null }); // o2 guard-skipped
    const res = await POST(makeReq("Bearer cron-secret"));
    expect(dispatchMock).toHaveBeenNthCalledWith(1, "o1");
    expect(dispatchMock).toHaveBeenNthCalledWith(2, "o2");
    expect(await res.json()).toEqual({ candidates: 2, rescued: 1, skipped: 1 });
  });

  it("a FeeFree queue counts as dispatched too (assignment, no shipdayOrderId)", async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: "o3", orderNumber: "ORD-3" }]);
    prismaMock.order.findUnique.mockResolvedValue({ shipdayOrderId: null, deliveryAssignment: { id: "a1" } });
    const res = await POST(makeReq("Bearer cron-secret"));
    expect(await res.json()).toEqual({ candidates: 1, rescued: 1, skipped: 0 });
  });
});
