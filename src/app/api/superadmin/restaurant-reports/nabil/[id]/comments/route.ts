import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { notifyNabilCallReportUpdated } from "@/lib/platform-notifications";
import { VOICE_CALL_REPORT_COMMENT_MAX, cleanReportText } from "@/lib/voice/call-reports";

/**
 * POST /api/superadmin/restaurant-reports/nabil/[id]/comments  { body }
 * The platform adds a note to a restaurant's call report; the reporter is
 * emailed and reads the thread on the call page.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const body = cleanReportText((raw as { body?: unknown })?.body, VOICE_CALL_REPORT_COMMENT_MAX);
  if (!body) return NextResponse.json({ error: "Empty note", code: "empty" }, { status: 400 });

  const report = await prisma.voiceCallReport.findUnique({ where: { id }, select: { id: true } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comment = await prisma.voiceCallReportComment.create({
    data: { reportId: id, authorRole: "platform", authorEmail: staff.email ?? "", authorName: staff.name ?? "Fee Free team", body },
    select: { id: true, authorRole: true, authorEmail: true, authorName: true, body: true, createdAt: true },
  });
  await prisma.voiceCallReport.update({ where: { id }, data: { updatedAt: new Date() } });

  void notifyNabilCallReportUpdated(id, { kind: "comment", body }).catch((e) => console.error("[call-report] comment notify failed", e));
  return NextResponse.json({ comment }, { status: 201 });
}
