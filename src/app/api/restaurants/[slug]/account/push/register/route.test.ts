/**
 * Customer push-token registration contract (Luigi 2026-08-02). Locks the
 * three invariants the plan mandates:
 *  1. TENANT ISOLATION — a session for restaurant A can never register a
 *     token under restaurant B (401 via expectedRestaurantId).
 *  2. ENTITLEMENT — push is part of the branded_mobile_app add-on (403).
 *  3. MULTI-DEVICE — registering device 2 must NOT delete device 1 (the
 *     kitchen single-active-device rule is a staff policy; copying it here
 *     would silently unsubscribe a customer's other phone/tablet).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  customerPushToken: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  customerPushPref: { upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const sessionMock = vi.hoisted(() => ({ getCurrentRestaurantCustomer: vi.fn() }));
vi.mock("@/lib/restaurant-customer-session", () => sessionMock);

const entMock = vi.hoisted(() => ({ hasFeature: vi.fn() }));
vi.mock("@/lib/entitlements", () => entMock);

import { POST, DELETE } from "./route";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/restaurants/luigis/account/push/register", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.restaurant.findUnique.mockResolvedValue({ id: "rest_1" });
  sessionMock.getCurrentRestaurantCustomer.mockResolvedValue({ id: "cust_1", restaurantId: "rest_1" });
  entMock.hasFeature.mockResolvedValue(true);
  prismaMock.customerPushToken.upsert.mockResolvedValue({});
  prismaMock.customerPushPref.upsert.mockResolvedValue({});
  // Default: this is a NEW token (not already registered) and the customer
  // is nowhere near the per-customer device cap — matches every existing
  // test's intent unless a test overrides it.
  prismaMock.customerPushToken.findUnique.mockResolvedValue(null);
  prismaMock.customerPushToken.count.mockResolvedValue(0);
  prismaMock.customerPushToken.findMany.mockResolvedValue([]);
});

describe("POST push/register", () => {
  it("404 on unknown restaurant", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(null);
    expect((await POST(req({ token: "t1" }), params("nope"))).status).toBe(404);
  });

  it("TENANT ISOLATION: 401 when the session doesn't belong to this restaurant", async () => {
    // getCurrentRestaurantCustomer returns null on slug/session mismatch —
    // assert we pass expectedRestaurantId and refuse on null.
    sessionMock.getCurrentRestaurantCustomer.mockResolvedValue(null);
    const res = await POST(req({ token: "t1" }), params("luigis"));
    expect(res.status).toBe(401);
    expect(sessionMock.getCurrentRestaurantCustomer).toHaveBeenCalledWith({ expectedRestaurantId: "rest_1" });
    expect(prismaMock.customerPushToken.upsert).not.toHaveBeenCalled();
  });

  it("ENTITLEMENT: 403 without the branded_mobile_app feature", async () => {
    entMock.hasFeature.mockResolvedValue(false);
    const res = await POST(req({ token: "t1" }), params("luigis"));
    expect(res.status).toBe(403);
    expect(entMock.hasFeature).toHaveBeenCalledWith("rest_1", "app_store_listing");
    expect(prismaMock.customerPushToken.upsert).not.toHaveBeenCalled();
  });

  it("registers via UPSERT-BY-TOKEN and never mass-deletes sibling devices", async () => {
    const res = await POST(req({ token: "device-2-token", platform: "ios" }), params("luigis"));
    expect(res.status).toBe(200);
    expect(prismaMock.customerPushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "device-2-token" },
        create: expect.objectContaining({ token: "device-2-token", customerId: "cust_1", restaurantId: "rest_1", platform: "ios" }),
      }),
    );
    // THE multi-device invariant: no deleteMany during registration.
    expect(prismaMock.customerPushToken.deleteMany).not.toHaveBeenCalled();
  });

  it("re-registering an EXISTING token never triggers device-cap eviction", async () => {
    prismaMock.customerPushToken.findUnique.mockResolvedValue({ id: "row_1" });
    await POST(req({ token: "already-known-token" }), params("luigis"));
    expect(prismaMock.customerPushToken.count).not.toHaveBeenCalled();
    expect(prismaMock.customerPushToken.findMany).not.toHaveBeenCalled();
  });

  it("DEVICE CAP: a new token past the 10-device limit evicts the least-recently-seen device(s)", async () => {
    prismaMock.customerPushToken.findUnique.mockResolvedValue(null); // this token is new
    prismaMock.customerPushToken.count.mockResolvedValue(10); // customer already at the cap
    prismaMock.customerPushToken.findMany.mockResolvedValue([{ id: "oldest_row" }]);
    const res = await POST(req({ token: "device-11-token" }), params("luigis"));
    expect(res.status).toBe(200);
    expect(prismaMock.customerPushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "cust_1" },
        orderBy: { lastSeenAt: "asc" },
        take: 1,
      }),
    );
    expect(prismaMock.customerPushToken.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["oldest_row"] } } });
    // The eviction deleteMany is scoped to specific row ids — never a bare
    // {customerId} delete, which would be the mass-unsubscribe bug this
    // whole test file exists to prevent.
    expect(prismaMock.customerPushToken.upsert).toHaveBeenCalled();
  });

  it("400 on a missing or oversized token; junk platform coerces to android", async () => {
    expect((await POST(req({}), params("luigis"))).status).toBe(400);
    expect((await POST(req({ token: "x".repeat(5000) }), params("luigis"))).status).toBe(400);
    await POST(req({ token: "ok", platform: "toaster" }), params("luigis"));
    expect(prismaMock.customerPushToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ platform: "android" }) }),
    );
  });
});

describe("DELETE push/register", () => {
  it("object-level authorization: deletes ONLY the caller's own token", async () => {
    prismaMock.customerPushToken.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req({ token: "t1" }), params("luigis"));
    expect(res.status).toBe(200);
    expect(prismaMock.customerPushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: "t1", customerId: "cust_1" },
    });
  });

  it("401 when signed out", async () => {
    sessionMock.getCurrentRestaurantCustomer.mockResolvedValue(null);
    expect((await DELETE(req({ token: "t1" }), params("luigis"))).status).toBe(401);
  });
});
