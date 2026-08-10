/**
 * Pure body validation for /api/internal/voice/call-log (event: "start" | "end").
 *
 * Kept free of prisma / Next imports so the parsing rules are unit-testable
 * (validation.test.ts) without a database. The route trusts the voice service
 * (x-internal-key), but the payload still crosses a network boundary from an
 * always-on process that talks to an LLM — so every field is whitelisted and
 * type-checked, and the transcript is capped defensively before it becomes a
 * Json column value.
 */

/** Outcome taxonomy — see prisma VoiceCall.outcome doc comment. */
const OUTCOMES = new Set([
  "order_placed",
  "reservation_booked",
  "faq_answered",
  "transferred",
  "abandoned",
  "spam",
  "error",
]);

/** Defensive caps: a voice call is minutes long; anything past this is garbage. */
export const MAX_TRANSCRIPT_TURNS = 400;
export const MAX_TURN_TEXT_CHARS = 2000;

const MAX_ID_CHARS = 200;
const MAX_REASON_CHARS = 500;

// Type alias (NOT an interface) on purpose: aliases get an implicit index
// signature, which Prisma's InputJsonValue needs for the Json column write.
export type TranscriptTurn = {
  role: string;
  text: string;
  ts?: number;
};

export interface StartData {
  callSid: string;
  restaurantId: string;
  fromNumber: string;
  toNumber: string;
  startedAt: Date;
}

export interface EndData {
  callSid: string;
  restaurantId: string;
  fromNumber: string;
  toNumber: string;
  language: string | null;
  outcome: string;
  orderId: string | null;
  orderNumber: string | null;
  reservationId: string | null;
  reservationCode: string | null;
  customerId: string | null;
  transferReason: string | null;
  transcript: TranscriptTurn[] | undefined;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  durationSeconds: number | null;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Cap on a safe UTF-16 boundary. A plain slice() can land inside a surrogate
 * pair (emoji, astral CJK) and leave a lone high surrogate; Postgres's jsonb
 * parser rejects that ("Unicode low surrogate must follow a high surrogate"),
 * which would fail the ENTIRE end-event write and lose the whole call record.
 */
function cut(s: string, max: number): string {
  const t = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return cut(t, max);
}

function nonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

/**
 * Parse the "start" body. startedAtIso must be a real timestamp: the whole
 * point of the start event is fixing the historical startedAt≈endedAt bug
 * (row used to be created at hangup), so garbage here is rejected rather
 * than silently replaced with "now".
 */
export function parseStartBody(b: unknown): ParseResult<StartData> {
  const body = (b ?? {}) as Record<string, unknown>;
  const callSid = str(body.callSid, MAX_ID_CHARS);
  const restaurantId = str(body.restaurantId, MAX_ID_CHARS);
  if (!callSid || !restaurantId) return { ok: false, error: "Missing callSid/restaurantId" };

  const iso = str(body.startedAtIso, 64);
  if (!iso) return { ok: false, error: "Missing startedAtIso" };
  const startedAt = new Date(iso);
  if (Number.isNaN(startedAt.getTime())) return { ok: false, error: "Invalid startedAtIso" };
  // Plausibility window: not before the product existed, not meaningfully in
  // the future (small clock skew tolerated).
  if (startedAt.getTime() < Date.parse("2025-01-01T00:00:00Z") || startedAt.getTime() > Date.now() + 5 * 60_000) {
    return { ok: false, error: "startedAtIso out of range" };
  }

  return {
    ok: true,
    data: {
      callSid,
      restaurantId,
      fromNumber: str(body.fromNumber, MAX_ID_CHARS) ?? "",
      toNumber: str(body.toNumber, MAX_ID_CHARS) ?? "",
      startedAt,
    },
  };
}

/**
 * Cap + sanitize the transcript ([{role, text, ts}]). Non-array → undefined
 * (field left untouched); malformed turns are dropped; text capped per turn.
 */
export function capTranscript(v: unknown): TranscriptTurn[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: TranscriptTurn[] = [];
  for (const raw of v) {
    if (out.length >= MAX_TRANSCRIPT_TURNS) break;
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const role = str(t.role, 20);
    const text = typeof t.text === "string" ? cut(t.text, MAX_TURN_TEXT_CHARS) : null;
    if (!role || text === null) continue;
    const turn: TranscriptTurn = { role, text };
    if (typeof t.ts === "number" && Number.isFinite(t.ts)) turn.ts = t.ts;
    else if (typeof t.ts === "string" && t.ts.length <= 40) {
      // The voice service stamps ISO strings (session.ts) — normalize to epoch
      // millis so the stored shape stays uniformly [{ role, text, ts:number }].
      // Normalizing on ingest means an un-upgraded voice service keeps working.
      const ms = Date.parse(t.ts);
      if (!Number.isNaN(ms)) turn.ts = ms;
    }
    out.push(turn);
  }
  return out;
}

/**
 * Parse the "end" body: ONLY the contract's whitelisted fields, each
 * type-validated. Unknown fields are dropped, never spread into the DB write.
 */
export function parseEndBody(b: unknown): ParseResult<EndData> {
  const body = (b ?? {}) as Record<string, unknown>;
  const callSid = str(body.callSid, MAX_ID_CHARS);
  const restaurantId = str(body.restaurantId, MAX_ID_CHARS);
  if (!callSid || !restaurantId) return { ok: false, error: "Missing callSid/restaurantId" };

  const rawOutcome = str(body.outcome, 40);

  return {
    ok: true,
    data: {
      callSid,
      restaurantId,
      fromNumber: str(body.fromNumber, MAX_ID_CHARS) ?? "",
      toNumber: str(body.toNumber, MAX_ID_CHARS) ?? "",
      language: str(body.language, 20),
      outcome: rawOutcome && OUTCOMES.has(rawOutcome) ? rawOutcome : "abandoned",
      orderId: str(body.orderId, MAX_ID_CHARS),
      orderNumber: str(body.orderNumber, MAX_ID_CHARS),
      reservationId: str(body.reservationId, MAX_ID_CHARS),
      reservationCode: str(body.reservationCode, MAX_ID_CHARS),
      customerId: str(body.customerId, MAX_ID_CHARS),
      transferReason: str(body.transferReason, MAX_REASON_CHARS),
      transcript: capTranscript(body.transcript),
      model: str(body.model, 100),
      tokensIn: nonNegInt(body.tokensIn),
      tokensOut: nonNegInt(body.tokensOut),
      durationSeconds: nonNegInt(body.durationSeconds),
    },
  };
}
