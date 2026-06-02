/**
 * GET   /api/reseller-reports/[id] — single report + its comments.
 * PATCH /api/reseller-reports/[id] — update status / priority / reporter.
 *   Status changes and reporter reassignment are SUPERADMIN-ONLY; priority
 *   can be edited by any caller with view access (resellers may bump their
 *   own report's priority).
 *
 *   Reporter reassignment lets a superadmin attribute a report to the
 *   person who actually reported it (e.g. when Luigi bulk-imports old
 *   bug reports under his own account and later credits each reseller).
 *   Pass reportedByEmail: "" (empty string) to clear it — the report
 *   reverts to being attributed to its author.
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
  let body: {
    status?: string;
    priority?: string;
    reportedByEmail?: string;
    reportedByName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Load the existing report so we can compare old → new for the
  // activity-log audit. Cheap single-row read.
  const existing = await prisma.resellerReport.findUnique({
    where: { id },
    select: {
      status: true,
      priority: true,
      reportedByEmail: true,
      reportedByName: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    status?: ReportStatus;
    priority?: ReportPriority;
    reportedByEmail?: string | null;
    reportedByName?: string | null;
  } = {};
  let statusChanged: { from: string; to: ReportStatus } | null = null;
  let priorityChanged: { from: string; to: ReportPriority } | null = null;
  let reporterChanged: { detail: string } | null = null;
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

  // Reporter reassignment — SUPERADMIN ONLY. Lets the SA credit the
  // person who actually reported a bug (handy after bulk-importing old
  // reports under the SA's own account). Empty string clears it, so the
  // report reverts to being attributed to its author.
  if (body.reportedByEmail !== undefined) {
    if (!access.canChangeStatus) {
      return NextResponse.json({ error: "Only superadmin can reassign the reporter" }, { status: 403 });
    }
    const rEmail = (body.reportedByEmail ?? "").trim().toLowerCase();
    if (rEmail === "") {
      // Clear → revert to author attribution.
      if (existing.reportedByEmail !== null) {
        data.reportedByEmail = null;
        data.reportedByName = null;
        reporterChanged = { detail: "cleared (now attributed to author)" };
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rEmail)) {
        return NextResponse.json({ error: "Invalid reported-by email" }, { status: 400 });
      }
      const rName = (body.reportedByName ?? "").trim().slice(0, 100) || rEmail;
      if (rEmail !== existing.reportedByEmail || rName !== existing.reportedByName) {
        data.reportedByEmail = rEmail;
        data.reportedByName = rName;
        reporterChanged = { detail: `${rName} (${rEmail})` };
      }
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
  if (reporterChanged) {
    activityRows.push({
      reportId: id,
      actorEmail: access.email,
      actorName: access.name,
      kind: "REPORTER_CHANGED",
      detail: reporterChanged.detail,
    });
  }
  if (activityRows.length > 0) {
    await prisma.resellerReportActivity.createMany({ data: activityRows });
  }

  return NextResponse.json({ ok: true, ...data });
}

/**
 * DELETE /api/reseller-reports/[id] — SUPERADMIN ONLY.
 *
 * Permanently removes a report and everything attached to it (comments,
 * verifications, upvotes, activity all cascade-delete via the schema's
 * onDelete: Cascade). Use for clearing out test reports / junk. This is
 * irreversible — the UI confirms first.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canChangeStatus) {
    return NextResponse.json({ error: "Only superadmin can delete a report" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.resellerReport.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.resellerReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
