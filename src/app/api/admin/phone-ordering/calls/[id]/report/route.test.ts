/**
 * "Report this call" — the restaurant route: scoped to the session's
 * restaurant, validates the form, refuses a fourth open report on one call,
 * stores who filed it, and notifies the platform WITHOUT the request waiting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, notify } = vi.hoisted(() => {
  const prismaMock: any = {
    voiceCall: { findFirst: vi.fn() },
    voiceCallReport: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), create: vi.fn() },
  };
  const notify = vi.fn(async () => undefined);
  return { prismaMock, notify };
});

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn(async () => ({ id: "u1", email: "owner@luigis.test", name: "Luigi", restaurantId: "rest_1", role: "owner" })) }));
vi.mock("@/lib/entitlements", () => ({ requireFeature: vi.fn(async () => undefined) }));
vi.mock("@/lib/platform-notifications", () => ({ notifyNabilCallReported: notify }));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "call_1" }) };
const post = (body: unknown) => POST(new NextRequest("http://x/api/admin/phone-ordering/calls/call_1/report", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), params);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.voiceCall.findFirst.mockResolvedValue({ id: "call_1" });
  prismaMock.voiceCallReport.count.mockResolvedValue(0);
  prismaMock.voiceCallReport.create.mockImplementation(async (args: any) => ({ id: "rep_1", ...args.data, comments: [] }));
});

describe("POST …/calls/[id]/report", () => {
  it("files the report scoped to the restaurant + call, records the reporter, notifies the platform", async () => {
    const res = await post({ topic: "incorrect_pricing", urgent: true, description: "Nabil quoted $25.97 but the ticket says $27.10." });
    expect(res.status).toBe(201);
    // The call lookup is scoped — a call id alone is never trusted.
    expect(prismaMock.voiceCall.findFirst.mock.calls[0][0].where).toEqual({ id: "call_1", restaurantId: "rest_1" });
    const data = prismaMock.voiceCallReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ restaurantId: "rest_1", callId: "call_1", topic: "incorrect_pricing", urgent: true, reporterEmail: "owner@luigis.test", reporterName: "Luigi" });
    expect(notify).toHaveBeenCalledWith("rep_1");
  });

  it("400s a bad topic / too-short description; 404s a call that isn't this restaurant's; 409s a fourth open report", async () => {
    expect((await post({ topic: "nope", description: "long enough text here" })).status).toBe(400);
    expect((await post({ topic: "other", description: "short" })).status).toBe(400);
    prismaMock.voiceCall.findFirst.mockResolvedValueOnce(null);
    expect((await post({ topic: "other", description: "the caller was told the wrong total" })).status).toBe(404);
    prismaMock.voiceCallReport.count.mockResolvedValueOnce(3);
    expect((await post({ topic: "other", description: "the caller was told the wrong total" })).status).toBe(409);
    expect(prismaMock.voiceCallReport.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("GET lists only this restaurant's reports on this call", async () => {
    await GET(new NextRequest("http://x/api/admin/phone-ordering/calls/call_1/report"), params);
    expect(prismaMock.voiceCallReport.findMany.mock.calls[0][0].where).toEqual({ callId: "call_1", restaurantId: "rest_1" });
  });
});
