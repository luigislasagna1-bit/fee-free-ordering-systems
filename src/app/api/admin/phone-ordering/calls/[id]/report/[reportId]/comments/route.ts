import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requirePhoneOrderingAdmin } from "../../../../../guard";
import { createInApp, superadminAudience } from "@/lib/platform-notifications";
import { VOICE_CALL_REPORT_COMMENT_MAX, cleanReportText } from "@/lib/voice/call-reports";

/**
 * POST /api/admin/phone-ordering/calls/[id]/report/[reportId]/comments
 * { body } — the restaurant adds a note to its own call report. The platform
 * side sees it in the superadmin thread (+ an in-app bell). Scoped: the report
 * must belong to this restaurant AND this call.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;
  const { id, reportId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const body = cleanReportText((raw as { body?: unknown })?.body, VOICE_CALL_REPORT_COMMENT_MAX);
  if (!body) return NextResponse.json({ error: "Empty note", code: "empty" }, { status: 400 });

  const report = await prisma.voiceCallReport.findFirst({
    where: { id: reportId, callId: id, restaurantId },
    select: { id: true, topic: true, restaurant: { select: { name: true } } },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await getSessionUser();
  const comment = await prisma.voiceCallReportComment.create({
    data: {
      reportId: report.id,
      authorRole: "restaurant",
      authorEmail: user?.email ?? "",
      authorName: user?.name ?? null,
      body,
    },
    select: { id: true, authorRole: true, authorName: true, body: true, createdAt: true },
  });
  // Bump updatedAt so the superadmin list surfaces "new activity".
  await prisma.voiceCallReport.update({ where: { id: report.id }, data: { updatedAt: new Date() } });

  void superadminAudience()
    .then((sa) =>
      createInApp(sa.inApp, {
        kind: "nabil_call_report_comment",
        title: `${report.restaurant.name} replied on a Nabil call report`,
        body: body.slice(0, 200),
        linkUrl: `/superadmin/restaurant-reports/nabil/${report.id}`,
      }),
    )
    .catch((e) => console.error("[call-report] comment notify failed", e));

  return NextResponse.json({ comment }, { status: 201 });
}
