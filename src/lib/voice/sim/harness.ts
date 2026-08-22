/**
 * THE RUNNER — drives the REAL `CallSession` (services/nabil-voice/src/session.ts)
 * against the offline backend for one scenario, with the REAL Anthropic model
 * (or a fake one in tests), and reduces the outcome to a `ScenarioReport`.
 *
 * What is real: the session, its prompt, its tools, the cart engine, the
 * compiler. What is faked: the phone line (fake-ws.ts), the app's HTTP API
 * (fake-backend.ts over a MenuSnapshot), and — in tests — the model.
 *
 * Turn protocol (script mode):
 *  • Before each scripted turn, Nabil's LAST utterance is tested against the
 *    scenario's standing `answers` and the next turn's `ifAsked` (regex,
 *    case-insensitive). A hit is said INSTEAD and the scripted turn is kept
 *    for next time — so one script survives Nabil asking for the name at turn
 *    1 or turn 5. The same answer may be used at most twice in a row before
 *    the script advances anyway (loop guard).
 *  • A turn with `interruptAfterMs` is delivered as a BARGE-IN on Nabil's reply
 *    to the previous turn: wait for Nabil's first token, wait that long, send
 *    `interrupt` with what was heard so far, then send the turn.
 *  • When the script is exhausted: stop if Nabil's last utterance is not a
 *    question; answer it if `answers` cover it; otherwise say "That's all,
 *    thanks." once and stop. Hard cap `maxTurns` (default turns.length + 12).
 *
 * "Clarified" (for `mustClarifyAt` / `expectClarification`): Nabil's reply
 * ends with "?" AND no COMPLETE order line was added / changed / removed in
 * that turn (a `needs_info` line the engine creates while asking is not a
 * mutation — it is the engine asking).
 *
 * The session module is loaded lazily and by a non-literal specifier: the
 * root tsconfig excludes services/** and does not carry `ws` types, so a
 * static import would break `tsc --noEmit` and `next build`.
 */
import type { CallEvent, CallEventInput, EventSink } from "../../../../services/nabil-voice/src/events";
import type { CartState } from "../../../../services/nabil-voice/src/cart-engine";
import type { CallerTurn, CanonicalCart, Scenario, ScenarioReport, ScenarioTurnRecord } from "./scenario-types";
import type { MenuSnapshot } from "./snapshot-types";
import { createFakeWs, type FakeWs } from "./fake-ws";
import { createFakeBackend, type FakeBackend } from "./fake-backend";
import { toCanonicalFromCart, toCanonicalFromPlaced } from "./canonical";
import { compareCarts } from "./compare-carts";
import { DEFAULT_CALLER_MODEL, HANGUP, nextCallerUtterance, type AnthropicLike, type CallerTranscriptEntry } from "./caller-sim";
import { seededRandom } from "./asr-noise";
import { evaluateCall } from "../eval/deterministic";

export type { AnthropicLike } from "./caller-sim";

export type RunScenarioOpts = {
  anthropic: AnthropicLike;
  snapshot: MenuSnapshot;
  run?: number;
  /** Override the agent model (CONFIG.model / NABIL_MODEL otherwise). */
  model?: string;
  timeoutPerTurnMs?: number;
  callerModel?: string;
  log?: (line: string) => void;
  /** Caller number; the fixture's caller id defaults to a Toronto mobile. */
  from?: string;
  to?: string;
};

type SessionLike = {
  onMessage(raw: string): void;
  onClose(): void;
  debugCart(): { snapshot(): CartState };
  debugVersions(): Record<string, unknown>;
};
type SessionCtor = new (ws: unknown, token: unknown, anthropic: unknown, deps?: { api?: unknown; now?: () => number; events?: EventSink; earlyFragmentMs?: number }) => SessionLike;

const SESSION_MODULE = "../../../../services/nabil-voice/src/session";
let sessionMod: Promise<{ CallSession: SessionCtor }> | null = null;

export function ensureSimEnv() {
  process.env.APP_BASE_URL ||= "http://sim";
  process.env.INTERNAL_API_SECRET ||= "sim";
  process.env.NABIL_VOICE_JWT_SECRET ||= "sim";
  process.env.ANTHROPIC_API_KEY ||= "sim";
}

async function loadSession(): Promise<{ CallSession: SessionCtor }> {
  ensureSimEnv();
  // Non-literal specifier on purpose — see the file header.
  sessionMod ??= import(/* @vite-ignore */ SESSION_MODULE) as Promise<{ CallSession: SessionCtor }>;
  return sessionMod;
}

/** An EventSink that keeps EVERY event (the session drains its own buffer
 *  into call-log flushes; the runner needs the whole log at the end). */
export function createRecordingSink(now: () => number = Date.now): { sink: EventSink; all: CallEvent[] } {
  const all: CallEvent[] = [];
  const pending: CallEvent[] = [];
  let seq = 0;
  const sink: EventSink = {
    emit(ev: CallEventInput) {
      seq++;
      const full = { ...(ev as object), seq, ts: new Date(now()).toISOString() } as CallEvent;
      all.push(full);
      pending.push(full);
    },
    drain: () => pending.splice(0),
    peek: () => pending.slice(),
    ack: (uptoSeq: number) => {
      let n = 0;
      while (n < pending.length && pending[n].seq <= uptoSeq) n++;
      if (n > 0) pending.splice(0, n);
    },
    size: () => pending.length,
  };
  return { sink, all };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Standing-answer sentinel: "yes, place it" only once the script is spoken;
 *  "not yet" while scripted turns remain. Use as the VALUE of the answer keyed
 *  on Nabil's "shall I place it?" question. */
export const PLACE_IF_DONE = "__PLACE_IF_DONE__";
async function waitUntil(pred: () => boolean, timeoutMs: number, stepMs = 20): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

const turnObj = (t: CallerTurn) => (typeof t === "string" ? { say: t } : t);
const asksQuestion = (s: string) => /\?\s*["”’']?\s*$/.test((s || "").trim());
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/** Regex over Nabil's last utterance → the standing answer to say instead. */
function matchAnswer(lastAgent: string, tables: Array<Record<string, string> | undefined>): { key: string; say: string } | null {
  if (!lastAgent.trim()) return null;
  for (const table of tables) {
    if (!table) continue;
    for (const [src, say] of Object.entries(table)) {
      let re: RegExp;
      try {
        re = new RegExp(src, "i");
      } catch {
        continue;
      }
      if (re.test(lastAgent)) return { key: src, say };
    }
  }
  return null;
}

const MUTATING_LINE_TOOLS = new Set(["add_to_order", "update_line", "remove_line", "place_order"]);

export async function runScenario(scn: Scenario, opts: RunScenarioOpts): Promise<ScenarioReport> {
  const startedAt = Date.now();
  const run = opts.run ?? 1;
  const timeoutPerTurnMs = opts.timeoutPerTurnMs ?? 60_000;
  const log = opts.log ?? (() => {});
  const { CallSession } = await loadSession();

  const ws: FakeWs = createFakeWs();
  // A snapshot carries the open/closed state of the moment it was taken (Luigi's
  // was captured at 1 AM). Scenarios simulate a live service unless they say otherwise.
  const backend: FakeBackend = createFakeBackend(opts.snapshot, { open: true, ...(scn.backend ?? {}) });
  const rec = createRecordingSink();
  const anthropic: AnthropicLike = opts.model
    ? { messages: { stream: (params: any, o?: { signal?: AbortSignal }) => opts.anthropic.messages.stream({ ...params, model: opts.model }, o) } }
    : opts.anthropic;
  const token = {
    restaurantId: opts.snapshot.restaurantId,
    slug: opts.snapshot.slug,
    callSid: `SIM${scn.id}r${run}`,
    to: opts.to ?? "+13656581458",
    from: opts.from ?? "+16475550100",
  };
  // The scripted caller answers the instant a reply is complete — there is no
  // TTS to hear — so the live early-fragment hold (a ≤3-word utterance within
  // 1.5 s of a reply's end is the tail of the caller's PREVIOUS sentence, see
  // session.ts) would swallow every short scripted answer. Off in the sim.
  const session = new CallSession(ws as never, token, anthropic as never, { api: backend, events: rec.sink, earlyFragmentMs: 0 });

  const reasons: string[] = [];
  const sends: Array<{ say: string; scriptIndex: number | null; kind: "script" | "answer" | "closing" | "llm" }> = [];
  const callerTranscript: CallerTranscriptEntry[] = [];
  let lastAgent = "";
  let stuck: string | null = null;

  const sendPrompt = (text: string, scriptIndex: number | null, kind: (typeof sends)[number]["kind"]) => {
    sends.push({ say: text, scriptIndex, kind });
    log(`  caller> ${text}`);
    session.onMessage(JSON.stringify({ type: "prompt", voicePrompt: text, lang: "en-US", last: true }));
  };
  const turnEventCount = () => rec.all.filter((e) => e.type === "turn").length;

  /** Wait for Nabil to finish answering the prompt just sent. */
  const awaitReply = async (): Promise<{ text: string; ended: boolean; timedOut: boolean }> => {
    const t = await ws.waitForTurnEnd(timeoutPerTurnMs);
    if (!t.timedOut) {
      lastAgent = t.text;
      log(`  nabil > ${t.text.trim()}`);
      if (t.ended) log(`  [call ended by agent: ${ws.endReason}]`);
    }
    return { text: t.text, ended: t.ended, timedOut: t.timedOut };
  };

  session.onMessage(JSON.stringify({ type: "setup" }));
  // init() is async; a prompt sent before it finishes is queued by the session,
  // but waiting for `call_start` keeps latency numbers honest.
  await waitUntil(() => rec.all.some((e) => e.type === "call_start"), 15_000, 25);

  try {
    if (scn.caller.mode === "script") {
      const turns = scn.caller.turns.map(turnObj);
      const maxTurns = scn.caller.maxTurns ?? turns.length + 12;
      let scriptIdx = 0;
      let saidClosing = false;
      let lastAnswerKey: string | null = null;
      let answerStreak = 0;
      let callerTurns = 0;

      while (callerTurns < maxTurns && !ws.ended && !stuck) {
        const next = turns[scriptIdx];
        // A barge-in turn is delivered by the PREVIOUS iteration; if we land
        // here with one pending (first turn, or after a stale answer), send it plainly.
        let say: string;
        let scriptIndex: number | null = null;
        let kind: (typeof sends)[number]["kind"] = "script";
        const hit = matchAnswer(lastAgent, [scn.caller.answers, next?.ifAsked]);
        const guardTripped = !!hit && hit.key === lastAnswerKey && answerStreak >= 2;
        // A script whose ONLY remaining line is a bare affirmation ("Yes.") is
        // done ordering — that line IS the placement yes. Treating it as "more
        // to add" made a scenario say "Not yet" and then "Yes." to "what else?"
        // (gate 2026-08-15, I03: exact cart, never placed).
        const onlyAffirmationLeft = !!next && scriptIdx === turns.length - 1 && /^(?:yes|yep|yeah|sure|ok(?:ay)?|correct|that's right|go ahead)[.! ]*$/i.test(next.say.trim());
        if (hit && !guardTripped && !(hit.say === PLACE_IF_DONE && onlyAffirmationLeft)) {
          // A standing "yes, place it" must never pre-empt the script: a real
          // caller with more to say says "not yet". The sentinel expands by
          // whether scripted turns remain.
          say = hit.say === PLACE_IF_DONE ? (next ? "Not yet — I've got more to add." : "Yes, go ahead.") : hit.say;
          kind = "answer";
          answerStreak = hit.key === lastAnswerKey ? answerStreak + 1 : 1;
          lastAnswerKey = hit.key;
        } else if (next) {
          say = next.say;
          scriptIndex = scriptIdx;
          scriptIdx++;
          lastAnswerKey = null;
          answerStreak = 0;
          if (next.delayMs) await sleep(next.delayMs);
        } else {
          // Script exhausted.
          if (!asksQuestion(lastAgent) || saidClosing) break;
          say = "That's all, thanks.";
          kind = "closing";
          saidClosing = true;
        }

        callerTurns++;
        const seqBefore = ws.markConsumed();
        const turnsBefore = turnEventCount();
        sendPrompt(say, scriptIndex, kind);

        const upcoming = turns[scriptIdx];
        if (upcoming?.interruptAfterMs && !saidClosing) {
          // Barge in on the reply to what we just said, then say the next turn.
          const spoke = await ws.waitForFirstText(timeoutPerTurnMs);
          if (!spoke) {
            stuck = `no reply within ${timeoutPerTurnMs}ms after caller turn ${callerTurns - 1}`;
            break;
          }
          await sleep(upcoming.interruptAfterMs);
          const heard = ws.currentText() || ws.turnEnds.filter((t) => t.seq > seqBefore).map((t) => t.text).join("");
          log(`  caller> [interrupt after ${upcoming.interruptAfterMs}ms — heard: "${heard.trim().slice(0, 80)}"]`);
          session.onMessage(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: heard }));
          // Let the session settle the interrupted turn (its `turn` event) before the correction.
          await waitUntil(() => turnEventCount() > turnsBefore, 2_500, 20);
          const doneEarly = ws.turnEnds.find((t) => t.seq > seqBefore);
          lastAgent = doneEarly ? doneEarly.text : heard;
          if (ws.ended) break;
          callerTurns++;
          ws.markConsumed();
          const idx = scriptIdx;
          scriptIdx++;
          lastAnswerKey = null;
          answerStreak = 0;
          sendPrompt(upcoming.say, idx, "script");
        }

        const r = await awaitReply();
        if (r.timedOut) {
          stuck = `Nabil did not finish a reply within ${timeoutPerTurnMs}ms (caller turn ${callerTurns - 1})`;
          break;
        }
        if (r.ended) break;
      }
      if (callerTurns >= maxTurns && !ws.ended) reasons.push(`caller gave up after ${maxTurns} turns (maxTurns)`);
    } else {
      // LLM caller.
      const maxTurns = scn.caller.maxTurns ?? 30;
      const rng = seededRandom(hashSeed(`${scn.id}#${run}`));
      let turnsDone = 0;
      while (turnsDone < maxTurns && !ws.ended && !stuck) {
        let say: string;
        try {
          say = await nextCallerUtterance({
            anthropic: opts.anthropic,
            model: opts.callerModel ?? DEFAULT_CALLER_MODEL,
            persona: scn.caller.persona,
            goal: scn.caller.goal,
            transcript: callerTranscript,
            noise: scn.caller.noise ?? "none",
            rng,
            turn: turnsDone + 1,
          });
        } catch (e) {
          reasons.push(`caller model failed: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
          break;
        }
        if (say === HANGUP) {
          log("  caller> <HANGUP>");
          break;
        }
        turnsDone++;
        ws.markConsumed();
        sendPrompt(say, null, "llm");
        callerTranscript.push({ role: "caller", text: say });
        const r = await awaitReply();
        if (r.timedOut) {
          stuck = `Nabil did not finish a reply within ${timeoutPerTurnMs}ms (caller turn ${turnsDone - 1})`;
          break;
        }
        callerTranscript.push({ role: "nabil", text: r.text.trim() });
        if (r.ended) break;
      }
      if (turnsDone >= maxTurns && !ws.ended) reasons.push(`caller gave up after ${maxTurns} turns (maxTurns)`);
    }
  } finally {
    // Hang up: the session finalizes (call_end event, logCall to the backend).
    session.onClose();
    await waitUntil(() => backend.logs.some((l) => (l as { event?: string })?.event === "end"), 5_000, 25);
  }
  if (stuck) reasons.push(stuck);

  /* ─────────────────────────── reduce the record ─────────────────────── */

  const events = rec.all;
  // A model / init / relay error is the root cause of everything after it — say it first.
  for (const e of events.filter((e): e is Extract<CallEvent, { type: "error" }> => e.type === "error")) {
    reasons.push(`${e.where} error: ${e.message.slice(0, 200)}`);
  }
  const turnEvents = events.filter((e): e is Extract<CallEvent, { type: "turn" }> => e.type === "turn");
  // One record per session turn number (an interrupted attempt and its retry
  // share a number — the later event wins, tool calls are unioned).
  const byTurn = new Map<number, Extract<CallEvent, { type: "turn" }>>();
  for (const ev of turnEvents) byTurn.set(ev.turn ?? 0, ev);
  const toolUses = events.filter((e): e is Extract<CallEvent, { type: "tool_use" }> => e.type === "tool_use");
  const toolResults = events.filter((e): e is Extract<CallEvent, { type: "tool_result" }> => e.type === "tool_result");
  const nonSynthetic = [...byTurn.values()].filter((t) => !t.synthetic).sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0));

  const turns: ScenarioTurnRecord[] = [];
  let sendCursor = 0;
  for (const ev of [...byTurn.values()].sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0))) {
    const t = ev.turn ?? 0;
    const send = !ev.synthetic ? sends[sendCursor++] : undefined;
    const results = toolResults.filter((r) => r.turn === t);
    const toolCalls = toolUses
      .filter((u) => u.turn === t)
      .map((u) => {
        const r = results.find((x) => x.toolUseId === u.toolUseId);
        return { name: u.name, input: u.input, ok: r ? r.ok : false, code: r?.code ?? (r ? null : "no_result"), ms: r?.ms ?? 0 };
      });
    const linesMutated = results.some((r) => {
      if (!r.ok || !MUTATING_LINE_TOOLS.has(r.name)) return false;
      if (r.name === "remove_line" || r.name === "place_order") return true;
      const status = (r.output as { line?: { status?: string } } | null)?.line?.status;
      return status === "complete";
    });
    // What the caller HEARD: the model's text minus any sentence the narration
    // filter dropped before it reached the voice (sentence-chunk mode).
    let heardText = ev.spoken ?? "";
    for (const d of rec.all) {
      if (d.type === "narration_dropped" && d.turn === t && d.text) heardText = heardText.replace(d.text, " ").replace(/\s+/g, " ").trim();
    }
    turns.push({
      idx: turns.length,
      scriptIndex: send ? send.scriptIndex : null,
      caller: send ? send.say : ev.synthetic ? `(synthetic) ${ev.utterance}` : ev.utterance,
      agent: heardText,
      toolCalls,
      cartHashBefore: ev.cartHashBefore ?? null,
      cartHashAfter: ev.cartHashAfter ?? null,
      ttftMs: ev.ttfaMs ?? ev.hops?.[0]?.ttftMs ?? null,
      // A question anywhere in the reply counts ("How would you like them? We have…" ends with a period).
      clarified: /\?/.test(ev.spoken ?? "") && !linesMutated,
    });
  }
  // A9: the agent may END a finished call (end_call / silence after a farewell) — scripted lines after that
  // close are simply never consumed, which is the point, not a miscount.
  const cleanClose = ws.ended && /^caller_done(?::|$)/.test(ws.endReason ?? "");
  if (nonSynthetic.length !== sends.length && !(cleanClose && nonSynthetic.length < sends.length)) {
    reasons.push(`turn accounting: ${sends.length} caller prompts but ${nonSynthetic.length} session turns`);
  }

  // Cart.
  const placed = backend.placed.length > 0;
  const lastPlaced = backend.placed[backend.placed.length - 1];
  const cartState = session.debugCart().snapshot();
  const actualCart: CanonicalCart = placed ? toCanonicalFromPlaced(lastPlaced.body as never, opts.snapshot) : toCanonicalFromCart(cartState, opts.snapshot);
  const cartDiff = compareCarts(actualCart, withNames(scn.expected.cart, opts.snapshot));
  if (!cartDiff.exact) reasons.push(`cart mismatch: ${cartDiff.humanSummary.slice(0, 6).join(" | ")}`);
  if (placed !== scn.expected.mustPlace) reasons.push(placed ? "order was placed but mustPlace=false" : "order was NOT placed (mustPlace=true)");
  if (backend.placed.length > 1) reasons.push(`${backend.placed.length} orders were placed`);

  // Fulfilment / customer.
  const f = placed
    ? {
        type: typeof lastPlaced.body.type === "string" ? lastPlaced.body.type : null,
        address: [lastPlaced.body.deliveryAddress, lastPlaced.body.deliveryCity, lastPlaced.body.deliveryZip].filter(Boolean).join(", ") || undefined,
      }
    : { type: cartState.fulfilment.type, address: [cartState.fulfilment.street, cartState.fulfilment.city, cartState.fulfilment.zip].filter(Boolean).join(", ") || undefined };
  const fulfilment = f.type || f.address ? f : null;
  const rawName = placed ? String(lastPlaced.body.customerName ?? "") : cartState.customer.name ?? "";
  const customerName = rawName.replace(/\s*\(phone\)\s*$/i, "").trim() || null;
  if (scn.expected.fulfilment) {
    if (f.type !== scn.expected.fulfilment.type) reasons.push(`fulfilment '${f.type ?? "none"}', expected '${scn.expected.fulfilment.type}'`);
    if (scn.expected.fulfilment.address && !norm(f.address ?? "").includes(norm(scn.expected.fulfilment.address))) {
      reasons.push(`address '${f.address ?? ""}' does not contain '${scn.expected.fulfilment.address}'`);
    }
  }
  if (scn.expected.customer?.name) {
    const want = norm(scn.expected.customer.name);
    const got = norm(customerName ?? "");
    if (!got.split(" ").includes(want) && !got.includes(want)) reasons.push(`customer name '${customerName ?? ""}', expected '${scn.expected.customer.name}'`);
  }
  if (scn.expected.customer?.phone) {
    const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
    const got = placed ? String(lastPlaced.body.customerPhone ?? "") : cartState.customer.phone ?? "";
    if (digits(got) !== digits(scn.expected.customer.phone)) reasons.push(`customer phone '${got}', expected '${scn.expected.customer.phone}'`);
  }

  // Clarifications.
  const expectedAt = [...new Set([...(scn.expected.mustClarifyAt ?? []), ...(scn.caller.mode === "script" ? scn.caller.turns.map(turnObj).map((t, i) => (t.expectClarification ? i : -1)).filter((i) => i >= 0) : [])])].sort((a, b) => a - b);
  const actualAt = turns.filter((t) => t.clarified && typeof t.scriptIndex === "number").map((t) => t.scriptIndex as number);
  for (const i of expectedAt) {
    const tr = turns.find((t) => t.scriptIndex === i);
    if (!tr) reasons.push(`expected a clarification after caller turn ${i}, but that turn was never delivered`);
    else if (!tr.clarified) reasons.push(`expected a clarification after caller turn ${i} — Nabil ${/\?/.test(tr.agent) ? "asked but also changed the order" : "did not ask a question"}`);
  }

  // Said / not said.
  const everything = ws.spoken();
  const mustNotSayHits: string[] = [];
  for (const src of scn.expected.mustNotSay ?? []) {
    try {
      const m = new RegExp(src, "i").exec(everything);
      if (m) mustNotSayHits.push(`/${src}/ → "${everything.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim()}"`);
    } catch {
      /* bad regex in the scenario — ignore */
    }
  }
  if (mustNotSayHits.length) reasons.push(`said something forbidden: ${mustNotSayHits.join("; ")}`);
  for (const src of scn.expected.mustSay ?? []) {
    try {
      if (!new RegExp(src, "i").test(everything)) reasons.push(`never said /${src}/`);
    } catch {
      /* ignore */
    }
  }

  // Tools.
  if (scn.expected.allowedTools) {
    const allowed = new Set(scn.expected.allowedTools);
    const bad = toolResults.filter((r) => r.ok && !allowed.has(r.name)).map((r) => r.name);
    if (bad.length) reasons.push(`disallowed tool succeeded: ${[...new Set(bad)].join(", ")}`);
  }
  const toolErrors = toolResults.filter((r) => !r.ok).length;
  if (typeof scn.expected.maxToolErrors === "number" && toolErrors > scn.expected.maxToolErrors) {
    reasons.push(`${toolErrors} tool errors (max ${scn.expected.maxToolErrors})`);
  }
  if (typeof scn.expected.totalCents === "number") {
    const quoted = backend.quotes.length ? (backend.quotes[backend.quotes.length - 1].result as { total?: number })?.total : undefined;
    const got = placed ? lastPlaced.total : quoted;
    if (typeof got !== "number") reasons.push(`no total was quoted (expected ${scn.expected.totalCents}¢)`);
    else if (Math.abs(Math.round(got * 100) - scn.expected.totalCents) > 0) reasons.push(`total ${Math.round(got * 100)}¢, expected ${scn.expected.totalCents}¢`);
  }
  const endedByAgent = ws.ended && !!ws.endReason && ws.endReason !== "end";
  const transferred = endedByAgent && !cleanClose;
  if (scn.expected.mustTransfer) {
    if (!transferred) reasons.push("expected a hand-off to a person, the call was never transferred");
  } else if (transferred) {
    reasons.push(`call ended by agent: ${ws.endReason}`);
  } else if (cleanClose && scn.expected.mustPlace && !placed) {
    // A9 guard: hanging up on an unplaced order is the one clean-close that is NOT clean.
    reasons.push(`agent ended the call (${ws.endReason}) before placing the order`);
  }

  // Hallucination flags, latency, usage.
  const hallucinationFlags = events
    .filter((e): e is Extract<CallEvent, { type: "hallucination_suspect" }> => e.type === "hallucination_suspect")
    .map((e) => ({ turn: e.turn ?? 0, kind: e.kind, detail: e.sentence }));
  const ttfts = turns.map((t) => t.ttftMs).filter((n): n is number => typeof n === "number");
  const toolMs = toolResults.map((r) => r.ms);
  const callEnd = events.find((e): e is Extract<CallEvent, { type: "call_end" }> => e.type === "call_end");
  const u = (callEnd?.usage ?? {}) as { tokensIn?: number; tokensOut?: number; cacheRead?: number; cacheWrite?: number };
  const versions = { ...session.debugVersions(), ...(opts.model ? { model: opts.model } : {}) };

  const transcript: Array<{ role: string; text: string }> = [];
  for (const t of turns) {
    transcript.push({ role: "caller", text: t.caller });
    if (t.agent) transcript.push({ role: "nabil", text: t.agent });
  }
  if (!turns.length) {
    // No session turn completed (e.g. the model errored on the first hop):
    // fall back to what went over the wire so the report still shows the call.
    sends.forEach((s, i) => {
      transcript.push({ role: "caller", text: s.say });
      const heard = ws.turnEnds[i]?.text?.trim();
      if (heard) transcript.push({ role: "nabil", text: heard });
    });
  }

  // Phase D: the SAME deterministic evaluator that scores production calls
  // grades this run from the recorded event log — every production detector
  // is a sim assertion for free (shown as the `det` column in the report).
  const evaluation = evaluateCall(
    events.map((e) => ({ seq: e.seq, turn: (e as { turn?: number | null }).turn ?? null, type: e.type, payload: e as unknown as Record<string, unknown> })),
    {
      outcome: callEnd?.outcome ?? null,
      orderId: placed ? "placed" : null,
      quotedTotal: backend.quotes.length ? (((backend.quotes[backend.quotes.length - 1].result as { total?: number })?.total as number | undefined) ?? null) : null,
      chargedTotal: placed ? (lastPlaced?.total ?? null) : null,
      transferReason: ws.ended && ws.endReason && ws.endReason !== "end" ? ws.endReason : null,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      sentiment: null,
    },
  );

  return {
    id: scn.id,
    run,
    pass: reasons.length === 0,
    reasons,
    evaluation,
    cartDiff,
    actualCart,
    placed,
    fulfilment,
    customerName,
    turns,
    hallucinationFlags,
    clarifications: { expectedAt, actualAt },
    mustNotSayHits,
    latency: { ttftP50: pct(ttfts, 50), ttftP95: pct(ttfts, 95), toolP95: pct(toolMs, 95) },
    usage: { in: u.tokensIn ?? 0, out: u.tokensOut ?? 0, cacheRead: u.cacheRead ?? 0, cacheWrite: u.cacheWrite ?? 0 },
    costCents: callEnd?.costCents ?? 0,
    durationMs: Date.now() - startedAt,
    versions,
    transcript,
  };
}

/** Expected lines/picks are authored by id; add the fixture's names so diffs read as food, not ids. */
function withNames(cart: CanonicalCart, snapshot: MenuSnapshot): CanonicalCart {
  return {
    lines: cart.lines.map((l) => ({
      ...l,
      name: l.name ?? snapshot.items[l.item]?.name,
      ...(l.picks ? { picks: l.picks.map((p) => ({ ...p, name: p.name ?? snapshot.items[p.item]?.name })) } : {}),
    })),
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
