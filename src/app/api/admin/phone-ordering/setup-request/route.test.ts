/**
 * Concierge line-setup request — scoped to the session's restaurant, validated,
 * ONE row per restaurant (upsert re-opens), refuses once a line exists, and
 * notifies the platform without the request waiting on mail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, notify } = vi.hoisted(() => ({
  prismaMock: {
    voiceSetupRequest: { findUnique: vi.fn(), upsert: vi.fn() },
    voiceNumber: { findFirst: vi.fn() },
  } as any,
  notify: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/session", () => ({
  getSessionUser: vi.fn(async () => ({ id: "u1", email: "Owner@Luigis.test", name: "Luigi", restaurantId: "rest_1", role: "owner" })),
}));
vi.mock("@/lib/entitlements", () => ({ requireFeature: vi.fn(async () => undefined) }));
vi.mock("@/lib/platform-notifications", () => ({ notifyNabilSetupRequested: notify }));

import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://x/api/admin/phone-ordering/setup-request", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

const good = { currentNumber: "905 555 0123", mode: "forward", transferNumber: "+1 289 409 1133", greetingName: "Luigi's Lasagna", notes: "back door for drivers" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.voiceNumber.findFirst.mockResolvedValue(null);
  prismaMock.voiceSetupRequest.findUnique.mockResolvedValue(null);
  prismaMock.voiceSetupRequest.upsert.mockImplementation(async (args: any) => ({
    id: "vsr_1",
    status: "NEW",
    payload: args.create.payload,
    createdAt: new Date("2026-08-17T10:00:00Z"),
    updatedAt: new Date("2026-08-17T10:00:00Z"),
    doneAt: null,
  }));
});

describe("POST /api/admin/phone-ordering/setup-request", () => {
  it("upserts ONE row for the session's restaurant with the normalised payload, re-opens it, notifies the platform", async () => {
    const res = await post(good);
    expect(res.status).toBe(201);
    const args = prismaMock.voiceSetupRequest.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ restaurantId: "rest_1" });
    expect(args.create).toMatchObject({ restaurantId: "rest_1", status: "NEW" });
    expect(args.create.payload).toEqual({
      currentNumber: "+19055550123",
      mode: "forward",
      transferNumber: "+12894091133",
      greetingName: "Luigi's Lasagna",
      notes: "back door for drivers",
      submittedBy: "owner@luigis.test",
    });
    // A re-submission re-opens a DONE request.
    expect(args.update).toEqual({ status: "NEW", payload: args.create.payload, doneAt: null });
    expect(notify).toHaveBeenCalledWith("vsr_1");
    // The browser never gets submittedBy back.
    const body = await res.json();
    expect(body.request.payload).toEqual({ currentNumber: "+19055550123", mode: "forward", transferNumber: "+12894091133", greetingName: "Luigi's Lasagna", notes: "back door for drivers" });
    expect(body.request.status).toBe("NEW");
  });

  it("400s invalid input with a code and never writes / notifies", async () => {
    expect((await post({ ...good, currentNumber: "abc" })).status).toBe(400);
    expect((await post({ ...good, mode: "teleport" })).status).toBe(400);
    expect((await post({ ...good, greetingName: "" })).status).toBe(400);
    expect(prismaMock.voiceSetupRequest.upsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("409s once the restaurant already has a provisioned line (stale tab)", async () => {
    prismaMock.voiceNumber.findFirst.mockResolvedValue({ id: "vn_1" });
    const res = await post(good);
    expect(res.status).toBe(409);
    expect(prismaMock.voiceNumber.findFirst.mock.calls[0][0].where).toEqual({ restaurantId: "rest_1" });
    expect(prismaMock.voiceSetupRequest.upsert).not.toHaveBeenCalled();
  });

  it("GET returns this restaurant's request (null when none)", async () => {
    const res = await GET();
    expect(prismaMock.voiceSetupRequest.findUnique.mock.calls[0][0].where).toEqual({ restaurantId: "rest_1" });
    expect((await res.json()).request).toBeNull();
  });
});
