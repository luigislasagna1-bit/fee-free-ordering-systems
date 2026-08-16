import "server-only";
import { NextResponse } from "next/server";
import { audioPassthroughHeaders, parseByteRange } from "@/lib/voice/twilio-recording";

/**
 * Authenticated playback proxy for a Nabil AI call recording — the body shared
 * by the restaurant route (/api/admin/phone-ordering/calls/[id]/recording) and
 * the superadmin route behind a call report. The CALLER authorises and looks
 * the row up; this only fetches the media from Twilio with the platform
 * credentials so neither the credentials nor the raw Twilio URL reach a
 * browser. Range requests are honoured (seeking in the player).
 */
export async function proxyTwilioRecording(req: Request, recordingUrl: string | null | undefined, callId: string): Promise<Response> {
  // Only proxy-fetch Twilio API URLs with our credentials; anything else on
  // the row (shouldn't happen — the webhook validates) reads as "no recording".
  if (!recordingUrl || !recordingUrl.startsWith("https://api.twilio.com/")) {
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
    upstream = await fetch(`${recordingUrl}.mp3`, { headers });
  } catch {
    console.error("[recording-proxy] twilio fetch failed", { callId });
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
