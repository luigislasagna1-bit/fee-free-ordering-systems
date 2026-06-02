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
  let body: { body?: string; imageUrls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = (body.body ?? "").trim().slice(0, 5_000);
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0).slice(0, 10)
    : [];
  // Allow comments that are images-only — sometimes a screenshot says
  // everything. Otherwise require either text or an image.
  if (!text && imageUrls.length === 0) {
    return NextResponse.json({ error: "Comment is empty" }, { status: 400 });
  }

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
      imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
    },
  });
  // Touch updatedAt + audit-log the comment. Both writes are best-effort
  // — if the activity-row insert ever fails, we don't undo the comment
  // (comment is the source of truth, activity log is informational).
  await prisma.resellerReport.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  await prisma.resellerReportActivity.create({
    data: {
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "COMMENTED",
    },
  });
  return NextResponse.json({ comment });
}
