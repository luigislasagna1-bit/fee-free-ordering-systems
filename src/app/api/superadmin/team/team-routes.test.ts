/**
 * Platform Team API rails (Team feature, 2026-07-12). These are the
 * lock-yourself-out guards — they must never regress:
 *   - invites validate email/role and refuse duplicates
 *   - you can't change your own role or deactivate yourself
 *   - the LAST active superadmin can never be demoted or deactivated
 *   - non-staff users are invisible to this endpoint (404)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  passwordResetToken: {
    create: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

const ACTOR = { id: "sa_1", email: "support@feefreeordering.com", role: "superadmin" };
const platformAuth = vi.hoisted(() => ({
  requireSuperadmin: vi.fn(),
  requirePlatformStaff: vi.fn(),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/platform-auth", () => platformAuth);
vi.mock("@/lib/email", () => ({ sendPlatformTeamInviteEmail: vi.fn().mockResolvedValue({}) }));

import { POST as inviteMember } from "./route";
import { PATCH as patchMember } from "./[id]/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/superadmin/team", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const paramsOf = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  platformAuth.requireSuperadmin.mockResolvedValue(ACTOR);
  platformAuth.writeAuditLog.mockResolvedValue(undefined);
});

describe("POST /api/superadmin/team (invite)", () => {
  it("refuses non-superadmin callers", async () => {
    platformAuth.requireSuperadmin.mockResolvedValue(null);
    const res = await inviteMember(req({ email: "a@b.co", role: "platform_support" }));
    expect(res.status).toBe(403);
  });

  it("validates email and role", async () => {
    expect((await inviteMember(req({ email: "nope", role: "platform_support" }))).status).toBe(400);
    expect((await inviteMember(req({ email: "a@b.co", role: "restaurant_admin" }))).status).toBe(400);
  });

  it("refuses duplicate emails with 409", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });
    expect((await inviteMember(req({ email: "a@b.co", role: "platform_support" }))).status).toBe(409);
  });

  it("creates the user + a 30-day set-password token + an audit row", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u_new" });
    const res = await inviteMember(req({ email: "Jane@B.co", name: "Jane", role: "platform_support" }));
    expect(res.status).toBe(200);
    const created = prismaMock.user.create.mock.calls[0][0].data;
    expect(created.email).toBe("jane@b.co"); // lowercased
    expect(created.role).toBe("platform_support");
    expect(created.restaurantId).toBeNull();
    expect(created.passwordHash).toBeTruthy(); // random stub, never the raw value
    const tokenRow = prismaMock.passwordResetToken.create.mock.calls[0][0].data;
    const days = (tokenRow.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(platformAuth.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.invite", entity: "user:u_new" }),
    );
  });
});

describe("PATCH /api/superadmin/team/[id] (rails)", () => {
  it("404s for users who are not platform staff", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "x@y.z", role: "restaurant_admin", isActive: true });
    const res = await patchMember(req({ role: "platform_support" }), paramsOf("u1"));
    expect(res.status).toBe(404);
  });

  it("refuses changing your OWN role and deactivating yourself", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: ACTOR.id, email: ACTOR.email, role: "superadmin", isActive: true });
    expect((await patchMember(req({ role: "platform_support" }), paramsOf(ACTOR.id))).status).toBe(400);
    expect((await patchMember(req({ isActive: false }), paramsOf(ACTOR.id))).status).toBe(400);
  });

  it("NEVER demotes or deactivates the last active superadmin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "sa_2", email: "other@x.co", role: "superadmin", isActive: true });
    prismaMock.user.count.mockResolvedValue(0); // no OTHER active superadmin
    expect((await patchMember(req({ role: "platform_support" }), paramsOf("sa_2"))).status).toBe(400);
    expect((await patchMember(req({ isActive: false }), paramsOf("sa_2"))).status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("demotes a superadmin when another active one remains, and audits it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "sa_2", email: "other@x.co", role: "superadmin", isActive: true });
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.user.update.mockResolvedValue({ id: "sa_2", email: "other@x.co", role: "platform_support", isActive: true });
    const res = await patchMember(req({ role: "platform_support" }), paramsOf("sa_2"));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "platform_support" } }),
    );
    expect(platformAuth.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.role", detail: expect.objectContaining({ oldRole: "superadmin", newRole: "platform_support" }) }),
    );
  });

  it("deactivates a support member and audits it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "ps_1", email: "helper@x.co", role: "platform_support", isActive: true });
    prismaMock.user.update.mockResolvedValue({ id: "ps_1", email: "helper@x.co", role: "platform_support", isActive: false });
    const res = await patchMember(req({ isActive: false }), paramsOf("ps_1"));
    expect(res.status).toBe(200);
    expect(platformAuth.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team.deactivate" }),
    );
  });
});
