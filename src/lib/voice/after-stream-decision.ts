/**
 * What the Media Streams <Connect action> route does when a stream ends — as a
 * pure decision so it is unit-tested rather than re-derived from a race.
 *
 * Before A1 (2026-08-22) the route read `VoiceCall.transferReason` with three
 * 300 ms retries and, finding nothing, REDIRECTED the caller into a brand-new
 * ConversationRelay greeting — the right move only when the stream never
 * established, and the wrong one whenever the end record was simply slower
 * than the POST. The service now writes the hand-off reason BEFORE ending the
 * session, and this table separates "no row at all" from "row, no reason".
 */
export type AfterStreamDecision =
  | { action: "hangup_time_limit" }
  | { action: "hangup_spam" }
  | { action: "dial_store"; why: "transfer" | "stream_died" }
  | { action: "relay_fallback"; why: "no_row" | "legacy_no_reason" };

export function decideAfterStream(input: {
  /** VoiceCall.transferReason for this callSid, "" when none. */
  reason: string;
  /** A VoiceCall row exists for this callSid (the stream established a session). */
  rowExists: boolean;
  /** Channel feature flag `after_stream_decision_table` for this number's lane. */
  decisionTableOn: boolean;
}): AfterStreamDecision {
  const reason = (input.reason || "").trim();
  if (reason === "call_time_limit") return { action: "hangup_time_limit" };
  if (reason === "spam") return { action: "hangup_spam" };
  if (reason) return { action: "dial_store", why: "transfer" };
  if (!input.rowExists) return { action: "relay_fallback", why: "no_row" };
  // The stream ran (we have a row) but the session ended without a hand-off
  // reason — a pipeline/process death. The caller is still on the line: ring
  // the store. (Legacy behaviour, kept behind the flag until promoted: a fresh
  // ConversationRelay greeting.)
  return input.decisionTableOn ? { action: "dial_store", why: "stream_died" } : { action: "relay_fallback", why: "legacy_no_reason" };
}
