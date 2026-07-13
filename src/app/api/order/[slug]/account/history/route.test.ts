/**
 * Pagination contract for the customer account history feed. Locks: auth
 * gating, per-tab skip/take math, hasMore-via-(pageSize+1), and reward
 * order-number resolution (synthetic "signup:"/"sched:" ids skipped).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  restaurant: { findUnique: vi.fn() },
  order: { findMany: vi.fn() },
  rewardAccount: { findUnique: vi.fn() },
  rewardLedger: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const sessionMock = vi.hoisted(() => ({ getCurrentRestaurantCustomer: vi.fn() }));
vi.mock("@/lib/restaurant-customer-session", () => sessionMock);

import { GET, ORDERS_PAGE_SIZE, REWARD_PAGE_SIZE } from "./route";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (qs: string) => new NextRequest(`http://localhost/api/order/luigis/account/history?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.restaurant.findUnique.mockResolvedValue({ id: "rest_1", rewardsEnabled: true });
  sessionMock.getCurrentRestaurantCustomer.mockResolvedValue({ id: "cust_1", restaurantId: "rest_1" });
});

describe("GET account history", () => {
  it("404 when the restaurant slug is unknown", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue(null);
    expect((await GET(req("tab=orders"), params("nope"))).status).toBe(404);
  });

  it("401 when not signed in as this restaurant's customer", async () => {
    sessionMock.getCurrentRestaurantCustomer.mockResolvedValue(null);
    expect((await GET(req("tab=reward"), params("luigis"))).status).toBe(401);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  it("orders tab: correct skip/take and hasMore when a full+1 page returns", async () => {
    const many = Array.from({ length: ORDERS_PAGE_SIZE + 1 }, (_, i) => ({
      id: `o${i}`, orderNumber: `#${i}`, total: 10, status: "completed", createdAt: new Date(), type: "delivery",
    }));
    prismaMock.order.findMany.mockResolvedValue(many);
    const res = await GET(req("tab=orders&page=3"), params("luigis"));
    const data = await res.json();
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "cust_1" }, skip: 2 * ORDERS_PAGE_SIZE, take: ORDERS_PAGE_SIZE + 1 }),
    );
    expect(data.hasMore).toBe(true);
    expect(data.rows).toHaveLength(ORDERS_PAGE_SIZE); // extra sliced off
    expect(data.page).toBe(3);
  });

  it("orders tab: hasMore false on the last (short) page", async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: "o", orderNumber: "#1", total: 5, status: "completed", createdAt: new Date(), type: "pickup" }]);
    const data = await (await GET(req("tab=orders&page=1"), params("luigis"))).json();
    expect(data.hasMore).toBe(false);
    expect(data.rows).toHaveLength(1);
  });

  it("reward tab: resolves order numbers, skips synthetic ids, computes hasMore", async () => {
    prismaMock.rewardAccount.findUnique.mockResolvedValue({ id: "acct_1" });
    const ledger = [
      { id: "l1", amount: 5, reason: "earn", createdAt: new Date(), orderId: "ord_real" },
      { id: "l2", amount: 10, reason: "earn:signup:x", createdAt: new Date(), orderId: "signup:cust_1" },
      ...Array.from({ length: REWARD_PAGE_SIZE - 1 }, (_, i) => ({ id: `f${i}`, amount: 1, reason: "spend", createdAt: new Date(), orderId: null })),
    ]; // length = REWARD_PAGE_SIZE + 1 → hasMore
    prismaMock.rewardLedger.findMany.mockResolvedValue(ledger);
    prismaMock.order.findMany.mockResolvedValue([{ id: "ord_real", orderNumber: "ORD-123" }]);

    const res = await GET(req("tab=reward&page=2"), params("luigis"));
    const data = await res.json();
    expect(prismaMock.rewardLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: "acct_1" }, skip: REWARD_PAGE_SIZE, take: REWARD_PAGE_SIZE + 1 }),
    );
    // only the real order id is looked up (synthetic "signup:" skipped)
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["ord_real"] } } }),
    );
    expect(data.orderNumbers).toEqual({ ord_real: "ORD-123" });
    expect(data.hasMore).toBe(true);
    expect(data.rows).toHaveLength(REWARD_PAGE_SIZE);
  });

  it("reward tab: empty when the store has rewards off", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ id: "rest_1", rewardsEnabled: false });
    const data = await (await GET(req("tab=reward"), params("luigis"))).json();
    expect(data.rows).toEqual([]);
    expect(data.hasMore).toBe(false);
    expect(prismaMock.rewardLedger.findMany).not.toHaveBeenCalled();
  });
});
