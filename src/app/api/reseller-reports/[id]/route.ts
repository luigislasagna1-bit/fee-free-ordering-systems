/**
 * GET   /api/reseller-reports/[id] — single report + its comments.
 * PATCH /api/reseller-reports/[id] — update status / priority. Status
 *   changes are SUPERADMIN-ONLY; priority can be edited by any caller
 *   with view access (resellers may bump their own report's priority).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getReportAccess,
  REPORT_STATUSES,
  REPORT_PRIORITIES,
  type ReportStatus,
  type ReportPriority,
} from "@/lib/reseller-reports-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const report = await prisma.resellerReport.findUnique({
    where: { id },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      verifications: { orderBy: { updatedAt: "desc" } },
      upvotes: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: { status?: string; priority?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Load the existing report so we can compare old → new for the
  // activity-log audit. Cheap single-row read.
  const existing = await prisma.resellerReport.findUnique({
    where: { id },
    select: { status: true, priority: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { status?: ReportStatus; priority?: ReportPriority } = {};
  let statusChanged: { from: string; to: ReportStatus } | null = null;
  let priorityChanged: { from: string; to: ReportPriority } | null = null;
  if (body.status !== undefined) {
    if (!access.canChangeStatus) {
      return NextResponse.json({ error: "Only superadmin can change status" }, { status: 403 });
    }
    if (!REPORT_STATUSES.includes(body.status as ReportStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (body.status !== existing.status) {
      data.status = body.status as ReportStatus;
      statusChanged = { from: existing.status, to: data.status };
    }
  }
  if (body.priority !== undefined) {
    if (!REPORT_PRIORITIES.includes(body.priority as ReportPriority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    if (body.priority !== existing.priority) {
      data.priority = body.priority as ReportPriority;
      priorityChanged = { from: existing.priority, to: data.priority };
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.resellerReport.update({ where: { id }, data });

  // Audit-log entries for the timeline. Separate rows for status vs
  // priority changes so the activity feed reads naturally.
  const activityRows = [];
  if (statusChanged) {
    activityRows.push({
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "STATUS_CHANGE",
      detail: `${statusChanged.from} → ${statusChanged.to}`,
    });
  }
  if (priorityChanged) {
    activityRows.push({
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "PRIORITY_CHANGE",
      detail: `${priorityChanged.from} → ${priorityChanged.to}`,
    });
  }
  if (activityRows.length > 0) {
    await prisma.resellerReportActivity.createMany({ data: activityRows });
  }

  return NextResponse.json({ ok: true, ...data });
}
