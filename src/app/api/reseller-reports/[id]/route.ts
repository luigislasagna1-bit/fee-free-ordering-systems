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

  const data: { status?: ReportStatus; priority?: ReportPriority } = {};
  if (body.status !== undefined) {
    // Status changes are superadmin-only. A reseller who somehow POSTs
    // status gets a clean 403 instead of a silent no-op.
    if (!access.canChangeStatus) {
      return NextResponse.json({ error: "Only superadmin can change status" }, { status: 403 });
    }
    if (!REPORT_STATUSES.includes(body.status as ReportStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status as ReportStatus;
  }
  if (body.priority !== undefined) {
    if (!REPORT_PRIORITIES.includes(body.priority as ReportPriority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    data.priority = body.priority as ReportPriority;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const result = await prisma.resellerReport.updateMany({
    where: { id },
    data,
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...data });
}
