import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireFeature } from "@/lib/entitlements";
import { audioPassthroughHeaders, parseByteRange } from "@/lib/voice/twilio-recording";

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

  // Upstream honoured the Range (206) — stream straight through with only the
  // whitelisted audio headers. No Twilio headers leak.
  if (!range || upstream.status === 206) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: audioPassthroughHeaders(upstream.headers),
    });
  }

  // 🚨 We asked for a byte range and got the WHOLE FILE back (200). Streaming
  // that through is what made the dashboard player un-seekable: the browser
  // asks for "bytes=900000-", receives a 200 starting at byte zero, and the
  // only thing it can do with it is play from the beginning — which reads to
  // the owner as "dragging the scrubber restarts the call". Reported by Luigi
  // 2026-08-13 while trying to review the part of a call that mattered.
  //
  // Twilio's media URL 307s to a storage host, and the redirect hop is where
  // the Range gets dropped, so we cannot fix this by asking more politely.
  // Satisfy the range ourselves instead: these are mono phone recordings capped
  // at maxCallSeconds (10 min ≈ 5 MB), so buffering one is cheap, and it makes
  // seeking a property of THIS route rather than of an upstream we don't own.
  const full = Buffer.from(await upstream.arrayBuffer());
  const parsed = parseByteRange(range, full.length);

  // A range starting past the end must be a 416. Answering 200 here would hand
  // the player the whole file again — the exact bug this block exists to kill.
  if (parsed === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${full.length}`, "Accept-Ranges": "bytes" },
    });
  }
  if (!parsed) {
    return new Response(full, {
      status: 200,
      headers: { ...audioPassthroughHeaders(upstream.headers), "content-length": String(full.length) },
    });
  }

  const slice = full.subarray(parsed.start, parsed.end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      ...audioPassthroughHeaders(upstream.headers),
      "content-range": `bytes ${parsed.start}-${parsed.end}/${full.length}`,
      "content-length": String(slice.length),
    },
  });
}
