/**
 * Nabil AI — read and repair the webhook configuration on a provisioned Twilio
 * phone number. Fetch-based, reusing the SAME platform credentials as SMS, the
 * missed-order robocalls and call recording (src/lib/voice/twilio-recording.ts):
 *
 *   FFOS_TWILIO_ACCOUNT_SID
 *   FFOS_TWILIO_AUTH_TOKEN
 *
 * WHY (2026-08-15). Two facts made this necessary. First, the number's voice
 * webhook has only ever been set by hand in the Twilio console, so nothing in
 * the codebase could tell you what Twilio actually has — and a webhook URL that
 * has drifted from what twilio-signature.ts verifies against takes the live line
 * dead with a 403 on every call. Second, "PRIMARY HANDLER FAILS" — the
 * VoiceFallbackUrl — was never set at all, so a 500 from our own webhook meant
 * Twilio played its error tone and hung up on the caller.
 *
 * ⚠️ The `twilio` SDK is deliberately NOT a dependency of this project. Do not
 * add it; every Twilio call we make is a plain fetch with Basic auth.
 */
import { platformPublicUrl } from "@/lib/voice/twilio-recording";

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

/** E.164, the only shape Twilio's PhoneNumber filter accepts. */
export function isE164(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s.trim());
}

/** The URL Twilio must POST an inbound call to. Single-sourced on
 *  platformPublicUrl() so it is byte-identical to what twilio-signature.ts
 *  verifies — see that file's note on why a mismatch is fatal. */
export function voiceWebhookUrl(): string {
  return `${platformPublicUrl()}/api/twilio/voice`;
}

/**
 * The URL Twilio falls back to when the primary handler fails (non-2xx, invalid
 * TwiML, or a timeout).
 *
 * It deliberately does NOT live on Vercel: if the primary webhook is failing
 * because Vercel is down, a second Vercel URL is down too. It points at the Fly
 * voice service, which is a different provider, already always-on, and already
 * has an HTTP server. Derived from NABIL_VOICE_WSS_URL so there is one less env
 * var to keep in sync, with an explicit override for anything unusual.
 *
 * Returns null when we can't work out a host — the caller then leaves Twilio's
 * fallback field alone rather than clearing a good value with an empty one.
 */
export function voiceFallbackUrl(): string | null {
  const explicit = (process.env.NABIL_VOICE_FALLBACK_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const wss = (process.env.NABIL_VOICE_WSS_URL || "").trim();
  if (!wss) return null;
  try {
    const u = new URL(wss);
    const scheme = u.protocol === "ws:" ? "http:" : "https:";
    return `${scheme}//${u.host}/twiml/fallback`;
  } catch {
    return null;
  }
}

export type NumberConfig = {
  sid: string;
  phoneNumber: string;
  voiceUrl: string | null;
  voiceMethod: string | null;
  voiceFallbackUrl: string | null;
  voiceFallbackMethod: string | null;
  friendlyName: string | null;
};

export type IntendedConfig = {
  voiceUrl: string;
  /** null = we have no fallback to offer, so leave whatever Twilio has. */
  voiceFallbackUrl: string | null;
};

/**
 * Which registered fields differ from what we intend. Pure — this is the piece
 * worth unit-testing, and it is also what the admin "re-check phone line"
 * button renders so an owner can see the drift rather than being told to
 * trust us.
 */
export function voiceConfigDrift(current: NumberConfig, want: IntendedConfig): string[] {
  const drift: string[] = [];
  if ((current.voiceUrl || "") !== want.voiceUrl) drift.push("VoiceUrl");
  if ((current.voiceMethod || "").toUpperCase() !== "POST") drift.push("VoiceMethod");
  if (want.voiceFallbackUrl !== null) {
    if ((current.voiceFallbackUrl || "") !== want.voiceFallbackUrl) drift.push("VoiceFallbackUrl");
    if ((current.voiceFallbackMethod || "").toUpperCase() !== "POST") drift.push("VoiceFallbackMethod");
  }
  return drift;
}

function twilioAuth(): { sid: string; header: string } | null {
  const sid = process.env.FFOS_TWILIO_ACCOUNT_SID;
  const token = process.env.FFOS_TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toNumberConfig(row: any): NumberConfig {
  return {
    sid: String(row?.sid ?? ""),
    phoneNumber: String(row?.phone_number ?? ""),
    voiceUrl: row?.voice_url ?? null,
    voiceMethod: row?.voice_method ?? null,
    voiceFallbackUrl: row?.voice_fallback_url ?? null,
    voiceFallbackMethod: row?.voice_fallback_method ?? null,
    friendlyName: row?.friendly_name ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * What Twilio currently has registered for a number we own. Returns null when
 * the account doesn't own it (or we can't ask). No-throw by contract — this is
 * a diagnostic, and a diagnostic that throws is worse than no diagnostic.
 */
export async function readVoiceNumberConfig(phoneNumber: string): Promise<NumberConfig | null> {
  const auth = twilioAuth();
  if (!auth || !isE164(phoneNumber)) return null;
  const url =
    `${TWILIO_API}/${encodeURIComponent(auth.sid)}/IncomingPhoneNumbers.json` +
    `?PhoneNumber=${encodeURIComponent(phoneNumber.trim())}&PageSize=1`;
  try {
    const res = await fetch(url, { headers: { Authorization: auth.header } });
    if (!res.ok) {
      console.error("[twilio-number-config] lookup failed", { status: res.status });
      return null;
    }
    const body = await res.json();
    const row = body?.incoming_phone_numbers?.[0];
    return row ? toNumberConfig(row) : null;
  } catch (e) {
    console.error("[twilio-number-config] lookup error", e);
    return null;
  }
}

export type EnsureResult = {
  ok: boolean;
  sid?: string;
  /** Fields we actually changed. Empty on an already-correct number. */
  changed: string[];
  /** Set when ok === false. Never contains credentials. */
  error?: string;
};

/**
 * Make Twilio's registered webhooks match what this deployment expects, and
 * report exactly what moved. Idempotent: a number that is already correct is a
 * single GET and `changed: []`.
 *
 * Safe to run on every deploy or from a button. It only ever writes the two
 * voice URLs + their methods — it never touches SMS config, friendly names, or
 * anything else on the number.
 */
export async function ensureVoiceWebhookConfig(phoneNumber: string): Promise<EnsureResult> {
  const auth = twilioAuth();
  if (!auth) return { ok: false, changed: [], error: "FFOS_TWILIO_* env vars missing" };
  if (!isE164(phoneNumber)) return { ok: false, changed: [], error: "phone number is not E.164" };

  const current = await readVoiceNumberConfig(phoneNumber);
  if (!current) return { ok: false, changed: [], error: "number not found on this Twilio account" };

  const want: IntendedConfig = { voiceUrl: voiceWebhookUrl(), voiceFallbackUrl: voiceFallbackUrl() };
  const drift = voiceConfigDrift(current, want);
  if (drift.length === 0) return { ok: true, sid: current.sid, changed: [] };

  const form = new URLSearchParams({ VoiceUrl: want.voiceUrl, VoiceMethod: "POST" });
  if (want.voiceFallbackUrl !== null) {
    form.set("VoiceFallbackUrl", want.voiceFallbackUrl);
    form.set("VoiceFallbackMethod", "POST");
  }

  try {
    const res = await fetch(
      `${TWILIO_API}/${encodeURIComponent(auth.sid)}/IncomingPhoneNumbers/${encodeURIComponent(current.sid)}.json`,
      {
        method: "POST",
        headers: { Authorization: auth.header, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[twilio-number-config] update failed", { status: res.status, body: txt.slice(0, 200) });
      return { ok: false, sid: current.sid, changed: [], error: `Twilio ${res.status}` };
    }
    console.log("[twilio-number-config] updated", { sid: current.sid, changed: drift });
    return { ok: true, sid: current.sid, changed: drift };
  } catch (e) {
    console.error("[twilio-number-config] update error", e);
    return { ok: false, sid: current.sid, changed: [], error: "network error" };
  }
}
