/**
 * SMS sender — fetch-based Twilio REST call so we don't take a new
 * dependency. Activates when ALL THREE platform env vars are set:
 *
 *   FFOS_TWILIO_ACCOUNT_SID
 *   FFOS_TWILIO_AUTH_TOKEN
 *   FFOS_TWILIO_FROM_NUMBER   (E.164, e.g. "+12025551234")
 *
 * If any is missing, sendSms() is a logging no-op so the call sites
 * stay unchanged and the platform doesn't crash without an SMS
 * provider configured. Set these in the Vercel project env to turn
 * SMS on for every restaurant on the platform.
 *
 * Future: per-restaurant Twilio sub-accounts (so each restaurant can
 * use its own sender number / brand). For v1 we use one platform
 * number across all restaurants — same pattern as our shared Resend
 * email sender.
 */
import { sanitizePhone } from "./phone";

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

export interface SmsResult {
  sent: boolean;
  /** Twilio Message SID when sent. */
  sid?: string;
  /** Reason the send was skipped, when sent=false. */
  reason?: string;
}

export async function sendSms(args: {
  to: string;
  body: string;
}): Promise<SmsResult> {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  const from = process.env.FFOS_TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { sent: false, reason: "Twilio not configured (FFOS_TWILIO_* env vars missing)" };
  }
  const to = sanitizePhone(args.to);
  if (!to) return { sent: false, reason: "invalid recipient phone" };
  if (!args.body || args.body.length === 0) {
    return { sent: false, reason: "empty body" };
  }

  const url = `${TWILIO_API}/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({
    From: from,
    To: to,
    // Cap at 320 chars (2 SMS segments) so a long order name doesn't
    // accidentally cost 5x. Most templates are <160.
    Body: args.body.slice(0, 320),
  });
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
      return { sent: false, reason: `twilio ${res.status}: ${txt.slice(0, 200)}` };
    }
    const j = await res.json().catch(() => ({} as { sid?: string }));
    return { sent: true, sid: j.sid };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
