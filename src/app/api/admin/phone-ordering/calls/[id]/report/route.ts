import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requirePhoneOrderingAdmin } from "../../../guard";
import { notifyNabilCallReported } from "@/lib/platform-notifications";
import {
  VOICE_CALL_REPORT_MAX_OPEN_PER_CALL,
  VOICE_CALL_REPORT_OPEN_STATUSES,
  parseNewVoiceCallReport,
} from "@/lib/voice/call-reports";

/**
 * Nabil AI — "Report this call" (Luigi 2026-08-16).
 *
 *   GET  /api/admin/phone-ordering/calls/[id]/report  → this call's reports + notes
 *   POST /api/admin/phone-ordering/calls/[id]/report  → file a report
 *        { topic, urgent?, description }
 *
 * Owner-authenticated, scoped by the session's restaurantId (the call must be
 * this restaurant's — the id in the URL is never trusted alone). Filing
 * notifies the platform (in-app bell + email to superadmins and support@).
 * The report then shows up under superadmin "Restaurant Reports › Nabil AI
 * reports" where the status + notes thread is worked; the restaurant reads
 * the thread on the call page and can add notes via ./report/[reportId]/comments.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPORT_SELECT = {
  id: true,
  topic: true,
  urgent: true,
  description: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  reporterName: true,
  createdAt: true,
  updatedAt: true,
  comments: {
    orderBy: { createdAt: "asc" as const },
    take: 200,
    select: { id: true, authorRole: true, authorName: true, body: true, createdAt: true },
  },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { id } = await params;
  const reports = await prisma.voiceCallReport.findMany({
    where: { callId: id, restaurantId: gate.restaurantId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: REPORT_SELECT,
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const restaurantId = gate.restaurantId;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON", code: "bad_json" }, { status: 400 });
  }
  const parsed = parseNewVoiceCallReport(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.code, code: parsed.code }, { status: 400 });

  const call = await prisma.voiceCall.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A stuck "Send" (or a double click) must not file ten copies; a second,
  // different problem on the same call is fine.
  const open = await prisma.voiceCallReport.count({
    where: { callId: call.id, restaurantId, status: { in: [...VOICE_CALL_REPORT_OPEN_STATUSES] } },
  });
  if (open >= VOICE_CALL_REPORT_MAX_OPEN_PER_CALL) {
    return NextResponse.json({ error: "Too many open reports on this call", code: "too_many_open" }, { status: 409 });
  }

  const user = await getSessionUser();
  const report = await prisma.voiceCallReport.create({
    data: {
      restaurantId,
      callId: call.id,
      topic: parsed.value.topic,
      urgent: parsed.value.urgent,
      description: parsed.value.description,
      reporterEmail: user?.email ?? null,
      reporterName: user?.name ?? null,
    },
    select: REPORT_SELECT,
  });

  // Fire-and-forget: the restaurant's request must not wait on mail.
  void notifyNabilCallReported(report.id).catch((e) => console.error("[call-report] notify failed", e));

  return NextResponse.json({ report }, { status: 201 });
}
