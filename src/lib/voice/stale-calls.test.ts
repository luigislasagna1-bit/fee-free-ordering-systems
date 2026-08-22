/**
 * sweepStaleCalls — closes "In progress" rows whose session died without an
 * end event (2026-08-16: a restart killed a 33-second-old call's WebSocket
 * before the drain could run; the row sat In progress for the owner).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceCall: { findMany: vi.fn(), updateMany: vi.fn() },
    voiceAgentConfig: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { RECONCILE_WINDOW_MS, STALE_AFTER_MS, reconcileOrphanVoiceOrders, sweepStaleCalls } from "./stale-calls";

const NOW = new Date("2026-08-16T20:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sweepStaleCalls", () => {
  it("only rows with NO endedAt older than the cutoff are considered, and only those still open are closed", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "ghost1" }, { id: "ghost2" }]);
    prismaMock.voiceCall.updateMany.mockResolvedValue({ count: 2 });

    const res = await sweepStaleCalls(NOW);

    expect(prismaMock.voiceCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endedAt: null, startedAt: { lt: new Date(NOW.getTime() - STALE_AFTER_MS) } },
      }),
    );
    // Conditional on endedAt still null so a racing real end event wins.
    expect(prismaMock.voiceCall.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["ghost1", "ghost2"] }, endedAt: null },
      data: { endedAt: NOW, outcome: "dropped" },
    });
    expect(res).toEqual({ closed: 2, ids: ["ghost1", "ghost2"] });
  });

  it("marks them 'dropped' (the record was lost by the service — not the caller, not the agent), never a made-up duration", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "g" }]);
    prismaMock.voiceCall.updateMany.mockResolvedValue({ count: 1 });
    await sweepStaleCalls(NOW);
    const data = prismaMock.voiceCall.updateMany.mock.calls[0][0].data;
    expect(data.outcome).toBe("dropped");
    expect(data).not.toHaveProperty("durationSeconds");
    expect(data).not.toHaveProperty("transcript");
  });

  it("nothing stale → no write at all", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValue([]);
    const res = await sweepStaleCalls(NOW);
    expect(prismaMock.voiceCall.updateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ closed: 0, ids: [] });
  });

  it("the cutoff is 45 minutes — a long but alive call is never closed", () => {
    expect(STALE_AFTER_MS).toBe(45 * 60_000);
  });
});

/* ───────────────────────── reconcileOrphanVoiceOrders (A3) ───────────────────────── */

const SID = "CA" + "a".repeat(32);
const SID2 = "CA" + "b".repeat(32);

describe("reconcileOrphanVoiceOrders", () => {
  it("stamps a call row from the voice order whose end record was lost, scoped to voice-enabled stores and the last 24 h", async () => {
    prismaMock.voiceAgentConfig.findMany.mockResolvedValue([{ restaurantId: "r1" }]);
    prismaMock.order.findMany.mockResolvedValue([
      { id: "o1", orderNumber: "ORD-1", restaurantId: "r1", idempotencyKey: `voice-${SID}-deadbeef` },
      { id: "o9", orderNumber: "ORD-9", restaurantId: "r1", idempotencyKey: "voice-not-a-callsid-xyz" },
    ]);
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "c1", callSid: SID, restaurantId: "r1", outcome: "dropped" }]);
    prismaMock.voiceCall.updateMany.mockResolvedValue({ count: 1 });

    const res = await reconcileOrphanVoiceOrders(NOW);

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId: { in: ["r1"] },
          createdAt: { gte: new Date(NOW.getTime() - RECONCILE_WINDOW_MS) },
          idempotencyKey: { startsWith: "voice-" },
        },
      }),
    );
    expect(prismaMock.voiceCall.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { callSid: { in: [SID] }, orderId: null } }));
    expect(prismaMock.voiceCall.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", orderId: null },
      data: { orderId: "o1", orderNumber: "ORD-1", outcome: "order_placed" },
    });
    expect(res).toEqual({ checked: 2, reconciled: 1, ids: ["c1"] });
  });

  it("never stamps across tenants and never touches a call that already has its order", async () => {
    prismaMock.voiceAgentConfig.findMany.mockResolvedValue([{ restaurantId: "r1" }, { restaurantId: "r2" }]);
    prismaMock.order.findMany.mockResolvedValue([{ id: "o2", orderNumber: "ORD-2", restaurantId: "r2", idempotencyKey: `voice-${SID2}-cafe` }]);
    // The call row claims r1 but the order belongs to r2 → refuse.
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "c2", callSid: SID2, restaurantId: "r1", outcome: null }]);
    const res = await reconcileOrphanVoiceOrders(NOW);
    expect(prismaMock.voiceCall.updateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 1, reconciled: 0, ids: [] });
  });

  it("no voice-enabled store → no order scan at all", async () => {
    prismaMock.voiceAgentConfig.findMany.mockResolvedValue([]);
    const res = await reconcileOrphanVoiceOrders(NOW);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 0, reconciled: 0, ids: [] });
  });
});
