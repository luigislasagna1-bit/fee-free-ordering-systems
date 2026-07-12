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
// shipday.ts imports prisma + encrypt (unmockable here), but the REAL event
// translation now lives in the prisma-free shipday-payload.ts — use it, so
// these tests can never drift from the actual vocabulary.
vi.mock("@/lib/shipday", async () => {
  const payload = await vi.importActual<typeof import("@/lib/shipday-payload")>("@/lib/shipday-payload");
  return { translateShipdayEvent: payload.translateShipdayEvent };
});

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

// ── ShipDay's DOCUMENTED payload shape (found live 2026-07-12) ──────────────
// Real webhooks carry order.id + order.order_number (snake_case) and the token
// in a header literally named "token" — none of which the original handler
// read; Luigi's delivered order 400'd "Missing order identifier" and never
// completed. These lock the documented contract.
describe("shipday webhook — documented payload shape", () => {
  it("order.id (documented) identifies the order without additionalId", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    prismaMock.order.findFirst.mockResolvedValueOnce(DISPATCHED_ORDER); // shipdayOrderId lookup
    const res = await POST(
      makeReq({ token: "platform-secret", body: { event: "ORDER_COMPLETED", order: { id: 555, order_number: "ORD-1" } } }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shipdayOrderId: "555" } }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed", shipdayStatus: "delivered" }) }),
    );
  });

  it("order_number fallback is scoped to the token's restaurant", async () => {
    prismaMock.shipdayConfig.findUnique.mockResolvedValue({
      id: "cfg_A", restaurantId: "rest_A", webhookVerifiedAt: new Date(),
    });
    prismaMock.order.findFirst
      .mockResolvedValueOnce(null) // no shipdayOrderId match
      .mockResolvedValueOnce(DISPATCHED_ORDER); // order_number match
    const res = await POST(
      makeReq({ token: "resto-a-token", body: { event: "ORDER_PIKEDUP", order: { id: 999, order_number: "ORD-1" } } }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.order.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { orderNumber: "ORD-1", restaurantId: "rest_A" } }),
    );
  });

  it("the token arrives in ShipDay's documented `token` HEADER (no query param)", async () => {
    vi.stubEnv("SHIPDAY_WEBHOOK_TOKEN", "platform-secret");
    const req = new NextRequest("http://localhost/api/webhooks/shipday", {
      method: "POST",
      body: JSON.stringify({ event: "ORDER_COMPLETED", order: { id: 555, additionalId: "ord_1" } }),
      headers: { "content-type": "application/json", token: "platform-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.order.update).toHaveBeenCalled();
  });
});
