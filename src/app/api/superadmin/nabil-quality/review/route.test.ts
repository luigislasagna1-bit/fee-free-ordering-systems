/**
 * Phase D part 2b — PUT /api/superadmin/nabil-quality/review (platform staff).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: { voiceCall: { findUnique: vi.fn() }, voiceCallReview: { upsert: vi.fn() } },
  authMock: { requirePlatformStaff: vi.fn(), writeAuditLog: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/platform-auth", () => authMock);

import { PUT } from "./route";

const put = (body: unknown) => new NextRequest("http://localhost/api/superadmin/nabil-quality/review", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  authMock.requirePlatformStaff.mockResolvedValue({ id: "u1", email: "staff@feefreeordering.com" });
  prismaMock.voiceCall.findUnique.mockResolvedValue({ id: "c1", restaurantId: "r1" });
  prismaMock.voiceCallReview.upsert.mockResolvedValue({ id: "rv1", updatedAt: new Date("2026-08-22T20:00:00Z") });
});

describe("review route", () => {
  it("403 without platform staff; 400 on a bad verdict; 404 on an unknown call", async () => {
    authMock.requirePlatformStaff.mockResolvedValueOnce(null);
    expect((await PUT(put({ callId: "c1", verdict: "good" }))).status).toBe(403);
    expect((await PUT(put({ callId: "c1", verdict: "meh" }))).status).toBe(400);
    prismaMock.voiceCall.findUnique.mockResolvedValueOnce(null);
    expect((await PUT(put({ callId: "nope", verdict: "good" }))).status).toBe(404);
  });

  it("upserts one review per call, keeps only known tags, stamps the reviewer, audits", async () => {
    const res = await PUT(put({ callId: "c1", verdict: "bad", tags: ["wrong_item", "bogus", "dead_air"], notes: " lost the half ", completed: false, failureReason: "size dropped" }));
    expect(res.status).toBe(200);
    const arg = prismaMock.voiceCallReview.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ callId: "c1" });
    expect(arg.update).toMatchObject({ restaurantId: "r1", verdict: "bad", tags: ["wrong_item", "dead_air"], notes: "lost the half", completed: false, failureReason: "size dropped", reviewerId: "u1", reviewerEmail: "staff@feefreeordering.com" });
    expect(authMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "nabil.call_review", entity: "c1" }));
  });
});
