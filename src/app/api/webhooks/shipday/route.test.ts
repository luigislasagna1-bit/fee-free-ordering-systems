/**
 * ShipDay webhook token-auth matrix (per-restaurant tokens, 2026-07-12).
 *
 * The route accepts EITHER the legacy platform-wide SHIPDAY_WEBHOOK_TOKEN env
 * or a per-restaurant ShipdayConfig.webhookToken (wizard). These tests lock:
 *   - fail-closed: tokenless prod callers and unknown tokens are rejected
 *   - per-restaurant tokens stamp webhookVerifiedAt exactly once
 *   - tenant scoping: restaurant A's token cannot move restaurant B's order
 *   - terminal orders are never resurrected by late/replayed events
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  shipdayConfig: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  order: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
// Completion ledger hooks — not under test; all idempotent no-ops here.
vi.mock("@/lib/coupon-ledger", () => ({ redeemCouponsForOrder: vi.fn() }));
vi.mock("@/lib/reward-ledger", () => ({ redeemForOrder: vi.fn(), awardForOrder: vi.fn() }));
vi.mock("@/lib/reward-earn", () => ({ awardEarnRulesForOrder: vi.fn(), awardPromoCreditsForOrder: vi.fn() }));
// translateShipdayEvent lives in shipday.ts which imports prisma + encrypt —
// mock the module with the real translation table inlined (kept in sync by
// the dispatch tests if they ever exist; here we only need two events).
vi.mock("@/lib/shipday", () => ({
  translateShipdayEvent: (event: string) => {
    if (/COMPLETED/i.test(event)) return { shipdayStatus: "delivered", orderStatus: "completed" };
    if (/ONTHEWAY|PICKED_UP/i.test(event)) return { shipdayStatus: "picked_up", orderStatus: "ready" };
    if (/ASSIGNED/i.test(event)) return { shipdayStatus: "assigned", orderStatus: null };
    return { shipdayStatus: null, orderStatus: null };
  },
}));

import { POST } from "./route";

function makeReq(opts: { token?: string; body?: unknown }) {
  const url = `http://localhost/api/webhooks/shipday${opts.token ? `?token=${opts.token}` : ""}`;
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(opts.body ?? { event: "ORDER_ONTHEWAY_STATUS", order: { orderId: 555, additionalId: "ord_1" } }),
    headers: { "content-type": "application/json" },
  });
}

const DISPATCHED_ORDER = {
  id: "ord_1",
  restaurantId: "rest_A",
  status: "accepted",
  shipdayOrderId: "555",
  shipdayStatus: "assigned",
  dispatchedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.findUnique.mockResolvedValue(DISPATCHED_ORDER);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shipday webhook token auth", () => {
  it("prod + no token at all → 401 (fail closed)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("legacy env token still works for any restaurant", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    const res = await POST(makeReq({ token: "platform-secret" }));
    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ord_1" } }),
    );
    // env-token path never touches per-restaurant verification
    expect(prismaMock.shipdayConfig.findUnique).not.toHaveBeenCalled();
  });

  it("a provided token matching neither env nor any restaurant → 401 even outside prod", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    prismaMock.shipdayConfig.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ token: "wrong" }));
    expect(res.status).toBe(401);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("per-restaurant token authenticates and stamps webhookVerifiedAt on first hit", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    prismaMock.shipdayConfig.findUnique.mockResolvedValue({
      id: "cfg_A", restaurantId: "rest_A", webhookVerifiedAt: null,
    });
    const res = await POST(makeReq({ token: "resto-a-token" }));
    expect(res.status).toBe(200);
    expect(prismaMock.shipdayConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg_A" }, data: { webhookVerifiedAt: expect.any(Date) } }),
    );
    expect(prismaMock.order.update).toHaveBeenCalled();
  });

  it("already-verified config is not re-stamped", async () => {
    prismaMock.shipdayConfig.findUnique.mockResolvedValue({
      id: "cfg_A", restaurantId: "rest_A", webhookVerifiedAt: new Date("2026-07-01"),
    });
    const res = await POST(makeReq({ token: "resto-a-token" }));
    expect(res.status).toBe(200);
    expect(prismaMock.shipdayConfig.update).not.toHaveBeenCalled();
  });

  it("TENANT SCOPE: restaurant B's token cannot move restaurant A's order", async () => {
    prismaMock.shipdayConfig.findUnique.mockResolvedValue({
      id: "cfg_B", restaurantId: "rest_B", webhookVerifiedAt: new Date(),
    });
    const res = await POST(makeReq({ token: "resto-b-token" }));
    expect(res.status).toBe(200); // 200-skip so ShipDay stops retrying
    const json = await res.json();
    expect(json.skipped).toBe("restaurant_mismatch");
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("terminal orders are never resurrected by a replayed completion", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    prismaMock.order.findUnique.mockResolvedValue({ ...DISPATCHED_ORDER, status: "cancelled" });
    const res = await POST(
      makeReq({ token: "platform-secret", body: { event: "ORDER_COMPLETED", order: { orderId: 555, additionalId: "ord_1" } } }),
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.order.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.status).toBeUndefined(); // shipdayStatus may update; order.status must not
  });
});
