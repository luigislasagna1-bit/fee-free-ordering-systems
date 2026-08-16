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

  // ── Draining + capacity (see server.ts) ──────────────────────────────────
  /** How long a SIGTERM drain waits for live calls to end by themselves before
   *  warm-transferring whatever is left. Fly's kill_timeout must be LONGER than
   *  this or the process is killed mid-drain and we are back where we started. */
  drainMs: parseInt(process.env.NABIL_DRAIN_MS || "240000", 10),
  /**
   * In-process concurrent-call cap, one machine.
   *
   * MEASURED 2026-08-15 (`npm run nabil:capacity`): a call's app-side state costs
   * ~1.06 MB RSS, so 512 MB fits roughly 250. Memory is NOT what this protects
   * against — Anthropic org rate limits and shared-cpu-1x are, and neither has
   * been measured. Set at fly.toml's hard_limit so we refuse the socket
   * IMMEDIATELY (caller reaches the store in under a second via the handoff
   * route) instead of letting Fly queue an upgrade that times out in silence.
   */
  maxSessions: parseInt(process.env.NABIL_MAX_SESSIONS || "25", 10),

  // ── Twilio VoiceFallbackUrl handler (see fallback.ts) ────────────────────
  // All OPTIONAL by design: the fallback is a safety net, and a safety net that
  // refuses to boot because a secret is unset is not a safety net. Missing
  // values degrade the handler loudly (a warn on first use), never fatally.
  /** Verifies X-Twilio-Signature on /twiml/fallback. Same platform token the app
   *  uses for SMS + recording. */
  twilioAuthToken: process.env.FFOS_TWILIO_AUTH_TOKEN || "",
  /** The EXACT URL registered as VoiceFallbackUrl on the number — Twilio signs
   *  that string, so it must be configured, not reconstructed from headers. */
  fallbackUrl: process.env.NABIL_TWILIO_FALLBACK_URL || "",
  /** {"+1289…":"+1416…"} floor for the fallback number map, so a cold boot
   *  during an app outage still knows who to ring. */
  fallbackMapJson: process.env.NABIL_FALLBACK_MAP || "",
};

export type CallToken = {
  restaurantId: string;
  slug: string;
  callSid: string;
  to: string;
  from: string;
  /** Listener / voice ConversationRelay was configured with (from the TwiML route); null on older tokens. */
  sttModel?: string | null;
  ttsVoice?: string | null;
};

/** Verify a call token (mirrors src/lib/voice/session-token.ts on the app side). */
export function verifyCallToken(token: string): CallToken | null {
  try {
    const d = jwt.verify(token, CONFIG.jwtSecret) as Record<string, unknown>;
    if (d?.t !== "nabilcall") return null;
    const { restaurantId, slug, callSid, to, from, sttModel, ttsVoice } = d;
    if ([restaurantId, slug, callSid, to, from].every((v) => typeof v === "string")) {
      return {
        restaurantId,
        slug,
        callSid,
        to,
        from,
        sttModel: typeof sttModel === "string" ? sttModel : null,
        ttsVoice: typeof ttsVoice === "string" ? ttsVoice : null,
      } as CallToken;
    }
    return null;
  } catch {
    return null;
  }
}
