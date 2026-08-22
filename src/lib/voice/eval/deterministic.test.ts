/**
 * Phase D — the deterministic evaluator, pinned on the 2026-08-21 failure
 * classes (src/lib/voice/eval/deterministic.ts).
 */
import { describe, expect, it } from "vitest";
import { DEAD_AIR_MS, EVALUATOR_VERSION, evaluateCall, type CallFacts, type EvalEvent } from "./deterministic";

let seq = 0;
const ev = (type: string, payload: Record<string, unknown> = {}, turn: number | null = null): EvalEvent => ({ seq: ++seq, turn, type, payload });
const reset = () => {
  seq = 0;
};
const facts = (over: Partial<CallFacts> = {}): CallFacts => ({ outcome: "order_placed", orderId: "o1", quotedTotal: 24.5, chargedTotal: 24.5, transferReason: null, durationSeconds: 120, sentiment: "neutral", ...over });

function cleanOrder(): EvalEvent[] {
  reset();
  return [
    ev("call_start", {}, 0),
    ev("asr", { text: "Pickup, one large pepperoni." }, 1),
    ev("tool_result", { name: "set_fulfilment", ok: true }, 1),
    ev("tool_result", { name: "add_to_order", ok: true }, 1),
    ev("turn", { ttfaMs: 2100, spoken: "Pickup it is — one large pepperoni. Anything else?", cartHashBefore: "a", cartHashAfter: "b" }, 1),
    ev("asr", { text: "That's it, I'm Marco." }, 2),
    ev("tool_result", { name: "set_customer", ok: true }, 2),
    ev("tool_result", { name: "quote_order", ok: true }, 2),
    ev("turn", { ttfaMs: 1900, spoken: "Your total is twenty-four fifty. Shall I place it?", cartHashBefore: "b", cartHashAfter: "b" }, 2),
    ev("asr", { text: "Yes." }, 3),
    ev("tool_result", { name: "place_order", ok: true, output: { ok: true } }, 3),
    ev("turn", { ttfaMs: 1500, spoken: "All set, see you soon!", cartHashBefore: "b", cartHashAfter: "c" }, 3),
    ev("call_end", { outcome: "order_placed", cartLines: 0 }, 3),
  ];
}

describe("a clean placed order", () => {
  it("scores high, needs no review, counts the one real clarification", () => {
    const r = evaluateCall(cleanOrder(), facts());
    expect(r.evaluatorVersion).toBe(EVALUATOR_VERSION);
    expect(r.detScore).toBeGreaterThanOrEqual(90);
    expect(r.needsReview).toBe(false);
    expect(r.abandonClass).toBeNull();
    expect(r.transferStuck).toBe(false);
    expect(r.counters.userTurns).toBe(3);
    expect(r.counters.clarifications).toBe(1); // "Shall I place it?" moved nothing
    expect(r.findings).toEqual([]);
  });
});

describe("the 2026-08-21 failure classes", () => {
  it("dead air ≥ 8 s + a 'Hello?' probe → findings, latency axis drops, review", () => {
    reset();
    const events = [
      ev("asr", { text: "Hi, a large pepperoni please." }, 1),
      ev("turn", { ttfaMs: DEAD_AIR_MS + 4_000, spoken: "One large pepperoni — anything else?", cartHashBefore: "a", cartHashAfter: "b" }, 1),
      ev("asr", { text: "Hello?" }, 2),
      ev("turn", { ttfaMs: 1000, spoken: "I'm here!", cartHashBefore: "b", cartHashAfter: "b" }, 2),
      ev("call_end", { outcome: "abandoned_with_cart", cartLines: 1 }, 2),
    ];
    const r = evaluateCall(events, facts({ outcome: "abandoned_with_cart", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(r.counters.deadAirTurns).toBe(1);
    expect(r.findings.map((f) => f.code)).toContain("dead_air");
    expect(r.findings.map((f) => f.code)).toContain("caller_probe_after_silence");
    expect(r.axes.latency).toBeLessThan(70);
    expect(r.abandonClass).toBe("abandon_mid_order");
    expect(r.needsReview).toBe(true);
  });

  it("transfer_stuck: a turn after a successful hand-off caps the score at 20", () => {
    reset();
    const events = [
      ev("asr", { text: "Can I talk to a person?" }, 1),
      ev("tool_result", { name: "transfer_to_human", ok: true, output: { ok: true, transferred: true } }, 1),
      ev("turn", { ttfaMs: 1200, spoken: "Connecting you now.", cartHashBefore: "a", cartHashAfter: "a" }, 1),
      ev("asr", { text: "Hello? Are you still there?" }, 2),
      ev("turn", { ttfaMs: 1500, spoken: "Still connecting you…", cartHashBefore: "a", cartHashAfter: "a" }, 2),
      ev("call_end", { outcome: "transferred", cartLines: 0 }, 2),
    ];
    const r = evaluateCall(events, facts({ outcome: "transferred", orderId: null, quotedTotal: null, chargedTotal: null, transferReason: "caller asked for a person" }));
    expect(r.transferStuck).toBe(true);
    expect(r.detScore).toBeLessThanOrEqual(20);
    expect(r.reviewReasons).toContain("transfer_stuck");
  });

  it("quoted ≠ charged on a placed order is critical and caps at 30", () => {
    const r = evaluateCall(cleanOrder(), facts({ quotedTotal: 24.5, chargedTotal: 27.1 }));
    expect(r.totalsMismatch).toBe(true);
    expect(r.detScore).toBeLessThanOrEqual(30);
    expect(r.findings[0].code).toBe("totals_mismatch");
    expect(r.findings[0].severity).toBe("critical");
  });

  it("tool errors: a self-corrected needs_info is weak, an unresolved hard failure is not", () => {
    reset();
    const events = [
      ev("asr", { text: "A large with everything." }, 1),
      ev("tool_result", { name: "add_to_order", ok: false, code: "needs_info" }, 1),
      ev("tool_result", { name: "add_to_order", ok: true }, 1),
      ev("turn", { ttfaMs: 2000, spoken: "Added.", cartHashBefore: "a", cartHashAfter: "b" }, 1),
      ev("asr", { text: "Deliver it." }, 2),
      ev("tool_result", { name: "set_fulfilment", ok: false, code: "tool_exception" }, 2),
      ev("turn", { ttfaMs: 2000, spoken: "Hmm, that didn't work.", cartHashBefore: "b", cartHashAfter: "b" }, 2),
      ev("call_end", { outcome: "abandoned_with_cart", cartLines: 1 }, 2),
    ];
    const r = evaluateCall(events, facts({ outcome: "abandoned_with_cart", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(r.counters.toolErrors).toBe(2);
    const codes = r.findings.map((f) => `${f.code}/${f.severity}`);
    expect(codes).toContain("tool_error:tool_exception/medium");
    expect(codes).not.toContain("tool_error:needs_info/medium");
    expect(r.axes.tools).toBeLessThan(100);
  });

  it("abandon classes: greeting hangup, silent caller, info only, after quote, cap", () => {
    reset();
    const greeting = evaluateCall([ev("call_start", {}, 0), ev("call_end", { outcome: "abandoned", cartLines: 0 }, 0)], facts({ outcome: "abandoned", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(greeting.abandonClass).toBe("hangup_at_greeting");
    reset();
    const silent = evaluateCall([ev("no_input", { stage: "reprompt" }, 0), ev("no_input", { stage: "close" }, 1), ev("call_end", { outcome: "abandoned", cartLines: 0 }, 1)], facts({ outcome: "abandoned", orderId: null, quotedTotal: null, chargedTotal: null, transferReason: "no_input" }));
    expect(silent.abandonClass).toBe("silent_caller");
    reset();
    const info = evaluateCall([ev("asr", { text: "What time do you close?" }, 1), ev("turn", { ttfaMs: 1500, spoken: "Ten tonight.", cartHashBefore: "a", cartHashAfter: "a" }, 1), ev("asr", { text: "Thanks." }, 2), ev("turn", { ttfaMs: 1200, spoken: "Welcome!", cartHashBefore: "a", cartHashAfter: "a" }, 2), ev("call_end", { outcome: "faq_answered", cartLines: 0 }, 2)], facts({ outcome: "faq_answered", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(info.abandonClass).toBe("info_only");
    expect(info.detScore).toBeGreaterThanOrEqual(80);
    reset();
    const afterQuote = evaluateCall([ev("asr", { text: "Large pepperoni, pickup, Marco." }, 1), ev("tool_result", { name: "quote_order", ok: true }, 1), ev("turn", { ttfaMs: 2000, spoken: "That's thirty dollars. Place it?", cartHashBefore: "a", cartHashAfter: "b" }, 1), ev("call_end", { outcome: "abandoned_with_cart", cartLines: 1 }, 1)], facts({ outcome: "abandoned_with_cart", orderId: null, quotedTotal: 30, chargedTotal: null }));
    expect(afterQuote.abandonClass).toBe("abandon_after_quote");
    reset();
    const cap = evaluateCall([ev("asr", { text: "…" }, 1), ev("call_end", { outcome: "abandoned", cartLines: 0 }, 1)], facts({ outcome: "abandoned", orderId: null, quotedTotal: null, chargedTotal: null, transferReason: "call_time_limit" }));
    expect(cap.abandonClass).toBe("cap_hangup");
  });

  it("record loss → infra, unscored; robocall → unscored info", () => {
    reset();
    const lost = evaluateCall([], facts({ outcome: "dropped", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(lost.detScore).toBeNull();
    expect(lost.failureClass).toBe("infra");
    expect(lost.reviewReasons).toContain("infra");
    reset();
    const bot = evaluateCall([ev("robocall_detected", { text: "press one" }, 0), ev("call_end", { outcome: "spam" }, 0)], facts({ outcome: "spam", orderId: null, quotedTotal: null, chargedTotal: null }));
    expect(bot.detScore).toBeNull();
    expect(bot.needsReview).toBe(false);
  });
});

describe("a CLEAN transfer is not 'stuck'", () => {
  it("the hand-off turn's own closing sentence and a caller 'thanks' in the same turn are fine; only a LATER turn counts", () => {
    reset();
    const events = [
      ev("asr", { text: "Can I talk to a person?" }, 1),
      ev("tool_result", { name: "transfer_to_human", ok: true, output: { ok: true, transferred: true } }, 1),
      ev("transfer_handoff", { reason: "caller asked for a person", outcome: "handoff_written" }, 1),
      ev("turn", { ttfaMs: 1200, spoken: "Connecting you to a team member now.", cartHashBefore: "a", cartHashAfter: "a" }, 1),
      ev("call_end", { outcome: "transferred", cartLines: 0, droppedAfterEnd: 1 }, 1),
    ];
    const r = evaluateCall(events, facts({ outcome: "transferred", orderId: null, quotedTotal: null, chargedTotal: null, transferReason: "caller asked for a person" }));
    expect(r.transferStuck).toBe(false);
    expect(r.findings.map((f) => f.code)).not.toContain("transfer_stuck");
    expect(r.detScore).toBeGreaterThanOrEqual(85);
  });
});
