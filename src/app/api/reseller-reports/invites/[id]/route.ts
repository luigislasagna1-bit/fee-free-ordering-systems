/**
 * DELETE /api/reseller-reports/invites/[id] — revoke a reseller's access.
 *
 * Superadmin only. After deletion the reseller's NEXT page load returns
 * 404 from /reseller-reports — there's no soft-delete here, the row is
 * gone. Past reports + comments they authored stay (audit trail).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canInvite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const result = await prisma.resellerReportInvite.deleteMany({ where: { id } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
