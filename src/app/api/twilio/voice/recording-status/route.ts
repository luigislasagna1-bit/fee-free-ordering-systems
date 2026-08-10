import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { recordingStatusCallbackUrl } from "@/lib/voice/twilio-recording";
import { shouldEnforceTwilioSignature, verifyTwilioSignature } from "@/lib/voice/twilio-signature";

/**
 * POST /api/twilio/voice/recording-status — Twilio's RecordingStatusCallback
 * (registered by startCallRecording, "completed" events only). Stores the
 * finished recording's base media URL + SID + duration on the VoiceCall row so
 * the dashboard's playback proxy can serve the audio. Public route (the proxy
 * excludes /api) — authenticity comes from X-Twilio-Signature.
 *
 * Responses stay 2xx wherever possible: Twilio retries non-2xx and a
 * malformed payload will never improve. Only a signature failure gets a 403.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  // Verify against the SAME deterministic URL we registered as the callback —
  // no query string, no reliance on X-Forwarded-* reconstruction behind Vercel
  // (the exact trap flagged in the /api/twilio/voice hardening TODO).
  if (shouldEnforceTwilioSignature()) {
    const ok = verifyTwilioSignature(
      recordingStatusCallbackUrl(),
      params,
      req.headers.get("x-twilio-signature"),
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    // No auth token in prod = we can't authenticate Twilio → fail closed.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = (params.RecordingStatus || "").trim();
  if (status !== "completed") return NextResponse.json({ ok: true, ignored: status || "unknown" });

  const callSid = (params.CallSid || "").trim();
  const recordingSid = (params.RecordingSid || "").trim();
  const recordingUrl = (params.RecordingUrl || "").trim();
  const duration = parseInt(params.RecordingDuration || "", 10);
  if (
    !/^CA[0-9a-fA-F]{32}$/.test(callSid) ||
    !/^RE[0-9a-fA-F]{32}$/.test(recordingSid) ||
    !recordingUrl.startsWith("https://api.twilio.com/")
  ) {
    return NextResponse.json({ ok: true, ignored: "malformed" });
  }

  // Store the BASE media URL (extension stripped) — the playback proxy appends
  // .mp3 itself, and only ever fetches api.twilio.com URLs (checked above).
  const baseUrl = recordingUrl.replace(/\.(json|mp3|wav)$/i, "");

  // updateMany, NOT upsert: a create would need restaurantId, which this
  // webhook doesn't (and must not) carry. Rows are created by the call-log
  // "start" event; a miss means a legacy hangup-only call → 202 (heard, not
  // stored) so Twilio doesn't retry.
  const res = await prisma.voiceCall.updateMany({
    where: { callSid },
    data: {
      recordingUrl: baseUrl,
      recordingSid,
      recordingDurationSeconds: Number.isFinite(duration) ? duration : null,
    },
  });
  if (res.count === 0) return NextResponse.json({ ok: true, pending: true }, { status: 202 });
  return NextResponse.json({ ok: true });
}
