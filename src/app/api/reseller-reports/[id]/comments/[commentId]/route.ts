/**
 * DELETE /api/reseller-reports/[id]/comments/[commentId] — SUPERADMIN ONLY.
 *
 * Removes a comment from a report. Gated on canChangeStatus (same bar as
 * status changes). Verifies the comment actually belongs to the report
 * before deleting, so a stray id can't nuke a comment on another report.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const access = await getReportAccess();
  if (!access.canChangeStatus) {
    return NextResponse.json({ error: "Only superadmin can delete comments" }, { status: 403 });
  }
  const { id, commentId } = await params;

  const comment = await prisma.resellerReportComment.findUnique({
    where: { id: commentId },
    select: { id: true, reportId: true },
  });
  if (!comment || comment.reportId !== id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  await prisma.resellerReportComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
