/**
 * Pure body validation for /api/internal/voice/call-log
 * (event: "start" | "end" | "events" | "menu-snapshot").
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
  toolName?: string;
  ok?: boolean;
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
  transferredAt: Date | null;
  billableSeconds: number | null;
  transcript: TranscriptTurn[] | undefined;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Priced by the voice service, which is the only place that sees the
   *  prompt-cache split (writes 1.25×, reads 0.1×). Recomputing it from
   *  tokensIn alone would bill cached reads at the full input rate. */
  costCents: number | null;
  durationSeconds: number | null;
  /** The total spoken to the caller, and the one actually charged. Equal on a
   *  healthy call; a difference means someone agreed to a price we didn't bill. */
  quotedTotal: number | null;
  /** Measured wait times for this call — see VoiceCall.latency. Shape-checked,
   *  not trusted: it is written by the voice service and rendered to an owner. */
  latency: LatencyBlob | null;
  chargedTotal: number | null;
  /** §27 versions block → VoiceCall.agentVersion/promptVersion/toolsVersion/menuSnapshotHash. */
  versions: VersionsData | null;
  menuSnapshotHash: string | null;
  /** The tail of the event log (whatever the last mid-call flush didn't send).
   *  Same parse + write path as event:"events". */
  events: ParsedEvent[];
}

/** The subset of the service's `versions` we store as columns (the rest —
 *  model, modelConfig, cfgHash, sttModel, ttsVoice — lives in the call_start
 *  event payload, which is what the timeline header reads). */
export interface VersionsData {
  agentVersion: string | null;
  promptVersion: string | null;
  toolsVersion: string | null;
  menuSnapshotHash: string | null;
}

/** One validated event, ready for the VoiceCallEvent row (minus callId). */
export interface ParsedEvent {
  seq: number;
  ts: Date;
  turn: number | null;
  type: string;
  /** Everything else on the event (type-specific fields), size-capped and
   *  NOT yet redacted — the route redacts right before the write. */
  payload: { [k: string]: JsonValue };
  latencyMs: number | null;
  cartHash: string | null;
}

export interface EventsData {
  callSid: string;
  restaurantId: string;
  events: ParsedEvent[];
}

export interface MenuSnapshotData {
  restaurantId: string;
  hash: string;
  payload: { [k: string]: JsonValue } | JsonValue[];
}

/** Closed set — mirrors services/nabil-voice/src/events.ts CallEvent["type"]. */
export const EVENT_TYPES = new Set([
  "call_start",
  "asr",
  "model_text",
  "tool_use",
  "tool_result",
  "cart",
  "filler",
  "interrupt",
  "protected_respoken",
  "compaction",
  "cache_miss",
  "hallucination_suspect",
  // Added 2026-08-16 — the service had emitted narration_dropped and
  // tail_fragment since round 3/4 but this closed set silently dropped them
  // (the "written but never read" class); numbers_verbalized is new.
  "narration_dropped",
  "tail_fragment",
  "numbers_verbalized",
  "greeting_echo_dropped",
  // Added 2026-08-20 with the post-filler ack de-dup (session.ts): the opener
  // the stripper removed, so a transcript that differs from model history by
  // a leading "Got it," stays auditable in the timeline.
  "ack_stripped",
  "turn",
  "call_end",
  "error",
]);

/** Same caps as the service (events.ts MAX_EVENTS_PER_CALL / MAX_EVENT_PAYLOAD_CHARS)
 *  — enforced again here because the service is not the trust boundary. */
export const MAX_EVENTS_PER_BODY = 600;
export const MAX_EVENT_PAYLOAD_CHARS = 8_000;
/** A menu snapshot is bounded by the menu; 2 MB is far past any real store. */
export const MAX_MENU_SNAPSHOT_CHARS = 2_000_000;

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

function parseOptionalIso(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Money, not a count — deliberately NOT nonNegInt, which would floor $25.97 to
 *  $25 and quietly turn a two-dollar-sixty divergence into a three-dollar one. */
function money(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000) return null;
  return Math.round(v * 100) / 100;
}

/** Cap on the serialized latency blob. It is bounded by construction (a fixed
 *  set of numbers plus the five slowest tools), but this is a whitelist-shaped
 *  parser and an unbounded JSON column on a per-call row is how a payload
 *  becomes a storage problem. */
const MAX_LATENCY_CHARS = 4000;

/** Values a Json column can actually hold. Same reason TranscriptTurn is a type
 *  alias rather than an interface: Prisma's InputJsonValue will not accept
 *  `unknown`, and an interface has no implicit index signature. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type LatencyBlob = { [k: string]: JsonValue };

/** Accept a plain JSON object, reject arrays, primitives and anything oversized.
 *  Deliberately no key whitelist: this blob is diagnostics written by our own
 *  voice service, it carries no PII (durations and token counts only), and it
 *  is rendered as formatted numbers rather than as text. The round-trip through
 *  JSON.stringify/parse is what actually enforces "plain JSON" — it drops
 *  functions and undefined, and throws on anything circular. */
function plainObject(v: unknown, maxChars: number): LatencyBlob | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  try {
    const json = JSON.stringify(v);
    if (json.length > maxChars) return null;
    return JSON.parse(json) as LatencyBlob;
  } catch {
    return null; // circular or unserializable
  }
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
      const ms = Date.parse(t.ts);
      if (!Number.isNaN(ms)) turn.ts = ms;
    }
    if (role === "tool") {
      const tn = str(t.toolName, 40);
      if (tn) turn.toolName = tn;
      if (typeof t.ok === "boolean") turn.ok = t.ok;
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
  const versions = parseVersions(body.versions);

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
      transferredAt: parseOptionalIso(body.transferredAtIso),
      billableSeconds: nonNegInt(body.billableSeconds),
      transcript: capTranscript(body.transcript),
      model: str(body.model, 100),
      costCents: nonNegInt(body.costCents),
      tokensIn: nonNegInt(body.tokensIn),
      tokensOut: nonNegInt(body.tokensOut),
      durationSeconds: nonNegInt(body.durationSeconds),
      quotedTotal: money(body.quotedTotal),
      latency: plainObject(body.latency, MAX_LATENCY_CHARS),
      chargedTotal: money(body.chargedTotal),
      versions,
      // Top-level menuSnapshotHash wins; the versions block carries the same
      // value on a healthy service, so either alone is enough.
      menuSnapshotHash: str(body.menuSnapshotHash, 64) ?? versions?.menuSnapshotHash ?? null,
      events: parseEvents(body.events),
    },
  };
}

/** The four version fields we store as columns. Non-object → null (an
 *  un-upgraded voice service sends none, and the columns simply stay null). */
export function parseVersions(v: unknown): VersionsData | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: VersionsData = {
    agentVersion: str(o.agentVersion, 120),
    promptVersion: str(o.promptVersion, 120),
    toolsVersion: str(o.toolsVersion, 120),
    menuSnapshotHash: str(o.menuSnapshotHash, 64),
  };
  return out.agentVersion || out.promptVersion || out.toolsVersion || out.menuSnapshotHash ? out : null;
}

/** Keys lifted OFF the event into typed columns; everything else is payload. */
const EVENT_ENVELOPE_KEYS = new Set(["seq", "ts", "turn", "type"]);

/** Truncate every string over `max` chars inside a JSON value, in place on a
 *  fresh copy, with a visible marker so a reader knows something is missing. */
function truncateStrings(v: JsonValue, max: number): JsonValue {
  if (typeof v === "string") {
    if (v.length <= max) return v;
    return `${cut(v, max)}…[truncated ${v.length - max} chars]`;
  }
  if (Array.isArray(v)) return v.map((x) => truncateStrings(x, max));
  if (v && typeof v === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(v)) out[k] = truncateStrings(v[k], max);
    return out;
  }
  return v;
}

/**
 * Bound one event's payload to MAX_EVENT_PAYLOAD_CHARS of JSON. First pass
 * shortens long strings (a huge tool output, a runaway model_text); if it is
 * STILL over — many medium strings — the payload collapses to a preview with
 * a marker, same shape the service uses (`_truncated`). Never throws: a
 * circular/unserializable payload becomes `{ _unserializable: true }`.
 */
export function capEventPayload(p: Record<string, unknown>): { [k: string]: JsonValue } {
  let json: string;
  try {
    json = JSON.stringify(p);
  } catch {
    return { _unserializable: true };
  }
  if (json.length <= MAX_EVENT_PAYLOAD_CHARS) return JSON.parse(json);
  const total = json.length;
  for (const perString of [2000, 400]) {
    const trimmed = truncateStrings(JSON.parse(json), perString) as { [k: string]: JsonValue };
    const j2 = JSON.stringify(trimmed);
    if (j2.length <= MAX_EVENT_PAYLOAD_CHARS) return trimmed;
  }
  return { _truncated: true, _chars: total, preview: cut(json, MAX_EVENT_PAYLOAD_CHARS - 200) };
}

/** ISO string or epoch millis → Date; anything else → null. */
function eventTs(v: unknown): Date | null {
  let d: Date | null = null;
  if (typeof v === "string" && v.length <= 40) d = new Date(v);
  else if (typeof v === "number" && Number.isFinite(v)) d = new Date(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

/** The typed columns each event type contributes (see the schema comment):
 *  latencyMs = the one duration the timeline sorts/filters on, cartHash = the
 *  cart the event left behind (or, for tool_use, the one it started from). */
function eventLatencyMs(type: string, e: Record<string, unknown>): number | null {
  switch (type) {
    case "tool_result":
      return nonNegInt(e.ms);
    case "turn":
      return nonNegInt(e.ttfaMs);
    case "filler":
      return nonNegInt(e.afterMs);
    default:
      return null;
  }
}
function eventCartHash(type: string, e: Record<string, unknown>): string | null {
  switch (type) {
    case "cart":
      return str(e.hash, 64);
    case "tool_use":
      return str(e.cartHashBefore, 64);
    case "tool_result":
    case "turn":
      return str(e.cartHashAfter, 64);
    default:
      return null;
  }
}

/**
 * Validate an events[] array: whitelisted type, integer seq (deduped within
 * the body — first wins), coerced ts, int|null turn, payload capped. Malformed
 * entries are DROPPED (never fail the whole flush — the good events still
 * land), and the body is capped at MAX_EVENTS_PER_BODY. Non-array → [].
 */
export function parseEvents(v: unknown): ParsedEvent[] {
  if (!Array.isArray(v)) return [];
  const out: ParsedEvent[] = [];
  const seen = new Set<number>();
  for (const raw of v) {
    if (out.length >= MAX_EVENTS_PER_BODY) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const e = raw as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : null;
    if (!type || !EVENT_TYPES.has(type)) continue;
    const seq = typeof e.seq === "number" && Number.isInteger(e.seq) && e.seq >= 0 && e.seq < 1_000_000 ? e.seq : null;
    if (seq === null || seen.has(seq)) continue;
    const ts = eventTs(e.ts);
    if (!ts) continue;
    const turn = typeof e.turn === "number" && Number.isInteger(e.turn) && e.turn >= 0 ? e.turn : null;
    const rest: Record<string, unknown> = {};
    for (const k of Object.keys(e)) if (!EVENT_ENVELOPE_KEYS.has(k)) rest[k] = e[k];
    seen.add(seq);
    out.push({
      seq,
      ts,
      turn,
      type,
      payload: capEventPayload(rest),
      latencyMs: eventLatencyMs(type, e),
      cartHash: eventCartHash(type, e),
    });
  }
  return out;
}

/** Parse the mid-call "events" flush body. */
export function parseEventsBody(b: unknown): ParseResult<EventsData> {
  const body = (b ?? {}) as Record<string, unknown>;
  const callSid = str(body.callSid, MAX_ID_CHARS);
  const restaurantId = str(body.restaurantId, MAX_ID_CHARS);
  if (!callSid || !restaurantId) return { ok: false, error: "Missing callSid/restaurantId" };
  if (!Array.isArray(body.events)) return { ok: false, error: "Missing events[]" };
  return { ok: true, data: { callSid, restaurantId, events: parseEvents(body.events) } };
}

/** Parse the "menu-snapshot" body: hash (16–64 hex-ish chars) + a JSON payload
 *  (object or array), size-capped. */
export function parseMenuSnapshotBody(b: unknown): ParseResult<MenuSnapshotData> {
  const body = (b ?? {}) as Record<string, unknown>;
  const restaurantId = str(body.restaurantId, MAX_ID_CHARS);
  const hash = str(body.hash, 64);
  if (!restaurantId) return { ok: false, error: "Missing restaurantId" };
  if (!hash || !/^[A-Za-z0-9_-]{8,64}$/.test(hash)) return { ok: false, error: "Invalid hash" };
  const p = body.payload;
  if (!p || typeof p !== "object") return { ok: false, error: "Missing payload" };
  let json: string;
  try {
    json = JSON.stringify(p);
  } catch {
    return { ok: false, error: "Unserializable payload" };
  }
  if (json.length > MAX_MENU_SNAPSHOT_CHARS) return { ok: false, error: "Payload too large" };
  return { ok: true, data: { restaurantId, hash, payload: JSON.parse(json) } };
}
