import jwt from "jsonwebtoken";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const CONFIG = {
  port: parseInt(process.env.PORT || "8080", 10),
  /** The Next.js app base URL, e.g. https://www.feefreeordering.com — the voice
   *  service is a THIN orchestrator that calls back into it for every read/write. */
  appBaseUrl: need("APP_BASE_URL").replace(/\/+$/, ""),
  /** Shared secret for the x-internal-key gate on /api/internal/voice/* + the
   *  channel:"voice" stamp on /api/orders. */
  internalSecret: need("INTERNAL_API_SECRET"),
  /** Verifies the short-lived call token minted by /api/twilio/voice. */
  jwtSecret: need("NABIL_VOICE_JWT_SECRET"),
  anthropicKey: need("ANTHROPIC_API_KEY"),
  /** Fast tier for the real-time turn loop (see plan: latency gates first audio). */
  model: process.env.NABIL_MODEL || "claude-sonnet-5",
  /** Reasoning mode for the turn loop. Sonnet 5 defaults to ADAPTIVE thinking
   *  when the parameter is omitted, which on a phone line is a silent
   *  time-to-first-token tax on every "yes". Decided by benchmark
   *  (scripts/nabil-bench.ts); overridable per deploy without a code change. */
  thinking: (process.env.NABIL_THINKING || "adaptive") as "adaptive" | "off",
  /** Output budget per model request. Spoken replies are one or two sentences;
   *  the headroom is for reasoning when thinking is on. */
  maxTokens: parseInt(process.env.NABIL_MAX_TOKENS || "2048", 10),
  /** Cross-call prompt cache TTL for the store prefix (system + menu). */
  cacheTtl: (process.env.NABIL_CACHE_TTL || "1h") as "5m" | "1h",
  /** How text reaches ConversationRelay's TTS: "token" forwards every model
   *  delta as it streams (default, lowest latency); "sentence" buffers to
   *  clause boundaries so ElevenLabs gets whole phrases (smoother prosody,
   *  ~100–300 ms later first audio). Experiment flag — needs one live call. */
  ttsChunk: (process.env.NABIL_TTS_CHUNK || "token") as "token" | "sentence",
};

export type CallToken = {
  restaurantId: string;
  slug: string;
  callSid: string;
  to: string;
  from: string;
};

/** Verify a call token (mirrors src/lib/voice/session-token.ts on the app side). */
export function verifyCallToken(token: string): CallToken | null {
  try {
    const d = jwt.verify(token, CONFIG.jwtSecret) as Record<string, unknown>;
    if (d?.t !== "nabilcall") return null;
    const { restaurantId, slug, callSid, to, from } = d;
    if ([restaurantId, slug, callSid, to, from].every((v) => typeof v === "string")) {
      return { restaurantId, slug, callSid, to, from } as CallToken;
    }
    return null;
  } catch {
    return null;
  }
}
