/**
 * DETERMINISTIC CALL EVALUATOR (Phase D part 1, 2026-08-22) — a model-free
 * score computed from the per-call event log. Pure: the same function grades
 * a production call (VoiceCallEvent rows) and a sim run (the recording
 * sink), so every detector here is automatically a sim assertion.
 *
 * Detectors come straight from the 2026-08-21 evidence (52 calls):
 *   dead air ≥ 8 s (C2/C3) · caller probes ("Hello?") into silence ·
 *   transfer_stuck — any turn after a successful hand-off (C1) ·
 *   tool errors by code, self-corrected ones weighted low ·
 *   clarifications (a question that moved nothing) ·
 *   interrupts / respoken protected sentences (C28) ·
 *   hallucination flags by kind (informational until precision is measured) ·
 *   quoted ≠ charged on a placed order · no-input closes · robocall/IVR ·
 *   abandon classification (decomposes the 30–45 % "abandoned") ·
 *   record_loss → failureClass infra, score null.
 *
 * Composite: 0.40 order + 0.20 conversation + 0.15 audio + 0.15 tools +
 * 0.10 latency, with hard caps (transfer_stuck ≤ 20, totals mismatch ≤ 30).
 * `detScore` never depends on a model, so history stays comparable.
 */
export const EVALUATOR_VERSION = "det-1.0.0";

export type EvalEvent = {
  seq: number;
  turn: number | null;
  type: string;
  payload: Record<string, unknown>;
  latencyMs?: number | null;
};

export type CallFacts = {
  outcome: string | null;
  orderId: string | null;
  quotedTotal: number | null;
  chargedTotal: number | null;
  transferReason: string | null;
  durationSeconds: number | null;
  sentiment: string | null;
};

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Finding = { code: string; severity: Severity; turn: number | null; detail: string; evidence?: string };

export type AbandonClass =
  | "hangup_at_greeting"
  | "silent_caller"
  | "info_only"
  | "abandon_during_dead_air"
  | "abandon_mid_order"
  | "abandon_after_quote"
  | "after_transfer_attempt"
  | "cap_hangup";

export type Evaluation = {
  evaluatorVersion: string;
  detScore: number | null;
  failureClass: "agent" | "infra" | null;
  abandonClass: AbandonClass | null;
  findings: Finding[];
  counters: {
    userTurns: number;
    deadAirTurns: number;
    toolErrors: number;
    clarifications: number;
    interrupts: number;
    fillers: number;
    hallucinationFlags: number;
    modelRetries: number;
    noInputReprompts: number;
    asrDropped: number;
  };
  transferStuck: boolean;
  totalsMismatch: boolean;
  needsReview: boolean;
  reviewReasons: string[];
  /** Sub-scores (0–100) for the dashboard. */
  axes: { order: number; conversation: number; audio: number; tools: number; latency: number };
};

export const DEAD_AIR_MS = 8_000;
const PROBE_RE = /^(?:hello|hi|hey|are you there|you there|anyone there|still there|can you hear me)[?.!,\s]*$/i;
/** Error codes the model routinely fixes on the next hop — a weak signal. */
const SELF_CORRECTABLE = new Set(["needs_info", "which_line", "recipe_not_named", "no_change", "date_in_past", "date_unparseable", "cart_invalid", "not_quoted", "transfer_refused", "call_not_finished"]);

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function evaluateCall(events: EvalEvent[], facts: CallFacts): Evaluation {
  const evs = [...events].sort((a, b) => a.seq - b.seq);
  const findings: Finding[] = [];
  const counters = { userTurns: 0, deadAirTurns: 0, toolErrors: 0, clarifications: 0, interrupts: 0, fillers: 0, hallucinationFlags: 0, modelRetries: 0, noInputReprompts: 0, asrDropped: 0 };

  const outcome = (facts.outcome || "").toLowerCase();
  const callEnd = evs.find((e) => e.type === "call_end");
  const cartLinesAtEnd = num(callEnd?.payload?.cartLines) ?? null;

  // ── Not scorable ───────────────────────────────────────────────────────
  if (outcome === "dropped") {
    findings.push({ code: "record_loss", severity: "high", turn: null, detail: "The session died without an end record (stale sweep closed it)." });
    return finish(findings, counters, { failureClass: "infra", detScore: null, abandonClass: null, transferStuck: false, totalsMismatch: false, facts, axes: zeroAxes() });
  }
  const robocall = outcome === "spam" || evs.some((e) => e.type === "robocall_detected");
  if (robocall) {
    findings.push({ code: "robocall", severity: "info", turn: null, detail: "Automated caller / IVR — excluded from quality averages." });
    return finish(findings, counters, { failureClass: null, detScore: null, abandonClass: null, transferStuck: false, totalsMismatch: false, facts, axes: zeroAxes() });
  }

  // ── Walk the log ───────────────────────────────────────────────────────
  let handoffSeq: number | null = null;
  /** The TURN the hand-off happened in — its own closing `turn` event (the
   *  "connecting you now" sentence) is not "stuck"; a later turn is. */
  let handoffTurn: number | null = null;
  let quoteOk = false;
  let placeOk = false;
  let lastTtfa: number | null = null;
  let protectedRespoken = 0;
  const toolErrorCodes = new Map<string, number>();
  const lastToolOkByName = new Map<string, boolean>();
  const pendingErrors: Array<{ name: string; code: string; turn: number | null }> = [];

  for (const e of evs) {
    const p = e.payload ?? {};
    switch (e.type) {
      case "asr": {
        if (p.synthetic === true) break;
        counters.userTurns++;
        const text = str(p.text, 120);
        if (PROBE_RE.test(text.trim()) && lastTtfa !== null && lastTtfa >= DEAD_AIR_MS) {
          findings.push({ code: "caller_probe_after_silence", severity: "high", turn: e.turn, detail: `Caller said "${text.trim()}" after ${Math.round(lastTtfa / 1000)} s of silence.` });
        }
        if (handoffTurn !== null && (e.turn ?? 0) > handoffTurn) {
          findings.push({ code: "speech_after_handoff", severity: "info", turn: e.turn, detail: "Caller speech arrived after the hand-off (ignored by the session)." });
        }
        break;
      }
      case "turn": {
        const ttfa = num(p.ttfaMs);
        lastTtfa = ttfa;
        if (p.synthetic !== true && ttfa !== null && ttfa >= DEAD_AIR_MS) {
          counters.deadAirTurns++;
          findings.push({ code: "dead_air", severity: ttfa >= 15_000 ? "critical" : "high", turn: e.turn, detail: `${(ttfa / 1000).toFixed(1)} s before the caller heard anything.` });
        }
        const spoken = str(p.spoken, 200);
        const before = str(p.cartHashBefore, 64);
        const after = str(p.cartHashAfter, 64);
        if (/\?\s*$/.test(spoken.trim()) && before === after && p.synthetic !== true) counters.clarifications++;
        if (handoffTurn !== null && (e.turn ?? 0) > handoffTurn && p.synthetic !== true) {
          findings.push({ code: "transfer_stuck", severity: "critical", turn: e.turn, detail: "A model turn ran AFTER the hand-off — the caller was told they were being connected and then kept talking to the agent." });
        }
        break;
      }
      case "tool_result": {
        const name = str(p.name, 40);
        const ok = p.ok !== false;
        const code = str(p.code, 40);
        if (name === "transfer_to_human" && ok && (p.output as { transferred?: unknown })?.transferred !== false) {
          handoffSeq = e.seq;
          handoffTurn = e.turn ?? handoffTurn ?? 0;
        }
        if (name === "quote_order" && ok) quoteOk = true;
        if (name === "place_order" && ok && (p.output as { alreadyPlaced?: unknown })?.alreadyPlaced !== true) placeOk = true;
        if (!ok) {
          counters.toolErrors++;
          toolErrorCodes.set(code || "unknown", (toolErrorCodes.get(code || "unknown") ?? 0) + 1);
          pendingErrors.push({ name, code, turn: e.turn });
        } else if (pendingErrors.length) {
          // The same tool succeeding later = the error was self-corrected.
          for (const pe of pendingErrors.splice(0)) {
            if (pe.name === name && pe.code && !SELF_CORRECTABLE.has(pe.code)) {
              findings.push({ code: `tool_error:${pe.code}`, severity: "low", turn: pe.turn, detail: `${pe.name} failed (${pe.code}) and was retried successfully.` });
            }
          }
        }
        lastToolOkByName.set(name, ok);
        break;
      }
      case "transfer_handoff": {
        if (handoffSeq === null) handoffSeq = e.seq;
        if (handoffTurn === null) handoffTurn = e.turn ?? 0;
        if (p.outcome === "hard_closed") findings.push({ code: "handoff_hard_closed", severity: "medium", turn: e.turn, detail: "Twilio never tore the socket down after the hand-off; the session closed itself." });
        if (p.outcome === "handoff_write_failed") findings.push({ code: "handoff_write_failed", severity: "medium", turn: e.turn, detail: "The hand-off reason did not reach the app before the relay ended." });
        break;
      }
      case "interrupt":
        if (p.stale !== true) counters.interrupts++;
        break;
      case "protected_respoken":
        protectedRespoken++;
        break;
      case "filler":
        counters.fillers++;
        break;
      case "hallucination_suspect": {
        counters.hallucinationFlags++;
        const kind = str(p.kind, 40) || "unknown";
        findings.push({ code: `hallucination:${kind}`, severity: kind === "readback_drift" ? "info" : "medium", turn: e.turn, detail: str(p.sentence, 80) || `Suspected ${kind}.` });
        break;
      }
      case "model_retry":
        counters.modelRetries++;
        findings.push({ code: "model_retry", severity: "low", turn: e.turn, detail: `Hop aborted after ${Math.round((num(p.afterMs) ?? 0) / 1000)} s with no first token; retried.` });
        break;
      case "no_input":
        if (p.stage === "reprompt") counters.noInputReprompts++;
        break;
      case "asr_dropped":
        counters.asrDropped++;
        break;
      case "error": {
        const where = str(p.where, 20);
        if (where === "model" || where === "stt" || where === "tts" || where === "init") {
          findings.push({ code: `error:${where}`, severity: where === "init" ? "high" : "medium", turn: e.turn, detail: str(p.message, 80) });
        }
        break;
      }
      default:
        break;
    }
  }
  // Unresolved tool errors at the end of the call count fully.
  for (const pe of pendingErrors) {
    findings.push({ code: `tool_error:${pe.code || "unknown"}`, severity: SELF_CORRECTABLE.has(pe.code) ? "low" : "medium", turn: pe.turn, detail: `${pe.name} failed (${pe.code || "unknown"}) and was never retried successfully.` });
  }
  if (protectedRespoken > 1) findings.push({ code: "protected_respoken_repeat", severity: "medium", turn: null, detail: `A protected sentence was re-spoken ${protectedRespoken} times.` });

  const transferStuck = findings.some((f) => f.code === "transfer_stuck");

  // ── Money ──────────────────────────────────────────────────────────────
  const placed = outcome === "order_placed" || placeOk || !!facts.orderId;
  const totalsMismatch = placed && facts.quotedTotal !== null && facts.chargedTotal !== null && Math.abs(facts.quotedTotal - facts.chargedTotal) > 0.009;
  if (totalsMismatch) {
    findings.push({ code: "totals_mismatch", severity: "critical", turn: null, detail: `Quoted ${facts.quotedTotal} but charged ${facts.chargedTotal}.` });
  }

  // ── Abandon classification ─────────────────────────────────────────────
  let abandonClass: AbandonClass | null = null;
  const decisive = placed || outcome === "reservation_booked" || outcome === "transferred" || outcome === "message_taken";
  if (!decisive) {
    const reason = (facts.transferReason || "").toLowerCase();
    if (reason === "call_time_limit") abandonClass = "cap_hangup";
    else if (handoffSeq !== null) abandonClass = "after_transfer_attempt";
    else if (counters.userTurns === 0) abandonClass = evs.some((e) => e.type === "no_input" && e.payload?.stage === "close") ? "silent_caller" : "hangup_at_greeting";
    else if (quoteOk) abandonClass = "abandon_after_quote";
    else if ((cartLinesAtEnd ?? 0) > 0 || outcome === "abandoned_with_cart") abandonClass = lastTtfa !== null && lastTtfa >= DEAD_AIR_MS ? "abandon_during_dead_air" : "abandon_mid_order";
    else if (lastTtfa !== null && lastTtfa >= DEAD_AIR_MS) abandonClass = "abandon_during_dead_air";
    else if (counters.userTurns >= 2) abandonClass = "info_only";
    else abandonClass = "hangup_at_greeting";
    if (abandonClass === "abandon_during_dead_air") findings.push({ code: "abandon_during_dead_air", severity: "critical", turn: null, detail: "The caller hung up during a silence of 8 s or more." });
    if (abandonClass === "abandon_after_quote") findings.push({ code: "abandon_after_quote", severity: "high", turn: null, detail: "The caller heard the total and hung up without placing." });
  }

  // ── Axes ───────────────────────────────────────────────────────────────
  const order = placed ? (totalsMismatch ? 20 : 100) : decisive ? 90 : abandonClass === "info_only" || abandonClass === "hangup_at_greeting" || abandonClass === "silent_caller" ? 70 : abandonClass === "abandon_after_quote" ? 40 : 50;
  const conversation = clamp(100 - counters.clarifications * 8 - (counters.userTurns > 6 ? Math.max(0, counters.userTurns - 12) * 2 : 0) - protectedRespoken * 10 - findings.filter((f) => f.code.startsWith("hallucination:") && f.severity !== "info").length * 15);
  const audio = clamp(100 - counters.interrupts * 6 - counters.asrDropped * 2 - findings.filter((f) => f.code === "error:stt" || f.code === "error:tts").length * 20);
  const tools = clamp(100 - findings.filter((f) => f.code.startsWith("tool_error:")).reduce((n, f) => n + (f.severity === "low" ? 5 : 15), 0) - findings.filter((f) => f.code === "error:model" || f.code === "error:init").length * 15);
  const latency = clamp(100 - counters.deadAirTurns * 25 - counters.modelRetries * 10 - findings.filter((f) => f.code === "caller_probe_after_silence").length * 10);
  let detScore = clamp(0.4 * order + 0.2 * conversation + 0.15 * audio + 0.15 * tools + 0.1 * latency);
  if (transferStuck) detScore = Math.min(detScore, 20);
  if (totalsMismatch) detScore = Math.min(detScore, 30);
  if (abandonClass === "abandon_during_dead_air") detScore = Math.min(detScore, 45);

  const failureClass: "agent" | "infra" | null =
    findings.some((f) => f.code === "error:init" || f.code === "error:stt" || f.code === "error:tts") && !placed ? "infra" : detScore < 70 ? "agent" : null;

  return finish(findings, counters, { failureClass, detScore, abandonClass, transferStuck, totalsMismatch, facts, axes: { order, conversation, audio, tools, latency } });
}

function zeroAxes() {
  return { order: 0, conversation: 0, audio: 0, tools: 0, latency: 0 };
}

function finish(
  findings: Finding[],
  counters: Evaluation["counters"],
  o: { failureClass: "agent" | "infra" | null; detScore: number | null; abandonClass: AbandonClass | null; transferStuck: boolean; totalsMismatch: boolean; facts: CallFacts; axes: Evaluation["axes"] },
): Evaluation {
  const reviewReasons: string[] = [];
  const outcome = (o.facts.outcome || "").toLowerCase();
  if (outcome === "error") reviewReasons.push("outcome_error");
  if (o.totalsMismatch) reviewReasons.push("totals_mismatch");
  if (o.transferStuck) reviewReasons.push("transfer_stuck");
  if ((o.facts.sentiment || "").toLowerCase() === "negative") reviewReasons.push("negative_sentiment");
  if (o.detScore !== null && o.detScore < 70) reviewReasons.push("low_score");
  if (findings.some((f) => f.severity === "critical" || f.severity === "high")) reviewReasons.push("critical_finding");
  if (o.failureClass === "infra") reviewReasons.push("infra");
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.turn ?? 0) - (b.turn ?? 0));
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    detScore: o.detScore,
    failureClass: o.failureClass,
    abandonClass: o.abandonClass,
    findings,
    counters,
    transferStuck: o.transferStuck,
    totalsMismatch: o.totalsMismatch,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    axes: o.axes,
  };
}
