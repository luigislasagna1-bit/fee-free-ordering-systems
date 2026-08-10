import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireFeature } from "@/lib/entitlements";
import { audioPassthroughHeaders } from "@/lib/voice/twilio-recording";

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
  // Only proxy-fetch Twilio API URLs with our credentials; anything else on
  // the row (shouldn't happen — the webhook validates) reads as "no recording".
  if (!call?.recordingUrl || !call.recordingUrl.startsWith("https://api.twilio.com/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return NextResponse.json({ error: "Recording unavailable" }, { status: 503 });
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const headers: Record<string, string> = { Authorization: `Basic ${auth}` };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(`${call.recordingUrl}.mp3`, { headers });
  } catch {
    console.error("[recording-proxy] twilio fetch failed", { callId: id });
    return NextResponse.json({ error: "Recording unavailable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // 404 = recording deleted at Twilio (erasure/retention); anything else is upstream trouble.
    const status = upstream.status === 404 ? 404 : 502;
    return NextResponse.json({ error: "Recording unavailable" }, { status });
  }

  // Stream straight through (200, or 206 when the Range was satisfied) with
  // only the whitelisted audio headers — no Twilio headers leak.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: audioPassthroughHeaders(upstream.headers),
  });
}
