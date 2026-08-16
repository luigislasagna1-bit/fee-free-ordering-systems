import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff, writeAuditLog } from "@/lib/platform-auth";
import { notifyNabilCallReportUpdated } from "@/lib/platform-notifications";
import { VOICE_CALL_REPORT_COMMENT_MAX, cleanReportText, isVoiceCallReportStatus } from "@/lib/voice/call-reports";

/**
 * Superadmin — one Nabil AI call report.
 *
 *   GET   /api/superadmin/restaurant-reports/nabil/[id]
 *         → report + notes + the call (summary, transcript, order, versions,
 *           latency, event count) so the whole picture is on one screen
 *   PATCH /api/superadmin/restaurant-reports/nabil/[id]  { status?, resolution? }
 *         → the platform's verdict; the reporter is emailed on a status change
 *
 * Platform staff may read AND work reports (support answers them; that is the
 * job). Every status change is audit-logged.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TIMELINE_EVENTS = 2000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const withEvents = req.nextUrl.searchParams.get("events") === "1";

  const report = await prisma.voiceCallReport.findUnique({
    where: { id },
    select: {
      id: true,
      topic: true,
      urgent: true,
      description: true,
      status: true,
      resolution: true,
      resolvedAt: true,
      reporterEmail: true,
      reporterName: true,
      createdAt: true,
      updatedAt: true,
      restaurant: { select: { id: true, name: true, slug: true, timezone: true, currency: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        take: 500,
        select: { id: true, authorRole: true, authorEmail: true, authorName: true, body: true, createdAt: true },
      },
      call: {
        select: {
          id: true,
          callSid: true,
          fromNumber: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          language: true,
          outcome: true,
          orderNumber: true,
          reservationCode: true,
          transcript: true,
          summary: true,
          sentiment: true,
          transferReason: true,
          quotedTotal: true,
          chargedTotal: true,
          model: true,
          tokensIn: true,
          tokensOut: true,
          costCents: true,
          latency: true,
          agentVersion: true,
          promptVersion: true,
          toolsVersion: true,
          menuSnapshotHash: true,
          eventCount: true,
          recordingSid: true,
        },
      },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [order, events] = await Promise.all([
    report.call.orderNumber
      ? prisma.order.findFirst({
          where: { restaurantId: report.restaurant.id, orderNumber: report.call.orderNumber },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            type: true,
            subtotal: true,
            taxAmount: true,
            deliveryFee: true,
            promoDiscount: true,
            couponDiscount: true,
            total: true,
            items: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true, variantName: true, quantity: true, subtotal: true, notes: true, modifiers: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve(null),
    withEvents
      ? prisma.voiceCallEvent.findMany({
          where: { callId: report.call.id },
          orderBy: { seq: "asc" },
          take: MAX_TIMELINE_EVENTS,
          select: { seq: true, ts: true, turn: true, type: true, payload: true, latencyMs: true, cartHash: true },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ report, order, events });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const b = (raw ?? {}) as { status?: unknown; resolution?: unknown };
  const status = b.status === undefined ? undefined : isVoiceCallReportStatus(b.status) ? b.status : null;
  if (status === null) return NextResponse.json({ error: "Bad status", code: "bad_status" }, { status: 400 });
  const resolution = b.resolution === undefined ? undefined : cleanReportText(b.resolution, VOICE_CALL_REPORT_COMMENT_MAX) || null;
  if (status === undefined && resolution === undefined) return NextResponse.json({ error: "Nothing to change", code: "noop" }, { status: 400 });

  const before = await prisma.voiceCallReport.findUnique({ where: { id }, select: { id: true, status: true, resolution: true, restaurantId: true } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const closing = status !== undefined && (status === "FIXED" || status === "WONT_FIX");
  const report = await prisma.voiceCallReport.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
      ...(status !== undefined ? { resolvedAt: closing ? new Date() : null } : {}),
    },
    select: { id: true, status: true, resolution: true, resolvedAt: true, updatedAt: true },
  });

  const statusChanged = status !== undefined && status !== before.status;
  const resolutionChanged = resolution !== undefined && resolution !== before.resolution;
  if (statusChanged || resolutionChanged) {
    void writeAuditLog({
      actor: staff,
      action: "nabil-call-report.update",
      entity: `voiceCallReport:${id}`,
      detail: { restaurantId: before.restaurantId, from: before.status, to: report.status, resolutionChanged },
    });
    // The reporter is told about a status change, or a new/changed verdict.
    void notifyNabilCallReportUpdated(id, { kind: "status", status: report.status, resolution: report.resolution }).catch((e) =>
      console.error("[call-report] status notify failed", e),
    );
  }
  return NextResponse.json({ report });
}
