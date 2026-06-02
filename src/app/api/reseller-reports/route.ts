/**
 * GET  /api/reseller-reports — list every report (newest first).
 * POST /api/reseller-reports — create a new report. Status defaults to NEW.
 *
 * Both gated through getReportAccess(); rejects with 403 when the caller
 * isn't a superadmin or an invited reseller.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getReportAccess,
  REPORT_TYPES,
  REPORT_PRIORITIES,
  type ReportType,
  type ReportPriority,
} from "@/lib/reseller-reports-access";

export async function GET() {
  const access = await getReportAccess();
  if (!access.canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const reports = await prisma.resellerReport.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      authorEmail: true,
      authorName: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { comments: true } },
    },
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const access = await getReportAccess();
  if (!access.canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { title?: string; bodyText?: string; type?: string; priority?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim().slice(0, 200);
  const bodyText = (body.bodyText ?? "").trim().slice(0, 20_000);
  const type = body.type as ReportType;
  const priority = (body.priority ?? "MEDIUM") as ReportPriority;
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!bodyText) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (!REPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!REPORT_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }
  const report = await prisma.resellerReport.create({
    data: {
      title,
      body: bodyText,
      type,
      priority,
      // status defaults to "NEW" per the schema default. Only superadmin
      // can change it later via PATCH /api/reseller-reports/[id].
      authorEmail: access.email,
      authorName: access.name,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: report.id });
}
