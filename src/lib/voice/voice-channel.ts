/**
 * Voice-service LANES — which Fly app a phone number's calls are routed to.
 *
 * Luigi, 2026-08-22: "do it in a way that it doesn't affect our live agent and
 * we can test everything to ensure it's better before making it live … and so
 * we can revert back if the fix is bad." This is the switch that makes that
 * true. Every code change deploys to `nabil-voice-staging` first; only the
 * numbers whose `VoiceNumber.voiceChannel` is "staging" (a test line that
 * Luigi and the platform team call) reach it. The public line stays "current"
 * until the change is promoted — and promotion/rollback is a deploy of an
 * already-built image, never a code change.
 *
 * Pure: no env reads of its own, so the TwiML route's decision is unit-tested
 * against explicit inputs. The route passes the two env URLs in.
 */
export const VOICE_CHANNELS = ["current", "staging"] as const;
export type VoiceChannel = (typeof VOICE_CHANNELS)[number];

export function isVoiceChannel(v: unknown): v is VoiceChannel {
  return typeof v === "string" && (VOICE_CHANNELS as readonly string[]).includes(v);
}

export type VoiceLane = {
  /** The lane the call actually goes to. */
  channel: VoiceChannel;
  /** The ConversationRelay wss URL for that lane ("" when the lane is unconfigured —
   *  the route's existing "no wss → ring the store" gate handles that). */
  wss: string;
  /** True when "staging" was requested but NABIL_VOICE_STAGING_WSS_URL is unset:
   *  the call fell back to the live lane rather than dead-airing. Logged by the
   *  route so a mis-pointed test line is visible. */
  fellBack: boolean;
};

/**
 * Decide the lane for one call.
 *
 *   requested   = VoiceNumber.voiceChannel (anything unknown reads as "current")
 *   currentWss  = NABIL_VOICE_WSS_URL
 *   stagingWss  = NABIL_VOICE_STAGING_WSS_URL (optional — unset = no staging lane)
 */
export function resolveVoiceLane(input: {
  requested: string | null | undefined;
  currentWss: string | null | undefined;
  stagingWss: string | null | undefined;
}): VoiceLane {
  const current = (input.currentWss || "").trim();
  const staging = (input.stagingWss || "").trim();
  const wantsStaging = input.requested === "staging";
  if (wantsStaging && staging) return { channel: "staging", wss: staging, fellBack: false };
  return { channel: "current", wss: current, fellBack: wantsStaging && !staging };
}
