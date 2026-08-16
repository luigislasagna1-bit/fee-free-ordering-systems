/**
 * Nabil AI — call recording via the Twilio REST API. Fetch-based (no new
 * dependency), reusing the SAME platform Twilio credentials as SMS + the
 * missed-order robocalls (src/lib/sms.ts, src/lib/voice-call.ts):
 *
 *   FFOS_TWILIO_ACCOUNT_SID
 *   FFOS_TWILIO_AUTH_TOKEN
 *
 * startCallRecording is fired from the call-log "start" event when the owner
 * enabled `recordCalls` (callers already hear the consent line in the TwiML
 * greeting — src/app/api/twilio/voice/route.ts). Twilio POSTs the finished
 * recording's metadata to /api/twilio/voice/recording-status, which stores the
 * base media URL; playback goes through the authenticated admin proxy, never a
 * raw Twilio URL. deleteRecording is the data-erasure hook (data-erasure.ts
 * deletes the audio at Twilio BEFORE nulling our pointer to it).
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

/** Absolute base URL for every Twilio callback and webhook we register.
 *  NEXT_PUBLIC_APP_URL is localhost in laptop dev — Twilio could never reach
 *  that — so fall back to the real domain (same pattern as
 *  src/lib/platform-notifications.ts).
 *
 *  Exported so twilio-number-config.ts registers the SAME string on the phone
 *  number that this file and twilio-signature.ts verify against. A second
 *  URL builder would eventually drift by a slash or a host, and a drifted
 *  webhook URL takes the live phone line dead at the next deploy. */
export function platformPublicUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env.replace(/\/$/, "");
  return "https://feefreeordering.com";
}

/** The exact URL registered as RecordingStatusCallback. Exported so the
 *  webhook route verifies X-Twilio-Signature against this SAME deterministic
 *  string instead of trusting proxy headers to reconstruct the request URL. */
export function recordingStatusCallbackUrl(): string {
  return `${platformPublicUrl()}/api/twilio/voice/recording-status`;
}

/**
 * Start recording a live call. No-throw by contract: recording is a
 * nice-to-have side effect — a Twilio hiccup must never break the call flow
 * or the call-log write. `restaurantId` is log context only.
 */
export async function startCallRecording(callSid: string, restaurantId: string): Promise<void> {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.error("[twilio-recording] start skipped: FFOS_TWILIO_* env vars missing", { callSid, restaurantId });
    return;
  }
  if (!/^CA[0-9a-fA-F]{32}$/.test(callSid)) {
    console.error("[twilio-recording] start skipped: invalid callSid", { callSid, restaurantId });
    return;
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `${TWILIO_API}/${encodeURIComponent(sid)}/Calls/${callSid}/Recordings.json`;
  const form = new URLSearchParams({
    RecordingStatusCallback: recordingStatusCallbackUrl(),
    RecordingStatusCallbackEvent: "completed",
    RecordingChannels: "mono",
    Trim: "trim-silence",
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[twilio-recording] start failed", {
        callSid, restaurantId, status: res.status, body: txt.slice(0, 200),
      });
    }
  } catch (e) {
    console.error("[twilio-recording] start error", { callSid, restaurantId }, e);
  }
}

/**
 * Delete a recording's audio at Twilio (data-erasure + retention). Returns
 * false on failure so callers can log-and-continue — an erasure request must
 * never abort on a Twilio hiccup. A 404 counts as success (already gone →
 * idempotent, same principle as the Stripe `resource_missing` handling in
 * data-erasure.ts).
 */
export async function deleteRecording(recordingSid: string): Promise<boolean> {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  if (!sid || !token) return false;
  if (!/^RE[0-9a-fA-F]{32}$/.test(recordingSid)) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `${TWILIO_API}/${encodeURIComponent(sid)}/Recordings/${recordingSid}.json`;
  try {
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Basic ${auth}` } });
    return res.ok || res.status === 404;
  } catch (e) {
    console.error("[twilio-recording] delete error", { recordingSid }, e);
    return false;
  }
}

/**
 * Response headers for the playback proxy: the Range-request trio forwarded
 * from Twilio's media response (so <audio> seeking works) + our own
 * Content-Type/Cache-Control. Nothing else crosses over — Twilio's remaining
 * headers (request ids, cookies…) must not leak to the browser.
 *
 * `Accept-Ranges: bytes` is asserted rather than merely forwarded: this proxy
 * satisfies ranges itself (see parseByteRange + the recording route) even when
 * the upstream answers a ranged request with a plain 200, so seeking is a
 * property of OUR response, not of Twilio's.
 */
export function audioPassthroughHeaders(upstream: Headers): Record<string, string> {
  const out: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, no-store",
    "accept-ranges": "bytes",
  };
  for (const h of ["content-range", "content-length"]) {
    const v = upstream.get(h);
    if (v) out[h] = v;
  }
  return out;
}

/**
 * Parse a single-range `Range: bytes=…` header against a known total size.
 *
 * Only the forms a media element actually sends are honoured — `bytes=N-`,
 * `bytes=N-M`, and the suffix form `bytes=-N`. Multi-range (comma) requests are
 * refused (null) because a multipart/byteranges body is not something an
 * <audio> element asks for, and half-implementing it would be worse than
 * serving the whole file.
 *
 * Returns null when the header is absent or unusable → caller serves 200.
 * Returns `unsatisfiable` when the range starts past the end of the file → the
 * caller must answer 416, never a 200 with the whole file (which is what makes
 * a player silently jump back to the start).
 */
export function parseByteRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const raw = (header || "").trim();
  if (!raw || !size || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!m) return null; // multi-range or malformed → whole file
  const [, startStr, endStr] = m;

  // Suffix form: the LAST n bytes.
  if (startStr === "") {
    const n = Number(endStr);
    if (!endStr || !Number.isFinite(n) || n <= 0) return null;
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0) return null;
  if (start >= size) return "unsatisfiable";
  const end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
  if (!Number.isFinite(end) || end < start) return "unsatisfiable";
  return { start, end };
}
