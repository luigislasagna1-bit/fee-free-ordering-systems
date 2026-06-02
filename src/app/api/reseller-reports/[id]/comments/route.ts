/**
 * POST /api/reseller-reports/[id]/comments — add a comment to a report.
 *
 * Both superadmin and invited resellers can comment. Body is plain text
 * (we don't render markdown — keep it simple). Server-side capped at
 * 5,000 chars to prevent a runaway paste.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canComment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.body ?? "").trim().slice(0, 5_000);
  if (!text) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });

  // Confirm the report exists before stamping a comment — otherwise an
  // FK error would surface as a confusing 500.
  const report = await prisma.resellerReport.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const comment = await prisma.resellerReportComment.create({
    data: {
      reportId: id,
      authorEmail: access.email,
      authorName: access.name,
      body: text,
    },
  });
  // Touch the report's updatedAt so the list view sorts by activity, not
  // just creation time. Doing it inline (not in a transaction) is fine —
  // a failed touch is recoverable, the comment itself is the source of truth.
  await prisma.resellerReport.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  return NextResponse.json({ comment });
}
