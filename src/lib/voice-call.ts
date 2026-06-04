/**
 * Voice-call sender — fetch-based Twilio REST call (no new dependency),
 * reusing the SAME platform Twilio credentials as SMS:
 *
 *   FFOS_TWILIO_ACCOUNT_SID
 *   FFOS_TWILIO_AUTH_TOKEN
 *   FFOS_TWILIO_FROM_NUMBER   (E.164)
 *
 * Used for the "nearly-missed order" auto-call (report cmpxeph4l): if a new
 * order sits unaccepted for ~90s, we ring the restaurant's phone and read a
 * short spoken message so an unattended tablet doesn't drop the order.
 *
 * No-op (logging) when Twilio env vars are missing, so nothing crashes
 * without a provider configured.
 */
import { sanitizePhone } from "./phone";

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

export interface CallResult {
  placed: boolean;
  sid?: string;
  reason?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function placeVoiceCall(args: {
  to: string;
  /** Plain-text message to speak. */
  message: string;
  /** BCP-47 voice language, e.g. "en-US", "it-IT". Defaults to en-US. */
  language?: string;
}): Promise<CallResult> {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  const from = process.env.FFOS_TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { placed: false, reason: "Twilio not configured (FFOS_TWILIO_* env vars missing)" };
  }
  const to = sanitizePhone(args.to);
  if (!to) return { placed: false, reason: "invalid recipient phone" };
  if (!args.message) return { placed: false, reason: "empty message" };

  const lang = args.language || "en-US";
  const spoken = escapeXml(args.message.slice(0, 400));
  // Repeat the message twice with a short pause so a half-asleep owner who
  // picks up mid-sentence still hears the whole thing.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="${lang}">${spoken}</Say><Pause length="1"/><Say voice="alice" language="${lang}">${spoken}</Say></Response>`;

  const url = `${TWILIO_API}/${encodeURIComponent(sid)}/Calls.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({ From: from, To: to, Twiml: twiml });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { placed: false, reason: `twilio ${res.status}: ${txt.slice(0, 200)}` };
    }
    const j = await res.json().catch(() => ({} as { sid?: string }));
    return { placed: true, sid: j.sid };
  } catch (e) {
    return { placed: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
