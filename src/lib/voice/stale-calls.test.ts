/**
 * sweepStaleCalls — closes "In progress" rows whose session died without an
 * end event (2026-08-16: a restart killed a 33-second-old call's WebSocket
 * before the drain could run; the row sat In progress for the owner).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { voiceCall: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { STALE_AFTER_MS, sweepStaleCalls } from "./stale-calls";

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
      data: { endedAt: NOW, outcome: "error" },
    });
    expect(res).toEqual({ closed: 2, ids: ["ghost1", "ghost2"] });
  });

  it("marks them 'error' (the service failed the caller), never a made-up duration", async () => {
    prismaMock.voiceCall.findMany.mockResolvedValue([{ id: "g" }]);
    prismaMock.voiceCall.updateMany.mockResolvedValue({ count: 1 });
    await sweepStaleCalls(NOW);
    const data = prismaMock.voiceCall.updateMany.mock.calls[0][0].data;
    expect(data.outcome).toBe("error");
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
