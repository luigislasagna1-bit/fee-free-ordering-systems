/**
 * The quoted ≠ charged alarm: fires ONCE per placed call with a divergence,
 * never for a refusal that stored both totals but billed nobody, never twice
 * on a retried end event, and releases its claim if enqueueing fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, enqueueMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceCall: { updateMany: vi.fn() },
    restaurant: { findUnique: vi.fn() },
  },
  enqueueMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/ops-messages", () => ({ enqueueOpsMessage: enqueueMock }));

import { alertTotalsMismatch, formatTotalsMismatchMessage } from "./totals-mismatch-alarm";

const BASE = {
  callId: "call_1",
  restaurantId: "r1",
  callSid: "CA123",
  orderNumber: "ORD-964244913",
  outcome: "order_placed",
  quoted: 23.37,
  charged: 25.97,
  endedAt: new Date("2026-08-16T15:43:10Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.voiceCall.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.restaurant.findUnique.mockResolvedValue({ name: "Luigi's Lasagna & Pizzeria", currency: "cad" });
  enqueueMock.mockResolvedValue({ id: "ops_1" });
});

describe("alertTotalsMismatch", () => {
  it("fires once on a placed order with a divergence: claims the marker, enqueues one ops message with the facts and a superadmin link", async () => {
    await expect(alertTotalsMismatch(BASE)).resolves.toBe("enqueued");
    expect(prismaMock.voiceCall.updateMany).toHaveBeenCalledTimes(1);
    const claim = prismaMock.voiceCall.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "call_1", totalMismatchAlertedAt: null });
    expect(claim.data.totalMismatchAlertedAt).toBeInstanceOf(Date);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const msg = enqueueMock.mock.calls[0][0];
    expect(msg.subject).toContain("quoted ≠ charged");
    expect(msg.subject).toContain("Luigi's Lasagna & Pizzeria");
    expect(msg.subject).toContain("ORD-964244913");
    expect(msg.body).toContain("23.37 CAD");
    expect(msg.body).toContain("25.97 CAD");
    expect(msg.body).toContain("+2.60");
    expect(msg.body).toContain("CA123");
    expect(msg.link).toBe("/superadmin/restaurants/r1");
  });

  it("a retried end event does not alert again (the claim finds nothing to flip)", async () => {
    prismaMock.voiceCall.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(alertTotalsMismatch(BASE)).resolves.toBe("already_alerted");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("skips: equal totals, a sub-tolerance gap, missing totals — no DB call at all", async () => {
    await expect(alertTotalsMismatch({ ...BASE, charged: 23.37 })).resolves.toBe("skipped");
    await expect(alertTotalsMismatch({ ...BASE, charged: 23.374 })).resolves.toBe("skipped");
    await expect(alertTotalsMismatch({ ...BASE, quoted: null })).resolves.toBe("skipped");
    expect(prismaMock.voiceCall.updateMany).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("skips a refusal that stored both totals but placed nothing (total_changed = the guard working, not an incident)", async () => {
    await expect(alertTotalsMismatch({ ...BASE, outcome: "error", orderNumber: null })).resolves.toBe("skipped");
    expect(prismaMock.voiceCall.updateMany).not.toHaveBeenCalled();
  });

  it("an orderNumber alone counts as placed even if the outcome string is odd", async () => {
    await expect(alertTotalsMismatch({ ...BASE, outcome: "transferred" })).resolves.toBe("enqueued");
  });

  it("if enqueueing throws, the claim is released so a retry can alert, and the error surfaces", async () => {
    enqueueMock.mockRejectedValueOnce(new Error("ops down"));
    await expect(alertTotalsMismatch(BASE)).rejects.toThrow("ops down");
    expect(prismaMock.voiceCall.updateMany).toHaveBeenCalledTimes(2);
    const release = prismaMock.voiceCall.updateMany.mock.calls[1][0];
    expect(release.where).toEqual({ id: "call_1" });
    expect(release.data).toEqual({ totalMismatchAlertedAt: null });
  });

  it("an unknown restaurant still alerts (id in place of the name)", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValueOnce(null);
    await expect(alertTotalsMismatch(BASE)).resolves.toBe("enqueued");
    expect(enqueueMock.mock.calls[0][0].subject).toContain("r1");
  });
});

describe("formatTotalsMismatchMessage", () => {
  it("keeps the subject under the ops limit even with a very long restaurant name", () => {
    const { subject } = formatTotalsMismatchMessage({ ...BASE, restaurantName: "X".repeat(150), currency: "cad" });
    expect(subject.length).toBeLessThan(200);
  });
});
