/**
 * The per-call EVENT LOG — what actually happened, in order, with timings.
 *
 * Until 2026-08-15 the only record of a call was the spoken transcript. Tool
 * calls, tool results, what the cart held at each step, how long each hop
 * took and which prompt/tool versions were live were all invisible, so a
 * failed call took hours of reading to reconstruct (and some of it could not
 * be reconstructed at all: the 4× add_combo on the last failed call was found
 * by inference from the tool-timing summary). Every event here is persisted
 * by the app (VoiceCallEvent) and rendered as the admin call timeline.
 *
 * Payloads are REDACTED server-side before storage; the service still keeps
 * card numbers out entirely (it never handles them) and never logs the
 * Anthropic key or the internal secret.
 */
export type CallEventBase = { seq: number; ts: string; turn: number | null };

export type CallEvent = CallEventBase &
  (
    | { type: "call_start"; versions: Record<string, unknown>; from: string | null; to: string | null }
    | { type: "asr"; text: string; lang: string | null; synthetic: boolean }
    | { type: "model_text"; text: string; hop: number; interrupted: boolean }
    | { type: "tool_use"; hop: number; toolUseId: string; name: string; input: unknown; cartHashBefore: string | null }
    | {
        type: "tool_result";
        hop: number;
        toolUseId: string;
        name: string;
        ok: boolean;
        code: string | null;
        ms: number;
        output: unknown;
        cartHashAfter: string | null;
      }
    | { type: "cart"; hash: string; lines: unknown; problems: unknown; fulfilment: unknown }
    | { type: "filler"; hop: number; tool: string | null; afterMs: number; phrase: string; kind?: "tool" | "thinking" }
    | { type: "interrupt"; heard: string | null; stale: boolean; duringProtected: boolean }
    | { type: "protected_respoken"; text: string }
    | { type: "narration_dropped"; text: string }
    /** A duplicated bare ack the post-filler de-dup removed from the reply's
     *  opening ("Got it," after the filler already said an ack). `dropped` is
     *  the removed opener — short by construction (ACK_HOLD_MAX). */
    | { type: "ack_stripped"; dropped: string }
    /** Digits the model wrote were turned into words before the voice heard
     *  them (spoken-numbers.ts). Count only: the raw text is already in the
     *  turn's `model_text` (redacted app-side), the pass is deterministic, and
     *  a phone number in WORDS would slip past the digit-shaped redaction. */
    | { type: "numbers_verbalized"; count: number }
    | { type: "tail_fragment"; text: string; early?: boolean }
    | { type: "greeting_echo_dropped"; text: string }
    | { type: "compaction"; droppedMessages: number; bytesBefore: number; bytesAfter: number }
    | { type: "cache_miss"; request: number; uncached: number }
    | { type: "hallucination_suspect"; kind: string; sentence: string; evidence: string[] }
    | {
        type: "turn";
        turnId: string;
        utterance: string;
        synthetic: boolean;
        hops: Array<{
          hop: number;
          ttftMs: number | null;
          totalMs: number;
          stop: string | null;
          tokensIn: number;
          tokensOut: number;
          cacheRead: number;
          cacheWrite: number;
        }>;
        tools: Array<{ name: string; ms: number; ok: boolean }>;
        ttfaMs: number | null;
        filler: { phrase: string; afterMs: number } | null;
        interrupted: boolean;
        spoken: string;
        cartHashBefore: string | null;
        cartHashAfter: string | null;
        stateChars: number;
        messagesEstTokens: number;
        /** The bookkeeping merge ended the turn after hop 1 (no second model request). */
        mergedBookkeeping?: boolean;
      }
    | { type: "call_end"; outcome: string; latency: unknown; usage: unknown; costCents: number }
    | { type: "error"; where: string; message: string }
  );

export type CallEventInput = CallEvent extends infer E ? (E extends CallEventBase ? Omit<E, "seq" | "ts"> : never) : never;

/** Where events go. The session buffers and the app persists; tests inspect. */
export interface EventSink {
  emit(ev: CallEventInput): void;
  /** Everything emitted so far (the session drains this into call-log flushes). */
  drain(): CallEvent[];
  size(): number;
}

/** Cap on payload size per event so one enormous tool result cannot bloat a
 *  call record. Anything larger is truncated with a marker — the timeline
 *  shows enough to understand, and the full transcript is elsewhere. */
export const MAX_EVENT_PAYLOAD_CHARS = 8_000;
export const MAX_EVENTS_PER_CALL = 600;

export function truncateJson(v: unknown, max = MAX_EVENT_PAYLOAD_CHARS): unknown {
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    return String(v).slice(0, max);
  }
  if (s === undefined) return v;
  if (s.length <= max) return v;
  return { _truncated: true, _chars: s.length, preview: s.slice(0, max) };
}

export function createEventSink(now: () => number = Date.now): EventSink {
  const buf: CallEvent[] = [];
  let seq = 0;
  let dropped = 0;
  return {
    emit(ev) {
      if (seq >= MAX_EVENTS_PER_CALL) {
        dropped++;
        return;
      }
      seq++;
      const full = { ...(ev as any), seq, ts: new Date(now()).toISOString() } as CallEvent;
      // Trim the big payload fields in place.
      const anyEv = full as any;
      for (const k of ["input", "output", "lines", "problems", "fulfilment", "versions", "latency", "usage"]) {
        if (k in anyEv) anyEv[k] = truncateJson(anyEv[k]);
      }
      buf.push(full);
      if (seq === MAX_EVENTS_PER_CALL) {
        console.warn("[nabil-voice] event cap reached; further events dropped", { dropped });
      }
    },
    drain() {
      return buf.splice(0);
    },
    size() {
      return buf.length;
    },
  };
}
