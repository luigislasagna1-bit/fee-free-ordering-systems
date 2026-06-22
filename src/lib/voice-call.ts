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

/**
 * Natural-sounding Amazon Polly voices per locale (Twilio supports Polly in
 * <Say voice="...">). Neural voices where available — far less robotic than the
 * classic "alice". Twilio REJECTS an unknown voice, but placeVoiceCall FALLS
 * BACK to alice on any failure, so a wrong/unsupported name can never drop the
 * alert. Keyed by our app locale; falls back to the base language. Luigi 2026-06-17.
 */
const POLLY_VOICE: Record<string, string> = {
  en: "Polly.Joanna-Neural",
  it: "Polly.Bianca-Neural",
  fr: "Polly.Lea-Neural",
  es: "Polly.Lucia-Neural",
  de: "Polly.Vicki-Neural",
  pt: "Polly.Ines-Neural",
  "pt-BR": "Polly.Camila-Neural",
  nl: "Polly.Laura-Neural",
  pl: "Polly.Ola-Neural",
  sv: "Polly.Elin-Neural",
  da: "Polly.Sofie-Neural",
  nb: "Polly.Ida-Neural",
  fi: "Polly.Suvi-Neural",
  ru: "Polly.Tatyana",
  tr: "Polly.Filiz",
  ar: "Polly.Hala-Neural",
  ja: "Polly.Takumi-Neural",
  ko: "Polly.Seoyeon-Neural",
  zh: "Polly.Zhiyu-Neural",
  ca: "Polly.Arlet-Neural",
  ro: "Polly.Carmen",
};

/** Best natural voice for a restaurant's chosen language, or undefined (→ alice). */
export function pollyVoiceForLocale(locale: string): string | undefined {
  if (!locale) return undefined;
  return POLLY_VOICE[locale] ?? POLLY_VOICE[locale.split("-")[0]];
}

export async function placeVoiceCall(args: {
  to: string;
  /** Plain-text message to speak. */
  message: string;
  /** BCP-47 voice language, e.g. "en-US", "it-IT". Defaults to en-US. */
  language?: string;
  /** Optional Amazon Polly voice (e.g. "Polly.Bianca-Neural"). When set we use
   *  it with a boosted volume; on any Twilio failure we retry with alice so the
   *  alert still rings. */
  voice?: string;
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

  // Lead with a 2s pause so the FIRST words aren't clipped while the callee is
  // still raising the phone to their ear — the call audio path isn't fully open
  // the instant it connects (Luigi 2026-06-22: the start was cut off almost every
  // time). Then repeat the message twice with a short pause so a half-asleep owner
  // who picks up mid-sentence still hears the whole thing.
  const sayAlice = `<Say voice="alice" language="${lang}">${spoken}</Say>`;
  const aliceTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/>${sayAlice}<Pause length="1"/>${sayAlice}</Response>`;

  const usePolly = !!args.voice && args.voice.startsWith("Polly.");
  let primaryTwiml = aliceTwiml;
  if (usePolly) {
    // Polly supports SSML in Twilio <Say> — boost the volume (Luigi: louder +
    // less robotic). The voice value comes from our own map, not user input.
    const sayPolly = `<Say voice="${args.voice}"><prosody volume="x-loud">${spoken}</prosody></Say>`;
    primaryTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/>${sayPolly}<Pause length="1"/>${sayPolly}</Response>`;
  }

  const url = `${TWILIO_API}/${encodeURIComponent(sid)}/Calls.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const doCall = async (twiml: string): Promise<CallResult> => {
    const form = new URLSearchParams({ From: from, To: to, Twiml: twiml });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
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
  };

  const r1 = await doCall(primaryTwiml);
  if (r1.placed || !usePolly) return r1;
  // Polly attempt failed (e.g. unknown/unsupported voice for this Twilio
  // account) → fall back to the always-works "alice" voice so the alert still
  // rings in the restaurant's language.
  console.warn("[voice-call] Polly voice failed, falling back to alice", { voice: args.voice, reason: r1.reason });
  return doCall(aliceTwiml);
}
