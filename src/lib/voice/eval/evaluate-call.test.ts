/**
 * Phase D — evaluateStoredCall / evaluateMissingCalls persistence (prisma mocked).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceCall: { findUnique: vi.fn(), findMany: vi.fn() },
    voiceCallEvaluation: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { evaluateMissingCalls, evaluateStoredCall } from "./evaluate-call";

beforeEach(() => vi.clearAllMocks());

const storedCall = {
  id: "c1",
  restaurantId: "r1",
  outcome: "order_placed",
  orderId: "o1",
  quotedTotal: 24.5,
  chargedTotal: 24.5,
  transferReason: null,
  durationSeconds: 90,
  sentiment: "positive",
  agentVersion: "old",
  promptVersion: "p0",
  provenance: { channel: "staging", coreVersion: "1.1.0", agentVersion: "abc1234", promptVersion: "p1" },
  events: [
    { seq: 1, turn: 1, type: "asr", payload: { text: "Large pepperoni, pickup, Marco." }, latencyMs: null },
    { seq: 2, turn: 1, type: "tool_result", payload: { name: "place_order", ok: true, output: { ok: true } }, latencyMs: 300 },
    { seq: 3, turn: 1, type: "turn", payload: { ttfaMs: 1800, spoken: "Done!", cartHashBefore: "a", cartHashAfter: "b" }, latencyMs: null },
    { seq: 4, turn: 1, type: "call_end", payload: { outcome: "order_placed", cartLines: 0 }, latencyMs: null },
  ],
};

describe("evaluateStoredCall", () => {
  it("scores the stored events and upserts one row keyed by callId with the provenance grouping keys", async () => {
    prismaMock.voiceCall.findUnique.mockResolvedValue(storedCall);
    prismaMock.voiceCallEvaluation.upsert.mockResolvedValue({ id: "e1" });
    const r = await evaluateStoredCall("c1");
    expect(r).toEqual({ detScore: expect.any(Number), needsReview: false });
    const arg = prismaMock.voiceCallEvaluation.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ callId: "c1" });
    expect(arg.update).toMatchObject({ restaurantId: "r1", channel: "staging", coreVersion: "1.1.0", agentVersion: "abc1234", promptVersion: "p1", needsReview: false, evaluatorVersion: expect.stringMatching(/^det-/) });
    expect(arg.update.detScore).toBeGreaterThanOrEqual(90);
  });
  it("unknown call → null, nothing written", async () => {
    prismaMock.voiceCall.findUnique.mockResolvedValue(null);
    expect(await evaluateStoredCall("nope")).toBeNull();
    expect(prismaMock.voiceCallEvaluation.upsert).not.toHaveBeenCalled();
  });
});

describe("evaluateMissingCalls", () => {
  it("picks ended calls without an evaluation in the window, oldest first, capped, and survives one failure", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    prismaMock.voiceCall.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "c1" ? storedCall : Promise.reject(new Error("boom"))));
    prismaMock.voiceCallEvaluation.upsert.mockResolvedValue({ id: "e1" });
    const r = await evaluateMissingCalls({ hours: 48, cap: 20, now: new Date("2026-08-22T20:00:00Z") });
    expect(prismaMock.voiceCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endedAt: { not: null, gte: new Date("2026-08-20T20:00:00Z") }, evaluation: null }, take: 20 }),
    );
    expect(r).toEqual({ evaluated: 1, ids: ["c1"] });
  });
});
