/**
 * Superadmin PATCH on a Nabil call report: platform staff may work it, a bad
 * status is refused, closing sets resolvedAt, and a REAL change is audited
 * and emailed to the reporter — a no-op save is not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, audit, notify, staff } = vi.hoisted(() => {
  const prismaMock: any = { voiceCallReport: { findUnique: vi.fn(), update: vi.fn() } };
  const audit = vi.fn(async () => undefined);
  const notify = vi.fn(async () => undefined);
  const staff = { current: { id: "sa1", email: "admin@feefree.test", name: "Ops", role: "platform_support" } as any };
  return { prismaMock, audit, notify, staff };
});

vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/platform-auth", () => ({ requirePlatformStaff: vi.fn(async () => staff.current), writeAuditLog: audit }));
vi.mock("@/lib/platform-notifications", () => ({ notifyNabilCallReportUpdated: notify }));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "rep_1" }) };
const patch = (body: unknown) => PATCH(new NextRequest("http://x/api/superadmin/restaurant-reports/nabil/rep_1", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), params);

beforeEach(() => {
  vi.clearAllMocks();
  staff.current = { id: "sa1", email: "admin@feefree.test", name: "Ops", role: "platform_support" };
  prismaMock.voiceCallReport.findUnique.mockResolvedValue({ id: "rep_1", status: "NEW", resolution: null, restaurantId: "rest_1" });
  prismaMock.voiceCallReport.update.mockImplementation(async (args: any) => ({ id: "rep_1", status: args.data.status ?? "NEW", resolution: args.data.resolution ?? null, resolvedAt: args.data.resolvedAt ?? null, updatedAt: new Date() }));
});

describe("PATCH /api/superadmin/restaurant-reports/nabil/[id]", () => {
  it("closes with FIXED + a verdict: resolvedAt set, audited, reporter emailed", async () => {
    const res = await patch({ status: "FIXED", resolution: "The size was dropped by the compiler; fixed in e31393f9." });
    expect(res.status).toBe(200);
    const data = prismaMock.voiceCallReport.update.mock.calls[0][0].data;
    expect(data.status).toBe("FIXED");
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "nabil-call-report.update", entity: "voiceCallReport:rep_1" }));
    expect(notify).toHaveBeenCalledWith("rep_1", { kind: "status", status: "FIXED", resolution: "The size was dropped by the compiler; fixed in e31393f9." });
  });

  it("re-opening clears resolvedAt; a no-op save neither audits nor emails; a bad status is 400; empty body is 400", async () => {
    prismaMock.voiceCallReport.findUnique.mockResolvedValueOnce({ id: "rep_1", status: "FIXED", resolution: "done", restaurantId: "rest_1" });
    await patch({ status: "INVESTIGATING" });
    expect(prismaMock.voiceCallReport.update.mock.calls[0][0].data.resolvedAt).toBeNull();

    vi.clearAllMocks();
    prismaMock.voiceCallReport.findUnique.mockResolvedValueOnce({ id: "rep_1", status: "NEW", resolution: null, restaurantId: "rest_1" });
    prismaMock.voiceCallReport.update.mockResolvedValueOnce({ id: "rep_1", status: "NEW", resolution: null, resolvedAt: null, updatedAt: new Date() });
    await patch({ status: "NEW" });
    expect(audit).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    expect((await patch({ status: "DONE" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  it("403s when the caller is not platform staff", async () => {
    staff.current = null;
    expect((await patch({ status: "FIXED" })).status).toBe(403);
  });
});
