/**
 * The voices an owner can give Nabil AI.
 *
 * WHY A CURATED LIST. Settings → Voice used to be a raw text box for an
 * ElevenLabs voice id — a field no restaurant owner could ever fill in. Twilio
 * ConversationRelay takes that id in its `voice` attribute, and an id it doesn't
 * accept breaks the call BEFORE the greeting, so the picker must only ever offer
 * ids we know are real.
 *
 * `voice` attribute syntax (Twilio ConversationRelay, ElevenLabs provider):
 *     voice="<voiceId>"
 *     voice="<voiceId>-<modelId>-<speed>_<stability>_<similarity>"
 * where modelId ∈ flash_v2_5 (default) | flash_v2 | turbo_v2_5 | turbo_v2,
 * speed ∈ 0.7–1.2, stability/similarity ∈ 0–1. That extended form is how
 * VoiceAgentConfig.voiceSpeed finally becomes real instead of a no-op.
 */

export type NabilVoice = {
  /** ElevenLabs voice id, exactly as ConversationRelay's `voice` wants it. */
  id: string;
  /** ElevenLabs library name — what the card says. */
  name: string;
  gender: "female" | "male";
  /** Free-text accent/character, shown under the name. */
  accent: string;
};

/**
 * ElevenLabs' long-standing pre-made library voices, plus the id Twilio
 * documents as the ConversationRelay en-US default. These are the stable public
 * ids; a store that picks "Default" sends no `voice` attribute at all and gets
 * whatever Twilio's default is, which is always safe.
 *
 * When the platform has an ELEVENLABS_API_KEY this list is REPLACED at runtime
 * by the account's real voice list (see /api/admin/phone-ordering/voices), so
 * the picker can never drift from the provider.
 */
export const NABIL_VOICES: NabilVoice[] = [
  { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", gender: "male", accent: "American · natural conversation" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", accent: "American · calm, clear" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", accent: "American · soft, friendly" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", gender: "female", accent: "American · confident" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", gender: "female", accent: "American · young, bright" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", gender: "male", accent: "American · deep, steady" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", gender: "male", accent: "American · warm" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", gender: "male", accent: "American · young, upbeat" },
  { id: "VR6AewLTigWG4xSO9mYg", name: "Arnold", gender: "male", accent: "American · crisp" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", gender: "male", accent: "American · relaxed" },
];

/** Clamp VoiceAgentConfig.voiceSpeed (0.5–2.0 in our schema) into the range
 *  ElevenLabs actually accepts. Out-of-range values are rejected by the
 *  provider, and a rejected voice attribute kills the call. */
export function clampVoiceSpeed(speed: number | null | undefined): number {
  // `Number(null)` is 0, which would silently clamp an UNSET speed to the
  // slowest voice — treat missing as normal speed explicitly.
  if (speed === null || speed === undefined) return 1;
  const n = Number(speed);
  if (!Number.isFinite(n) || n === 0) return 1;
  return Math.min(1.2, Math.max(0.7, Math.round(n * 100) / 100));
}

/**
 * Build the ConversationRelay `voice` attribute value.
 *
 * Returns null when there is nothing to say — no voice picked AND no speed
 * change — so the TwiML stays byte-identical to today for every store that
 * hasn't touched the setting.
 *
 * The extended form REQUIRES all three tuning numbers, so stability and
 * similarity are pinned at ElevenLabs' own defaults (0.5 / 0.75) and only speed
 * is owner-controlled — we expose one slider, not three.
 */
export function buildVoiceAttrValue(
  voiceId: string | null | undefined,
  speed: number | null | undefined,
): string | null {
  const id = (voiceId || "").trim();
  const s = clampVoiceSpeed(speed);
  const speedIsDefault = Math.abs(s - 1) < 0.005;
  if (!id) return null; // no voice picked: never send a speed for an unknown voice
  if (speedIsDefault) return id;
  return `${id}-flash_v2_5-${s.toFixed(2)}_0.50_0.75`;
}

/** Ids the picker will accept from the client. Validated server-side so a
 *  crafted PATCH can't park an arbitrary string in the `voice` attribute. */
export function isKnownVoiceId(id: string, extra: readonly string[] = []): boolean {
  return NABIL_VOICES.some((v) => v.id === id) || extra.includes(id);
}
