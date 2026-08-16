import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { proxyTwilioRecording } from "@/lib/voice/recording-proxy";

/**
 * GET /api/superadmin/restaurant-reports/nabil/[id]/recording — playback of the
 * REPORTED call for platform staff, behind the report id (not a bare call id:
 * the recording is reachable here only because the restaurant asked us to look
 * at this call). Same Twilio proxy as the restaurant's own player.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const report = await prisma.voiceCallReport.findUnique({
    where: { id },
    select: { call: { select: { id: true, recordingUrl: true } } },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return proxyTwilioRecording(req, report.call.recordingUrl, report.call.id);
}
