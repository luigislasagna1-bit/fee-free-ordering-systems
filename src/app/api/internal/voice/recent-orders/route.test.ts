/**
 * A5 — GET /api/internal/voice/recent-orders: the one grounded source for an
 * existing order's status, across every channel, with privacy tiers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    restaurant: { findFirst: vi.fn() },
    customer: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { GET } from "./route";

const KEY = "test-internal-key";
const NOW = Date.now();
const mins = (m: number) => new Date(NOW - m * 60_000);

function req(params: Record<string, string>, key: string | null = KEY) {
  const u = new URL("http://localhost/api/internal/voice/recent-orders");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new NextRequest(u, { headers: key ? { "x-internal-key": key } : {} });
}

const order = (over: Record<string, unknown>) => ({
  id: "o1",
  orderNumber: "ORD-250822-4821",
  status: "accepted",
  type: "pickup",
  channel: "web",
  customerId: "c1",
  customerPhone: "+1 (647) 555-0100",
  customerName: "Ada Lovelace",
  total: 31.5,
  createdAt: mins(12),
  acceptedAt: mins(10),
  completedAt: null,
  estimatedReady: new Date(NOW + 9 * 60_000),
  scheduledFor: null,
  scheduledSlotMinutes: null,
  shipdayStatus: null,
  dispatchedAt: null,
  items: [{ quantity: 1, name: "Large 2 Topping", variantName: null }, { quantity: 1, name: "Garlic Bread", variantName: null }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_SECRET = KEY;
  prismaMock.restaurant.findFirst.mockResolvedValue({ id: "r1", timezone: "America/Toronto" });
  prismaMock.customer.findMany.mockResolvedValue([{ id: "c1" }]);
});

describe("recent-orders", () => {
  it("requires the internal key and a lookup key", async () => {
    expect((await GET(req({ slug: "luigis", phone: "+16475550100" }, null))).status).toBe(403);
    expect((await GET(req({ slug: "luigis" }))).status).toBe(400);
  });

  it("tier 1 — the caller's number finds their web order: status, stage, ETA, items — but NO total and NO address", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({}), order({ id: "o2", customerId: "cX", customerPhone: "+14165550199", orderNumber: "ORD-9999" })]);
    const res = await GET(req({ slug: "luigis", phone: "647-555-0100" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.found).toBe(1);
    const o = j.orders[0];
    expect(o).toMatchObject({ id: "o1", orderRef: "4821", source: "web", type: "pickup", stage: "accepted", itemCount: 2, matchedBy: "phone", thirdParty: false });
    expect(o.readyInMinutes).toBeGreaterThanOrEqual(8);
    expect(o.readyInMinutes).toBeLessThanOrEqual(9);
    expect(o).not.toHaveProperty("total");
    expect(o).not.toHaveProperty("customerName");
    expect(JSON.stringify(o)).not.toMatch(/address/i);
    // The scan is restaurant-scoped and bounded to the last 48 h.
    const where = prismaMock.order.findMany.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.createdAt.gte.getTime()).toBeGreaterThan(NOW - 49 * 3600_000);
  });

  it("matches a guest web checkout by the order's own phone when no Customer row exists", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);
    prismaMock.order.findMany.mockResolvedValue([order({ customerId: null, customerPhone: "6475550100" })]);
    const j = await (await GET(req({ slug: "luigis", phone: "+1 647 555 0100" }))).json();
    expect(j.found).toBe(1);
    expect(j.orders[0].matchedBy).toBe("phone");
  });

  it("tier 2 — an order number cross-checked by the phone returns the full view (total); number alone stays limited", async () => {
    prismaMock.order.findMany.mockResolvedValue([order({})]);
    const full = await (await GET(req({ slug: "luigis", phone: "6475550100", orderNumber: "4821" }))).json();
    expect(full.found).toBe(1);
    expect(full.orders[0]).toMatchObject({ matchedBy: "number+phone", total: 31.5, customerName: "Ada Lovelace" });
    prismaMock.customer.findMany.mockResolvedValue([]);
    const limited = await (await GET(req({ slug: "luigis", phone: "4165550199", orderNumber: "2508224821" }))).json();
    expect(limited.found).toBe(1);
    expect(limited.orders[0].matchedBy).toBe("number");
    expect(limited.orders[0]).not.toHaveProperty("total");
  });

  it("stages: delivery picked up by the driver → out_for_delivery; completed; cancelled; scheduled; DoorDash flagged third-party", async () => {
    prismaMock.order.findMany.mockResolvedValue([
      order({ id: "d1", type: "delivery", status: "ready", shipdayStatus: "picked_up", dispatchedAt: mins(5) }),
      order({ id: "d2", status: "completed", completedAt: mins(1) }),
      order({ id: "d3", status: "cancelled" }),
      order({ id: "d4", status: "pending", scheduledFor: new Date(NOW + 3 * 3600_000), scheduledSlotMinutes: 15 }),
      order({ id: "d5", channel: "doordash" }),
    ]);
    const j = await (await GET(req({ slug: "luigis", phone: "6475550100" }))).json();
    const by = Object.fromEntries(j.orders.map((o: { id: string }) => [o.id, o]));
    expect(by.d1.stage).toBe("out_for_delivery");
    expect(by.d1.dispatch).toMatchObject({ status: "picked_up" });
    expect(by.d2.stage).toBe("completed");
    expect(by.d3.stage).toBe("cancelled");
    expect(by.d4.stage).toBe("scheduled");
    expect(by.d5.thirdParty).toBe(true);
    expect(j.orders.length).toBe(5);
  });

  it("nothing for this number → found 0 (the agent asks for the order number once, then offers a person)", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);
    prismaMock.order.findMany.mockResolvedValue([order({ customerId: "other", customerPhone: "+14165550199" })]);
    const j = await (await GET(req({ slug: "luigis", phone: "6475550100" }))).json();
    expect(j).toMatchObject({ found: 0, orders: [] });
  });
});
