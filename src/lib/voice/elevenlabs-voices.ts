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
  // ElevenLabs' CURRENT premade library (ids verified against the public
  // /v1/voices list on 2026-08-15 — Luigi asked for a realistic female voice).
  // Female, conversational first:
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "female", accent: "American · playful, bright, warm — conversational" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", gender: "female", accent: "American · professional, bright, warm" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", accent: "American · mature, reassuring, confident" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "female", accent: "American · knowledgeable, professional" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "female", accent: "American · enthusiastic, quirky" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", accent: "British · clear, engaging" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "female", accent: "British · velvety, warm" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", gender: "female", accent: "American · relaxed, neutral" },
  // Male, conversational:
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male", accent: "American · smooth, trustworthy" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", gender: "male", accent: "American · charming, down-to-earth" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", gender: "male", accent: "American · laid-back, resonant" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", gender: "male", accent: "American · relaxed optimist" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "male", accent: "American · deep, comforting" },
  // Legacy premades (no longer in ElevenLabs' public list, kept so a store
  // that already picked one is not broken by an update; not recommended):
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", gender: "female", accent: "American · calm, clear (legacy)" },
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
 * The TTS model every Nabil voice speaks through.
 *
 * `turbo_v2_5`, NOT `flash_v2_5`. Both are multilingual (v2_5 = 32 languages,
 * which our 38-locale line needs); flash is the fastest and the least accurate,
 * turbo trades roughly 200ms of model latency for markedly better pronunciation
 * and word endings.
 *
 * 🚨 Why this is now a CONSTANT instead of a branch. This value used to be sent
 * ONLY when voiceSpeed differed from 1.0 — so nudging the speed slider silently
 * moved a store onto the lowest-fidelity model, and the two effects compounded:
 * the fastest model, played faster. Luigi's store was on 1.1× and reported
 * exactly what that produces — slurred words, clipped endings, wrong emphasis.
 * A quality setting must never be a side effect of an unrelated slider, so the
 * model is now pinned for everyone who has picked a voice.
 */
const TTS_MODEL = "turbo_v2_5";

/**
 * Build the ConversationRelay `voice` attribute value.
 *
 * Returns null only when no voice is picked — that store sends no `voice`
 * attribute at all and gets Twilio's default, which is always safe.
 *
 * The extended form REQUIRES all three tuning numbers, so stability and
 * similarity are pinned at ElevenLabs' own defaults (0.5 / 0.75) and only speed
 * is owner-controlled — we expose one slider, not three.
 */
export function buildVoiceAttrValue(
  voiceId: string | null | undefined,
  speed: number | null | undefined,
  tuning: { stability?: number | null; similarity?: number | null } = {},
): string | null {
  const id = (voiceId || "").trim();
  if (!id) return null; // no voice picked: never send a model/speed for an unknown voice
  const s = clampVoiceSpeed(speed);
  const stability = clampUnit(tuning.stability, DEFAULT_STABILITY);
  const similarity = clampUnit(tuning.similarity, DEFAULT_SIMILARITY);
  return `${id}-${TTS_MODEL}-${s.toFixed(2)}_${stability.toFixed(2)}_${similarity.toFixed(2)}`;
}

/** ElevenLabs' own defaults. Stability: lower = more expressive/emotional,
 *  higher = flatter and more monotone. Luigi's "slightly too robotic"
 *  (2026-08-15) is partly the legacy voice at 1.1×, partly a flat delivery —
 *  NABIL_TTS_STABILITY lets us try 0.40 on one live call without a deploy. */
export const DEFAULT_STABILITY = 0.5;
export const DEFAULT_SIMILARITY = 0.75;

function clampUnit(v: number | null | undefined, fallback: number): number {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

/** Platform-wide TTS tuning from env (Vercel): NABIL_TTS_STABILITY / NABIL_TTS_SIMILARITY. */
export function ttsTuningFromEnv(env: NodeJS.ProcessEnv = process.env): { stability?: number | null; similarity?: number | null } {
  const num = (k: string) => (env[k] !== undefined && env[k] !== "" && Number.isFinite(Number(env[k])) ? Number(env[k]) : null);
  return { stability: num("NABIL_TTS_STABILITY"), similarity: num("NABIL_TTS_SIMILARITY") };
}

/** Ids the picker will accept from the client. Validated server-side so a
 *  crafted PATCH can't park an arbitrary string in the `voice` attribute. */
export function isKnownVoiceId(id: string, extra: readonly string[] = []): boolean {
  return NABIL_VOICES.some((v) => v.id === id) || extra.includes(id);
}
