import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireFeature } from "@/lib/entitlements";
import { proxyTwilioRecording } from "@/lib/voice/recording-proxy";

/**
 * GET /api/admin/phone-ordering/calls/[id]/recording — authenticated playback
 * proxy for a Nabil AI call recording. The dashboard's <audio> element points
 * here; we fetch the media from Twilio with the platform credentials
 * server-side, so neither the credentials nor the raw Twilio URL ever reach
 * the client. Range requests pass through (seeking in the player).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = user.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await requireFeature(restaurantId, "phone_ordering_agent");
  } catch {
    return NextResponse.json({ error: "Feature not unlocked" }, { status: 403 });
  }

  // Scope by restaurant TOO — a call id alone is never trusted.
  const { id } = await params;
  const call = await prisma.voiceCall.findFirst({
    where: { id, restaurantId },
    select: { recordingUrl: true },
  });
  return proxyTwilioRecording(req, call?.recordingUrl, id);
}
