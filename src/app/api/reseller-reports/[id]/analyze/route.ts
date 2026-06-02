/**
 * POST /api/reseller-reports/[id]/analyze — SUPERADMIN ONLY.
 *
 * Generates (or returns the cached) AI triage analysis for a report and
 * stores it in ResellerReport.aiAnalysis. The analysis is superadmin-only:
 * this route is gated on canChangeStatus and the field is never threaded
 * to reseller browsers (see the detail page).
 *
 * Idempotent by default — if an analysis already exists it's returned as-is
 * (no second Claude call / no extra cost). Pass { regenerate: true } to
 * force a fresh analysis.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getReportAccess } from "@/lib/reseller-reports-access";
import { analyzeReport } from "@/lib/reseller-reports-ai";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getReportAccess();
  if (!access.canChangeStatus) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  let regenerate = false;
  try {
    const body = await req.json();
    regenerate = body?.regenerate === true;
  } catch {
    // No body — default (use cache if present).
  }

  const report = await prisma.resellerReport.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, type: true, priority: true, aiAnalysis: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (report.aiAnalysis && !regenerate) {
    return NextResponse.json({ analysis: report.aiAnalysis, cached: true });
  }

  const analysis = await analyzeReport({
    title: report.title,
    body: report.body,
    type: report.type,
    priority: report.priority,
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "AI analysis unavailable (key not configured or the call failed)" },
      { status: 503 },
    );
  }

  await prisma.resellerReport.update({ where: { id }, data: { aiAnalysis: analysis } });
  return NextResponse.json({ analysis, cached: false });
}
