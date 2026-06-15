/**
 * POST   /api/reseller-reports/[id]/upvote — add a "me too" upvote.
 * DELETE /api/reseller-reports/[id]/upvote — withdraw your upvote.
 *
 * One upvote per person per report. Body is empty for POST. Both
 * endpoints are idempotent — POSTing twice doesn't double-count, DELETEing
 * an absent vote returns ok with removed=0.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { markReportSeen } from "@/lib/reseller-reports-workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const report = await prisma.resellerReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const lowerEmail = access.email.trim().toLowerCase();
  // Upsert so the second POST is a no-op rather than a unique-constraint
  // error. Useful when the button is double-tapped.
  await prisma.resellerReportUpvote.upsert({
    where: { reportId_voterEmail: { reportId: id, voterEmail: lowerEmail } },
    update: { voterName: access.name },
    create: {
      reportId: id,
      voterEmail: lowerEmail,
      voterName: access.name,
    },
  });
  await prisma.resellerReport.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  await prisma.resellerReportActivity.create({
    data: {
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "UPVOTED",
    },
  });
  // The upvoter has obviously seen the report — clear their OWN new badge so a
  // "me too" doesn't flag the report unread for the very person who upvoted.
  // Mirrors the comment / confirm / status-change paths. Luigi 2026-06-15.
  await markReportSeen(id, lowerEmail);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const lowerEmail = access.email.trim().toLowerCase();
  const result = await prisma.resellerReportUpvote.deleteMany({
    where: { reportId: id, voterEmail: lowerEmail },
  });
  if (result.count > 0) {
    await prisma.resellerReportActivity.create({
      data: {
        reportId: id,
        actorEmail: access.email,
        actorName: access.name,
        kind: "UNUPVOTED",
      },
    });
  }
  return NextResponse.json({ ok: true, removed: result.count });
}
