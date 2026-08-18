/**
 * Superadmin › Nabil Phone Lines — the pure half of /api/superadmin/voice-numbers.
 *
 * Kept out of the route file because Next.js route modules may only export
 * handlers + config, and because `describeLayers` is the piece worth unit
 * testing: two fallback layers that quietly disagree about who to ring is the
 * exact class of bug the page exists to surface.
 */
import type { NumberConfig } from "@/lib/voice/twilio-number-config";
import { resolveFallbackNumber } from "@/lib/voice/twiml-safety-net";

export type FallbackLayer = { dial: string | null; source: string };

export type VoiceLineRow = {
  id: string;
  phoneNumber: string;
  status: string;
  enabled: boolean;
  isDemo: boolean;
  twilioNumberSid: string | null;
  restaurant: { id: string; name: string; slug: string };
  /** "ok" = Twilio answered; "not_configured" = FFOS_TWILIO_* missing on this
   *  deployment; "not_found" = the account doesn't own this number (or Twilio
   *  couldn't be reached — the lib is no-throw and folds both into null). */
  twilioState: "ok" | "not_configured" | "not_found";
  current: NumberConfig | null;
  intended: { voiceUrl: string; voiceFallbackUrl: string | null };
  drift: string[];
  /** Who rings if Nabil can't take the call, per layer. */
  layers: {
    /** Vercel belt: twiml-safety-net.ts (env map → default number). */
    safetyNet: FallbackLayer;
    /** Fly braces: the /api/internal/voice/fallback-map precedence, identical
     *  to the handoff route. */
    flyFeed: FallbackLayer;
  };
};

export type VoiceLinesEnv = {
  twilioCredentials: boolean;
  fallbackMap: boolean;
  fallbackDefaultNumber: boolean;
  voiceWssUrl: boolean;
};

export type VoiceLinesResponse = {
  numbers: VoiceLineRow[];
  env: VoiceLinesEnv;
  generatedAt: string;
};

export type VoiceNumberRowInput = {
  phoneNumber: string;
  restaurant: {
    phone: string | null;
    alertPhone: string | null;
    voiceAgentConfig: { transferToNumber: string | null } | null;
  } | null;
};

/** Which human number each fallback layer resolves to for a Nabil number. */
export function describeLayers(row: VoiceNumberRowInput): VoiceLineRow["layers"] {
  const r = row.restaurant;
  const transfer = (r?.voiceAgentConfig?.transferToNumber || "").trim();
  const alert = (r?.alertPhone || "").trim();
  const phone = (r?.phone || "").trim();
  const flyDial = transfer || alert || phone || null;
  const flySource = transfer ? "transferToNumber" : alert ? "alertPhone" : phone ? "phone" : "none";

  const safety = resolveFallbackNumber(row.phoneNumber);
  const defaultNumber = (process.env.NABIL_FALLBACK_DEFAULT_NUMBER || "").trim();
  const source = !safety ? "none" : safety === defaultNumber ? "NABIL_FALLBACK_DEFAULT_NUMBER" : "NABIL_FALLBACK_MAP";
  return {
    safetyNet: { dial: safety, source },
    flyFeed: { dial: flyDial, source: flySource },
  };
}

/** Presence ONLY — this page must never render an env value. */
export function voiceLinesEnv(): VoiceLinesEnv {
  return {
    twilioCredentials: !!(process.env.FFOS_TWILIO_ACCOUNT_SID && process.env.FFOS_TWILIO_AUTH_TOKEN),
    fallbackMap: !!(process.env.NABIL_FALLBACK_MAP || "").trim(),
    fallbackDefaultNumber: !!(process.env.NABIL_FALLBACK_DEFAULT_NUMBER || "").trim(),
    voiceWssUrl: !!(process.env.NABIL_VOICE_WSS_URL || "").trim(),
  };
}
