import type Anthropic from "@anthropic-ai/sdk";
import type { WebSocket } from "ws";
import { CONFIG, type CallToken } from "./config";
import { api } from "./api";
import { TOOLS, executeTool, toolsForConfig, canonicalPhone, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { normalizeAgentConfig } from "./agent-config";
import { withMessageCacheBreakpoints } from "./cache-breakpoints";
import { normalizeAsr } from "./asr-normalize";

/** maxCallSeconds timing (contract): wrap-up nudge at T-45s, hangup at T+15s. */
const WRAP_UP_LEAD_MS = 45_000;
const HANGUP_GRACE_MS = 15_000;

const MAX_TOOL_HOPS = 8;

/** How many times one turn may be continued after a max_tokens truncation.
 *  Separate from MAX_TOOL_HOPS: a continuation is not work, it is us having
 *  mis-sized the output budget, and letting the two share a counter meant a
 *  truncated turn ran out of room to do the thing it was truncated doing. */
const MAX_CONTINUATIONS = 2;

/** An `interrupt` arriving within this long of a turn opening belongs to the
 *  sentence BEFORE it, not the one now streaming. Long enough to cover the gap
 *  Twilio leaves between the two events, short enough that a caller who really
 *  does talk over the new sentence is still heard. */
const INTERRUPT_GRACE_MS = 800;

/** How long a turn may go without emitting a single token before we say
 *  something. A tool hop is silent by construction, and a caller cannot tell
 *  silence from a dropped call. */
const FILLER_AFTER_MS = 1_200;

/** A turn that was aborted before speaking a word gets re-answered after this
 *  long — cancelled the moment the caller speaks again, so we never talk over a
 *  genuine barge-in. Without it, the interrupt/prompt race leaves the line dead
 *  until the caller gives up and says "Hello?". */
const SILENT_TURN_RETRY_MS = 1_200;

/** Hard cap on how long one sentence may hold off barge-in. A protected window
 *  that somehow never closes would make Nabil un-interruptible for the rest of
 *  the call — far worse than the truncation it prevents. */
const PROTECT_MAX_MS = 12_000;

/** Failed tool attempts before the caller is handed to a person. Two, because
 *  the third attempt is the one that turns a recoverable moment into the call
 *  the owner replays and calls horrible. */
const STRUGGLE_LIMIT = 2;

/**
 * One phone call. Bridges the Twilio ConversationRelay WebSocket to a Claude
 * Sonnet turn-loop (thinking off for latency, streaming, tool use). Fetches the
 * live menu/context/caller at setup, grounds Claude in it, streams spoken text
 * back token-by-token, executes action tools, handles barge-in, and logs the
 * VoiceCall on hangup.
 */
export class CallSession {
  private messages: any[] = [];
  private system = "";
  private ctx: ToolContext;
  private transcript: Array<{ role: string; text: string; ts: string }> = [];
  private interrupted = false;
  private controller: AbortController | null = null;
  /** Consecutive failed model turns. Reset on any success — see the stream
   *  error handler for why a caller must never be told twice that WE broke. */
  private streamFailures = 0;
  private ready = false;
  private queued: string[] = [];
  /** Prompts that arrived while a turn was running — drained serially. */
  private pendingPrompts: string[] = [];
  /** Barge-in recovery state (review wf_a62b0536). */
  private lastPromptAt = 0;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;
  private turnRunning = false;
  /** When the CURRENT turn started streaming. ConversationRelay delivers
   *  `interrupt` and `prompt` as separate events, and the interrupt raised by a
   *  caller talking over the PREVIOUS sentence routinely lands a beat AFTER the
   *  prompt it produced. Without this, that stale interrupt aborts the reply to
   *  the very words that caused it — which is the dead air Roya answered with
   *  "Hello?" on 2026-08-13. A `!turnRunning` check cannot catch it: handlePrompt
   *  runs synchronously all the way to messages.stream(), so a later interrupt
   *  always sees turnRunning === true. Only elapsed time separates them. */
  private turnStartedAt = 0;
  /** Retry timer for a turn that was aborted before it said anything at all. */
  private silentTurnTimer: ReturnType<typeof setTimeout> | undefined;
  /** One-shot "one moment" so a silent tool hop never sounds like a dead line. */
  private fillerTimer: ReturnType<typeof setTimeout> | undefined;
  /** A sentence the caller MUST hear in full — a total, a corrected total, an
   *  order confirmation. Suppressing the barge-in flag is not enough on its own:
   *  ConversationRelay has already flushed its TTS buffer by the time it tells
   *  us, so simply carrying on resumes mid-word ("…venty seven"). The sentence
   *  has to be re-spoken from the start. */
  private protectedUntil = 0;
  private protectedText = "";
  private bargedDuringProtected = false;
  private outcome: string | null = null;
  private orderId: string | null = null;
  private orderNumber: string | null = null;
  private reservationCode: string | null = null;
  private customerId: string | null = null;
  private language: string | null = null;
  /** The total spoken to the caller, and the one actually charged. Logged so a
   *  divergence is visible in the dashboard instead of being discovered days
   *  later by reading a transcript (2026-08-11 and 2026-08-13, both by hand). */
  private quotedTotal: number | null = null;
  private chargedTotal: number | null = null;
  private usageIn = 0;
  private usageOut = 0;
  /** Cache split of usageIn — priced at 1.25× (write) and 0.1× (read). */
  private usageCacheWrite = 0;
  private usageCacheRead = 0;
  /**
   * 📏 THE MEASUREMENT LAYER. Nothing in this service timed anything, so every
   * latency claim ever made about it — including in the plan that asked for
   * this — was arithmetic on token counts, not observation.
   *
   * `ttftMs` is what the caller actually experiences: the wait between their
   * words arriving and the first syllable coming back.
   *
   * `cacheReadPerRequest` is the important one. A cache breakpoint only looks
   * back 20 content blocks for the previous write, and one tool-heavy turn can
   * append 18 — so a busy pizza turn can silently push the conversation out of
   * the window, after which EVERY request re-processes the whole call from
   * scratch at full price. It is a multi-second stall with no error, and it is
   * the leading suspect for "fine for a minute, then bad". A zero here after
   * non-zeroes is that cliff, caught.
   */
  private perRequest: Array<{
    hop: number;
    ttftMs: number | null;
    totalMs: number;
    cacheRead: number;
    cacheWrite: number;
    uncached: number;
    stop: string | null;
  }> = [];
  private toolTimings: Array<{ name: string; ms: number; ok: boolean }> = [];
  private truncations = 0;
  /** Model requests, which is NOT the same as turns — a turn with tool hops is
   *  several. Every per-turn token figure quoted before this existed used the
   *  wrong denominator. */
  private modelRequests = 0;
  /** Where the rolling conversation cache anchor sits, carried between turns.
   *  See cache-breakpoints.ts — a breakpoint that moves every turn is written
   *  once and read never. */
  private cacheAnchor: number | null = null;
  /** Things WE said that the model did not author, waiting to be told to it on
   *  the next turn. See speak(). */
  private spokenAsides: string[] = [];
  /** The exact string of the most recent user message pushed into `messages`.
   *  The silent-turn retry identifies its own turn by this — it cannot compare
   *  against the raw transcript text, which may have had an aside prefixed. */
  private lastUserContent: string | null = null;
  /** Times the agent has failed at the same thing on this call. Two strikes and
   *  a caller is better served by a person than by a third attempt. */
  private struggles = 0;
  private startedAt = Date.now();
  private finalized = false;
  /** Real caller turns (prompt/dtmf events) — synthetic injected prompts
   *  (barge-in resume, wrap-up nudge) don't count toward engagement. */
  private userTurns = 0;
  /** The per-call tool list (capability toggles remove tools). */
  private tools: typeof TOOLS = TOOLS;
  private wrapUpTimer: ReturnType<typeof setTimeout> | undefined;
  private hangUpTimer: ReturnType<typeof setTimeout> | undefined;
  private wrapUpInjected = false;
  /** maxCallSeconds hangup deferred because a turn was still running. */
  private hangUpRequested = false;

  constructor(
    private ws: WebSocket,
    private token: CallToken,
    private anthropic: Anthropic,
  ) {
    this.ctx = {
      token,
      cfg: normalizeAgentConfig(undefined),
      cashDeliveryBlocked: false,
      pendingTransfer: null,
      placedOrders: [],
      basket: [],
      itemOptionsSeen: new Set<string>(),
      // Seed the pricing identity from caller ID, in canonical form, BEFORE the
      // first tool can run. Promo eligibility is per-customer, so a quote priced
      // against an empty identity and a charge priced against the caller is two
      // different customers and two different totals (ORD-264127463, 2026-08-13).
      customerPhone: canonicalPhone(token.from || "") || undefined,
    };
  }

  onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "setup":
        void this.init();
        break;
      case "prompt": {
        // Repair speech-to-text SURFACE FORMATTING before anything downstream
        // sees it — Deepgram writes the spoken word "half" as "0.5", which on
        // 2026-08-14 reached the model twice on a half-and-half pizza order.
        const text = normalizeAsr(String(msg.voicePrompt ?? msg.text ?? msg.transcript ?? ""));
        if (msg.lang) this.language = msg.lang;
        this.lastPromptAt = Date.now();
        if (text) {
          // Real caller speech landed, so the barge-in resume is moot. Without
          // this the timer still fires after we've answered and the agent
          // re-speaks its pre-interrupt half-sentence over the caller.
          clearTimeout(this.resumeTimer);
          this.resumeTimer = undefined;
          // Same for the silent-turn retry: the caller has moved on, so
          // re-answering the turn they abandoned would talk over them.
          clearTimeout(this.silentTurnTimer);
          this.silentTurnTimer = undefined;
          this.userTurns++;
          void this.handlePrompt(String(text));
        }
        break;
      }
      case "interrupt":
        // A stale interrupt belonging to the PREVIOUS sentence: the caller spoke
        // over what we were saying, which produced both this event and the
        // prompt that just opened a turn. Killing that turn answers their words
        // with silence. See turnStartedAt.
        if (this.turnRunning && Date.now() - this.turnStartedAt < INTERRUPT_GRACE_MS) break;
        // Mid-total, mid-confirmation: note it and keep speaking. The sentence
        // is re-spoken whole at the end of the turn (ConversationRelay has
        // already dropped the audio, so carrying on would resume mid-word).
        if (Date.now() < this.protectedUntil) {
          this.bargedDuringProtected = true;
          break;
        }
        this.interrupted = true;
        this.controller?.abort();
        // Barge-in recovery (review wf_a62b0536): a noise/backchannel
        // interrupt ("mm-hmm", kitchen clatter) halts TTS mid-sentence but
        // produces NO usable transcript — so no prompt ever arrives and the
        // caller gets dead air after the agent "cut itself off" (the exact
        // first-call symptom). If nothing intelligible follows within 4s,
        // resume and finish the thought. 4s, not 2.5s: a real 2-3s barge-in
        // plus STT endpointing routinely finalizes after 2.5s, and firing
        // while the caller is still talking is worse than a beat of silence.
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          // Only resume when there IS a spoken turn to pick up. An interrupt
          // during the welcome greeting leaves an empty history (or a turn we
          // never started), and "finish your point" then invents a point the
          // agent never made — while the caller is dictating their order.
          const last = this.messages[this.messages.length - 1];
          if (last?.role !== "assistant") return;
          if (Date.now() - this.lastPromptAt > 2000 && !this.turnRunning) {
            void this.runTurn(
              "(You were interrupted mid-sentence but the caller didn't actually say anything. Briefly pick up where you left off and finish your point.)",
            );
          }
        }, 4000);
        break;
      case "dtmf":
        // Treat keypad input as spoken text (e.g. "press 1 for a person").
        if (msg.digit || msg.digits) {
          // Keypad input is real caller input: it must retire the barge-in
          // resume and refresh lastPromptAt exactly like a spoken prompt.
          this.lastPromptAt = Date.now();
          clearTimeout(this.resumeTimer);
          this.resumeTimer = undefined;
          this.userTurns++;
          void this.handlePrompt(`(pressed ${msg.digit ?? msg.digits})`);
        }
        break;
      case "error":
        console.error("[nabil-voice] relay error", msg);
        break;
      default:
        break;
    }
  }

  private async init() {
    // Call-start event: creates the VoiceCall stub (real startedAt, triggers
    // recording server-side). Fire-and-forget — the call must not wait on it.
    void api
      .logCallStart({
        event: "start",
        restaurantId: this.token.restaurantId,
        callSid: this.token.callSid,
        fromNumber: this.token.from,
        toNumber: this.token.to,
        startedAtIso: new Date().toISOString(),
      })
      .then((r) => {
        if (!r.ok) console.error("[nabil-voice] logCallStart rejected", r.status);
      })
      .catch((e) => console.error("[nabil-voice] logCallStart failed", e));

    try {
      const [menu, context, returningCaller] = await Promise.all([
        api.menu(this.token.slug),
        api.context(this.token.slug),
        api.returningCaller(this.token.slug, this.token.from).catch(() => ({ found: false })),
      ]);
      this.ctx.cashDeliveryBlocked = !!context?.delivery?.cashDeliveryBlocked;
      // context.config may be ABSENT (older server) — normalize keeps today's
      // permissive defaults exactly in that case.
      this.ctx.cfg = normalizeAgentConfig(context?.config);
      // The returning-caller lookup resolves the Customer — keep the id for
      // the end log instead of discarding it.
      this.customerId =
        typeof (returningCaller as any)?.customerId === "string" ? (returningCaller as any).customerId : null;
      // A known caller's STORED name beats whatever speech-to-text makes of them
      // saying it out loud — "Roya Safi" came back as "Royanne Veal" and that is
      // what printed on the kitchen ticket. The model can still override it if
      // the caller gives a different name for this order.
      const knownName = (returningCaller as any)?.found ? (returningCaller as any)?.name : null;
      if (typeof knownName === "string" && knownName.trim()) this.ctx.customerName = knownName.trim();
      // Which items may ONLY reach an order through the compiler. Collected
      // once here so place_order can refuse a hand-written pizza — on
      // 2026-08-11 the model added a pizza with add_pizza AND restated it in
      // `items`, and the caller was charged twice, the second copy priced below
      // list because it carried no toppings.
      this.ctx.builderItemIds = new Set(
        ((menu as any)?.menu ?? []).flatMap((cat: any) =>
          (cat?.items ?? [])
            .filter((it: any) => it?.isPizza || it?.isCombo)
            .map((it: any) => String(it.menuItemId)),
        ),
      );
      this.system = buildSystemPrompt({
        menu,
        context,
        returningCaller,
        cfg: this.ctx.cfg,
        // Caller ID, so Nabil can read the callback number back for a yes/no
        // instead of making the caller dictate ten digits down a phone line.
        callerPhone: this.token.from,
      });
    } catch (e) {
      console.error("[nabil-voice] init failed", e);
      this.system = `You are Nabil, the phone assistant for this restaurant. Apologize that you're having trouble accessing the menu right now and offer to connect the caller to a team member (call transfer_to_human).`;
    }
    this.tools = toolsForConfig(this.ctx.cfg);
    this.startMaxCallTimers();
    this.ready = true;
    // Flush anything the caller said before we finished loading.
    const pending = this.queued.splice(0);
    for (const t of pending) await this.runTurn(t);
  }

  /** What this call cost in Anthropic spend, in whole cents.
   *  claude-sonnet-5 list price 2026-08: $3 / MTok input, $15 / MTok output.
   *  Cache writes bill at 1.25× the input rate, cache reads at 0.1×; usageIn
   *  is the TOTAL prompt tokens, so the cached portions are subtracted out of
   *  the full-rate share before being re-added at their own rates. */
  private costCents(): number {
    const IN_PER_TOK = 3 / 1_000_000;
    const OUT_PER_TOK = 15 / 1_000_000;
    const uncachedIn = Math.max(0, this.usageIn - this.usageCacheWrite - this.usageCacheRead);
    const dollars =
      uncachedIn * IN_PER_TOK +
      this.usageCacheWrite * IN_PER_TOK * 1.25 +
      this.usageCacheRead * IN_PER_TOK * 0.1 +
      this.usageOut * OUT_PER_TOK;
    return Math.round(dollars * 100);
  }

  /** maxCallSeconds cap, anchored at session start: one polite wrap-up nudge
   *  at T-45s, then a graceful hangup at T+15s if the call is still up. */
  private startMaxCallTimers() {
    const max = this.ctx.cfg.maxCallSeconds;
    if (!max) return;
    const elapsed = Date.now() - this.startedAt;
    this.wrapUpTimer = setTimeout(() => {
      if (this.finalized || this.wrapUpInjected) return;
      this.wrapUpInjected = true;
      // Synthetic user turn — serialized through handlePrompt so it never
      // races a running turn (2026-08-10 hotfix invariant).
      void this.handlePrompt(
        "(You are nearing the maximum call length. Wrap up politely now — finish the current action first.)",
      );
    }, Math.max(0, max * 1000 - WRAP_UP_LEAD_MS - elapsed));
    this.hangUpTimer = setTimeout(() => {
      if (this.finalized) return;
      if (this.turnRunning) {
        // Never cut a turn that may be placing an order or speaking its
        // confirmation — same invariant as the stateChanged barge-in reset in
        // runTurnInner: the caller MUST hear the order number and total, or
        // they assume it failed and order again. Backstop the deferral so a
        // wedged turn can't hold the line open forever.
        this.hangUpRequested = true;
        this.hangUpTimer = setTimeout(() => this.endCapped(), 30_000);
        return;
      }
      this.endCapped();
    }, Math.max(0, max * 1000 + HANGUP_GRACE_MS - elapsed));
  }

  /** maxCallSeconds hard end — no outcome stamped, so whatever the call
   *  earned stands and finalize()'s default covers the rest. */
  private endCapped() {
    if (this.finalized) return;
    // interrupted=true makes an in-flight stream abort quietly (the barge-in
    // path) instead of speaking the "didn't catch that" apology into a
    // closing call.
    this.interrupted = true;
    this.controller?.abort();
    try {
      // MUST carry a reason. Ending the ConversationRelay session hands the
      // still-live CALL to the <Connect action> URL, and that route dials the
      // restaurant — correct for a real transfer_to_human (which does send a
      // reason, below), catastrophic here: a caller who simply talked past the
      // time limit was silently bridged onto the restaurant's ringing phone,
      // mid-sentence, with no context for whoever picked up. Worse, if
      // transferToNumber/alertPhone are unset and restaurant.phone IS the Nabil
      // number, that dial re-enters the agent and the caller loops.
      // The handoff route now reads this and hangs up politely instead.
      // Caught in the Nabil completeness sweep, 2026-08-12.
      this.ws.send(
        JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason: "call_time_limit" }) }),
      );
    } catch {
      /* ignore */
    }
  }

  private async handlePrompt(text: string) {
    if (!this.ready) {
      this.queued.push(text);
      return;
    }
    // Serialize turns (2026-08-10 live dup-order incident): "Yeah." and "Yes."
    // arrived as two prompt events ~2s apart and ran two OVERLAPPING model
    // turns — the second saw the first's place_order in history and placed the
    // same order again. A prompt that lands while a turn is running now waits
    // its turn instead of racing it. (A true barge-in still aborts the stream
    // via the separate "interrupt" event — that path is unchanged.)
    if (this.turnRunning) {
      this.pendingPrompts.push(text);
      return;
    }
    await this.runTurn(text);
  }

  private async runTurn(userText: string) {
    this.turnRunning = true;
    try {
      await this.runTurnInner(userText);
    } finally {
      this.turnRunning = false;
      // No exit path from runTurnInner — return, throw, transfer, hop cap — may
      // leave the filler armed to speak into the next turn.
      clearTimeout(this.fillerTimer);
      this.fillerTimer = undefined;
    }
    // Drain prompts that arrived mid-turn, one at a time, in arrival order.
    const next = this.pendingPrompts.shift();
    if (next !== undefined) {
      await this.runTurn(next); // the inner frame owns the deferred hangup
      return;
    }
    // The maxCallSeconds hangup waited for this turn — the queue is empty and
    // the caller has heard the confirmation, so end now instead of at backstop.
    if (this.hangUpRequested) {
      clearTimeout(this.hangUpTimer);
      this.endCapped();
    }
  }

  private async runTurnInner(userText: string) {
    this.transcript.push({ role: "user", text: userText, ts: new Date().toISOString() });
    // Tell the model what WE said on its behalf since it last spoke, so it can
    // actually obey "at most one holding phrase" and "don't reuse a phrase".
    // Rides on the user turn because the API requires strict alternation and
    // this model does not accept a mid-conversation system message.
    const asides = this.spokenAsides.splice(0);
    const userContent = asides.length
      ? `(You already said out loud, just now: ${asides.map((a) => JSON.stringify(a)).join(" ")} — do not repeat any of it.)
${userText}`
      : userText;
    // Remembered verbatim: the silent-turn retry has to be able to identify the
    // exact message it pushed, and comparing against the raw userText stopped
    // working the moment an aside could be prefixed to it.
    this.lastUserContent = userContent;
    this.messages.push({ role: "user", content: userContent });
    this.interrupted = false;
    this.turnStartedAt = Date.now();
    // Nothing has been said on this turn yet. If the turn ends still false, the
    // caller got silence for an answer — see the recovery at the end.
    let spokeAnything = false;
    // A turn can spend seconds inside tool hops with the line completely quiet.
    // One short filler, once, deterministically — not left to the model, which
    // has already spent its single permitted holding phrase by prompt rule.
    // Cleared in runTurn's finally, so no exit path can leave it armed.
    const stopFiller = () => {
      clearTimeout(this.fillerTimer);
      this.fillerTimer = undefined;
    };
    this.fillerTimer = setTimeout(() => {
      if (!spokeAnything && !this.interrupted) {
        spokeAnything = true;
        this.speak("One moment.", false);
      }
    }, FILLER_AFTER_MS);

    // Tool hops and max_tokens continuations used to share ONE counter, so a
    // turn that got truncated three times had five hops left to do the actual
    // work — and when the shared budget ran out, the loop fell through to a
    // flush that spoke a half-finished word. They are separate budgets now:
    // hops measure how much WORK a turn is doing, continuations measure how
    // badly we mis-sized the output budget, and the two are unrelated.
    let hops = 0;
    let continuations = 0;
    while (hops < MAX_TOOL_HOPS && !this.interrupted) {
      hops++;
      const controller = new AbortController();
      this.controller = controller;

      // Computed before the request so the advanced anchor survives into the
      // next turn — an anchor that moves every turn is written and never read.
      const cached = withMessageCacheBreakpoints(this.messages as any, this.cacheAnchor);
      this.cacheAnchor = cached.anchorIndex;

      const stream = this.anthropic.messages.stream(
        {
          model: CONFIG.model,
          // 🚨 THIS BUDGET IS SHARED BY REASONING AND SPEECH.
          //
          // Adaptive thinking spends from the same allowance as the sentence
          // the caller hears, and thinking grows with how hard the model finds
          // the turn — which is exactly when the answer also needs room. Run it
          // too tight and the reasoning eats the reply, the sentence stops
          // mid-word, and the caller hears the agent break. Spoken answers here
          // are one or two sentences; the headroom is for the thinking.
          max_tokens: 8192,
          // Reasoning ON (Luigi, 2026-08-14), but at LOW effort.
          //
          // `effort` is NOT optional in practice: on this model it defaults to
          // HIGH, so enabling thinking without setting it — which is what
          // shipped in Fly v24 this morning — buys maximum reasoning on EVERY
          // turn, including "yes" and "pepperoni". Every one of those tokens is
          // generated before the caller hears a word, on a phone line where the
          // whole budget to first audio is under a second.
          //
          // Low still fixes what thinking was turned on for: a model with
          // reasoning disabled is documented to be LESS likely to reach for a
          // tool, which is how it announced "we do have extra large available"
          // without ever looking it up.
          output_config: { effort: "low" },
          // PROMPT CACHING — the single biggest cost lever on this service.
          // The system prompt carries the whole live menu and is byte-identical
          // on every turn of a call, but was being re-billed at full price each
          // turn: a real 135s call spent 1,686,948 input tokens ≈ $5.08, which
          // is unsustainable against a $99/mo plan. Caching writes it once
          // (1.25×) and reads it back at 0.1× on every later turn.
          // Render order is tools → system → messages, so this breakpoint
          // covers the tool definitions too. Requires system as a block array.
          system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
          tools: this.tools as any,
          // Breakpoints on the CONVERSATION: the newest message, plus a rolling
          // anchor further back. The system one only caches what precedes it,
          // so without these the conversation is re-billed every turn — and one
          // busy pizza turn can append 18 content blocks, enough to jump clean
          // over the API's 20-block lookback and silently re-prefill the whole
          // call. See cache-breakpoints.ts for why the anchor has to be stable
          // and why neither marker ever mutates the stored messages.
          messages: cached.messages as any,
          // Paired with output_config.effort above — see that comment. Adaptive
          // means the model spends reasoning only where the turn warrants it.
          thinking: { type: "adaptive" },
        } as any,
        { signal: controller.signal },
      );

      const requestStartedAt = Date.now();
      this.modelRequests++;
      let ttftMs: number | null = null;

      let assistantText = "";
      stream.on("text", (delta: string) => {
        if (this.interrupted) return;
        // TIME TO FIRST TOKEN — the only latency number that describes what the
        // caller hears. Everything else is bookkeeping.
        if (ttftMs === null) ttftMs = Date.now() - requestStartedAt;
        assistantText += delta;
        stopFiller();
        spokeAnything = true;
        // Anything spoken during a protected window is kept verbatim so it can
        // be repeated whole if the caller talks over it.
        if (Date.now() < this.protectedUntil) this.protectedText += delta;
        this.sendText(delta, false);
      });

      let final: any;
      try {
        final = await stream.finalMessage();
      } catch (e) {
        this.controller = null;
        if (this.interrupted) {
          // Record what was actually SPOKEN before the barge-in — without
          // this the model's history is missing its own half-sentence and it
          // resumes incoherently after an interrupt (review wf_a62b0536).
          if (assistantText.trim()) {
            this.messages.push({ role: "assistant", content: assistantText + " —" });
            this.transcript.push({ role: "assistant", text: assistantText + " [interrupted]", ts: new Date().toISOString() });
          } else {
            // Aborted before a single token — the caller's words were answered
            // with nothing at all. Nothing ran (finalMessage rejected before
            // stop_reason was read), so re-answering is side-effect free. Cancel
            // the moment the caller speaks again, so we never talk over them.
            this.scheduleSilentTurnRetry(userText);
          }
          return; // caller barged in — next prompt (or the resume timer) is a fresh turn
        }
        console.error("[nabil-voice] stream error", e);
        // 🚨 NEVER blame the caller for OUR outage, and never loop on it.
        //
        // On 2026-08-11 the Anthropic key was revoked upstream. Every turn
        // 401'd, and every 401 answered "Sorry, I didn't catch that — could
        // you say it again?" — so a caller who was speaking perfectly clearly
        // was told, over and over, that HE was the problem. That is the worst
        // failure mode this service can have: it wastes the caller's time,
        // reads as a broken restaurant, and hides the real fault from us.
        //
        // An auth/permission/quota failure will not fix itself inside this
        // call, so hand off on the FIRST one. Anything else gets exactly one
        // polite retry (a genuine blip or a truncated stream is worth
        // retrying) and then hands off too.
        const status = Number((e as { status?: unknown })?.status) || 0;
        const unrecoverable = status === 401 || status === 402 || status === 403 || status === 429;
        this.streamFailures++;
        if (unrecoverable || this.streamFailures >= 2) {
          this.ctx.pendingTransfer = `voice service error${status ? ` (${status})` : ""}`;
          this.speak(
            " I'm really sorry — I'm having trouble on my end, not with anything you said. Let me put you through to someone.",
            true,
          );
          this.endTransfer(this.ctx.pendingTransfer);
          return;
        }
        // 🚨 NOT "I didn't catch that". This branch is OUR stream failing —
        // the caller may have spoken perfectly. Telling them they were unclear
        // makes them repeat themselves into a system that is broken, and hides
        // the real fault from us; during the 2026-08-11 key revocation this
        // exact sentence was said on every turn of every call. Own it.
        this.speak(" Sorry — that dropped on my end. Go ahead.", true);
        return;
      }
      this.controller = null;
      // A turn came back — whatever was wrong has cleared.
      this.streamFailures = 0;

      this.messages.push({ role: "assistant", content: final.content });
      if (assistantText.trim()) this.transcript.push({ role: "assistant", text: assistantText, ts: new Date().toISOString() });
      // input_tokens is the UNCACHED remainder once prompt caching is on —
      // the cached prefix is reported separately. Keep tokensIn as the true
      // total prompt size (so the dashboard doesn't suddenly read as ~0), and
      // track the cache split so cost can be priced honestly: writes bill at
      // 1.25× and reads at 0.1× of the input rate.
      const u = final.usage ?? {};
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      this.usageIn += (u.input_tokens ?? 0) + cacheWrite + cacheRead;
      this.usageCacheWrite += cacheWrite;
      this.usageCacheRead += cacheRead;
      this.usageOut += u.output_tokens ?? 0;

      // Per-REQUEST, not per-turn. These two were previously summed into three
      // totals and the shape thrown away, which made a broken cache and a
      // healthy one produce identical numbers.
      this.perRequest.push({
        hop: hops,
        ttftMs,
        totalMs: Date.now() - requestStartedAt,
        cacheRead,
        cacheWrite,
        uncached: u.input_tokens ?? 0,
        stop: final.stop_reason ?? null,
      });
      // 🚨 THE CACHE CLIFF, CAUGHT IN THE ACT. Once a call has read from cache,
      // a request that reads NOTHING means the breakpoint fell outside the
      // 20-block lookback and we just re-processed the entire conversation at
      // full price — seconds of silence, no error, invisible until now.
      if (cacheRead === 0 && this.usageCacheRead > 0) {
        console.error("[nabil-voice] CACHE MISS mid-call — prefix re-processed", {
          callSid: this.token.callSid,
          request: this.modelRequests,
          hop: hops,
          uncached: u.input_tokens ?? 0,
          ttftMs,
        });
      }

      if (final.stop_reason === "max_tokens") {
        // A truncated turn otherwise flushed last:true and the caller heard
        // the sentence stop mid-word (review wf_a62b0536). Continue the turn.
        //
        // LOUD, because this is the mechanism behind "speaking broken
        // language" and it was completely silent: no log, no counter, nothing
        // in the call record. If this fires at all we have mis-sized
        // max_tokens against how much the model is reasoning.
        continuations++;
        console.warn("[nabil-voice] max_tokens truncation", {
          callSid: this.token.callSid,
          hop: hops,
          continuation: continuations,
          spokenChars: assistantText.length,
        });
        this.truncations++;
        // A continuation does NOT cost a tool hop (it isn't work), but it must
        // not loop forever either. Two attempts, then close the turn cleanly
        // rather than leaving a sentence hanging.
        if (continuations > MAX_CONTINUATIONS) {
          console.error("[nabil-voice] giving up on continuation", { callSid: this.token.callSid });
          this.sendText(" — sorry, let me start that again.", true);
          return;
        }
        hops--; // refund the hop: continuations and work are separate budgets
        this.messages.push({ role: "user", content: "(continue exactly where you left off — do not repeat what you already said)" });
        continue;
      }

      if (final.stop_reason === "tool_use") {
        const results: any[] = [];
        let stateChanged = false;
        for (const block of final.content) {
          if (block.type === "tool_use") {
            let out: any;
            // A tool hop emits no audio, so its duration IS silence on the
            // line. Timed so the filler threshold can be set from data instead
            // of from a guess.
            const toolStartedAt = Date.now();
            try {
              out = await executeTool(block.name, block.input, this.ctx);
              this.toolTimings.push({ name: block.name, ms: Date.now() - toolStartedAt, ok: !(out as any)?.error });
            } catch (e) {
              this.toolTimings.push({ name: block.name, ms: Date.now() - toolStartedAt, ok: false });
              console.error("[nabil-voice] tool failed", block.name, e);
              out = { error: true, message: "That didn't work — let me try another way." };
            }
            // add_pizza/add_combo mutate the call's basket, and quote_order's
            // spoken total is the number the caller agrees to — a barge-in must
            // not swallow either confirmation.
            // 🚨 KEEP THIS LIST SHORT. Protection means the caller CANNOT
            // interrupt the next sentence, and it used to cover every basket
            // edit — so on 2026-08-14 a caller trying to correct which half his
            // toppings went on was talking into a sentence that could not be
            // stopped, four separate times. Un-interruptible speech is a cost,
            // not a safety feature; it is only worth paying where a caller who
            // misses the words is left believing something false about their
            // money or their order.
            if (
              (block.name === "place_order" ||
                block.name === "book_reservation" ||
                block.name === "quote_order") &&
              (out as any)?.ok
            ) {
              stateChanged = true;
            }
            this.noteStruggle(block.name, out);
            this.noteOutcome(block.name, out);
            results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
          }
        }
        this.messages.push({ role: "user", content: results });
        // A barge-in racing a state-changing tool must NOT swallow the
        // confirmation: the order IS placed — the caller has to hear the
        // order number and total, or they assume it failed and re-order at
        // the store (review wf_a62b0536). Pure-speech turns keep normal
        // barge-in semantics.
        //
        // Clearing the flag was only ever half the fix, and 2026-08-13 proved
        // it: it un-aborts an interrupt that landed DURING the tool call, but
        // the confirmation is spoken on the NEXT stream, which was completely
        // unprotected. Roya talked over "your actual total comes to twenty five
        // ninety se—" and the one sentence that had to be heard was the one that
        // was lost. Open a protected window across the sentence itself.
        if (stateChanged) {
          this.interrupted = false;
          this.protectedUntil = Date.now() + PROTECT_MAX_MS;
          this.protectedText = "";
          this.bargedDuringProtected = false;
        }
        continue; // let the model speak its next turn
      }

      // Final assistant turn.
      this.closeProtectedWindow();
      this.sendText("", true);
      if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
      return;
    }

    // Hop cap exhausted (MAX_TOOL_HOPS consecutive tool / max_tokens rounds):
    // the final-turn branch above never ran, so the turn was never closed.
    // Flush the turn-final marker so ConversationRelay speaks the buffered
    // tail, and honor a transfer requested on the last hop instead of leaving
    // it stale for the next turn. The guard matters: the loop also exits on a
    // barge-in that landed after tool execution, and that path keeps today's
    // silent-abort semantics.
    this.closeProtectedWindow();
    if (!this.interrupted) {
      this.sendText("", true);
      if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
    } else if (!spokeAnything) {
      // The loop exited on an interrupt between hops and said nothing at all —
      // the third silent exit. Same recovery as an aborted first token.
      this.scheduleSilentTurnRetry(userText);
    }
  }

  /** Re-answer a turn that produced no audio whatsoever.
   *
   *  There are three ways to leave runTurnInner having said nothing — aborted
   *  before the first token, the loop condition failing on a stale interrupt,
   *  and every delta suppressed — and all three used to end in indefinite
   *  silence, because the 4s barge-in resume timer self-cancels when the last
   *  message is a USER turn (which is exactly what a zero-token abort leaves).
   *  That is what made Roya say "Hello?" into a dead line on 2026-08-13.
   *
   *  Deliberately a delay and not an immediate `continue`: the caller may still
   *  be talking, and the retry is cancelled the instant real speech arrives. */
  private scheduleSilentTurnRetry(userText: string) {
    // The caller has already moved on — either their next words are queued
    // behind this turn, or they landed while it was unwinding (an abort takes a
    // tick to propagate, so a prompt can arrive after the interrupt and before
    // we get here, which is precisely when the cancel-on-prompt path misses).
    // Re-answering the turn they abandoned would talk over the answer to what
    // they actually asked.
    if (this.pendingPrompts.length || this.lastPromptAt > this.turnStartedAt) return;
    clearTimeout(this.silentTurnTimer);
    this.silentTurnTimer = setTimeout(() => {
      this.silentTurnTimer = undefined;
      if (this.turnRunning || this.finalized) return;
      // Drop the unanswered user turn before replaying it — runTurnInner pushes
      // it again, and two identical user messages in a row confuse the model.
      //
      // 🚨 The two pops must agree. `transcript.pop()` used to be unconditional
      // while `messages.pop()` was guarded, so on the path where the guard
      // missed (the hop-cap exit, where the last message is a tool_result) the
      // user turn was left duplicated in history AND an unrelated line was
      // deleted from the owner's transcript. Reachable only late in a call,
      // which is exactly where we were already suspicious.
      const last = this.messages[this.messages.length - 1];
      const droppable =
        last?.role === "user" && this.lastUserContent !== null && last?.content === this.lastUserContent;
      if (droppable) {
        this.messages.pop();
        const lastT = this.transcript[this.transcript.length - 1];
        if (lastT?.role === "user" && lastT?.text === userText) this.transcript.pop();
      }
      this.interrupted = false;
      void this.runTurn(userText);
    }, SILENT_TURN_RETRY_MS);
  }

  /** Close a protected sentence, repeating it whole if the caller talked over
   *  it. ConversationRelay drops its TTS buffer the moment it reports a
   *  barge-in, so the audio is already gone — carrying on would resume
   *  mid-word ("…venty seven"). Say the sentence again, once. */
  private closeProtectedWindow() {
    if (!this.protectedUntil) return;
    const text = this.protectedText.trim();
    const barged = this.bargedDuringProtected;
    this.protectedUntil = 0;
    this.protectedText = "";
    this.bargedDuringProtected = false;
    if (barged && text) {
      this.speak(` Sorry — let me say that again. ${text}`, false);
      this.transcript.push({
        role: "assistant",
        text: `(repeated after barge-in) ${text}`,
        ts: new Date().toISOString(),
      });
    }
  }

  /**
   * Count the times the agent has failed at the same thing, and hand the call
   * to a person once it is clearly stuck.
   *
   * Luigi, 2026-08-14: a forty-second call that ends with a human beats a
   * four-minute call that ends with the wrong pizza. On the call that prompted
   * this, the agent spent three turns failing to place a topping and three more
   * failing to hear a name, and the caller absorbed all of it.
   *
   * A counter here rather than an instruction in the prompt, because the prompt
   * has been asked to police this before and cannot: the model is the thing
   * that is struggling, so it is the last thing that should be judging whether
   * to give up. `needsInfo` deliberately does NOT count — asking a caller which
   * half they want is the system working.
   */
  private noteStruggle(tool: string, out: any) {
    const failed = !!out?.error || out?.notPlaced === true;
    if (!failed) {
      // Any success clears the count: a caller who corrects themselves twice
      // and then lands it is not a struggling call.
      this.struggles = 0;
      return;
    }
    this.struggles++;
    if (this.struggles >= STRUGGLE_LIMIT && !this.ctx.pendingTransfer) {
      console.warn("[nabil-voice] struggling — handing off", {
        callSid: this.token.callSid,
        tool,
        code: out?.code ?? null,
        struggles: this.struggles,
      });
      this.ctx.pendingTransfer = `agent struggling (${this.struggles} failed attempts, last: ${tool})`;
      // Tell the model, so the caller gets a proper handoff sentence instead of
      // another attempt followed by the line going quiet. Mutating `out` is
      // safe here: this runs before the tool_result is serialised.
      if (out && typeof out === "object") {
        out.instruction =
          "STOP TRYING. This has failed twice and the caller is being put through to a person now. " +
          "Say one short, warm sentence — that you'll get someone who can sort it out — and nothing else. " +
          "Do not apologise at length, do not explain what went wrong, and do not attempt it again.";
      }
    }
  }

  /** Outcome taxonomy (contract pinned 2026-08-10): read-only tools NEVER
   *  stamp an outcome; a FAILED place_order/book_reservation stamps "error"
   *  (dashboard "needs attention"); transfer never overwrites a placed
   *  order/booked reservation; finalize() defaults the rest. */
  private noteOutcome(tool: string, out: any) {
    // The last total READ ALOUD, whether or not an order followed it. Captured
    // here rather than at placement so a caller who was quoted and then hung up
    // still leaves a record of the number they were given.
    if (tool === "quote_order" && out?.ok && typeof out.total === "number") {
      this.quotedTotal = out.total;
    }
    if (tool === "place_order") {
      if (out?.ok) {
        this.outcome = "order_placed";
        if (out.orderId != null) this.orderId = String(out.orderId);
        if (out.orderNumber != null) this.orderNumber = String(out.orderNumber);
        if (typeof out.total === "number") this.chargedTotal = out.total;
        // The quote the caller actually agreed to, as the tool saw it — more
        // reliable than the running one, which a later re-quote would overwrite.
        if (typeof out.quotedTotal === "number") this.quotedTotal = out.quotedTotal;
      } else {
        this.outcome = "error";
        // A refused placement still tells us the two numbers disagreed, and
        // that is exactly the event worth recording.
        if (typeof out?.total === "number") this.chargedTotal = out.total;
        if (typeof out?.quotedTotal === "number") this.quotedTotal = out.quotedTotal;
      }
    } else if (tool === "book_reservation") {
      if (out?.ok) {
        this.outcome = "reservation_booked";
        if (out.confirmationCode != null) this.reservationCode = String(out.confirmationCode);
      } else {
        this.outcome = "error";
      }
    } else if (tool === "transfer_to_human") {
      if (this.outcome !== "order_placed" && this.outcome !== "reservation_booked") {
        this.outcome = "transferred";
      }
    }
  }

  /**
   * What this call actually cost the caller in waiting, as one compact object.
   *
   * Percentiles rather than a mean: a call with nineteen 400ms replies and one
   * 6-second stall averages to something that looks fine and sounds broken.
   * p95 is the stall.
   */
  private latencySummary() {
    const pct = (xs: number[], p: number): number | null => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    };
    const ttfts = this.perRequest.map((r) => r.ttftMs).filter((n): n is number => typeof n === "number");
    const tools = this.toolTimings.map((t) => t.ms);
    // The index of the first request that read nothing from cache AFTER a
    // successful read — i.e. where the conversation fell out of the lookback
    // window. Null on a healthy call.
    let cacheCliffAtRequest: number | null = null;
    let seenRead = false;
    this.perRequest.forEach((r, i) => {
      if (r.cacheRead > 0) seenRead = true;
      else if (seenRead && cacheCliffAtRequest === null) cacheCliffAtRequest = i + 1;
    });
    return {
      requests: this.modelRequests,
      turns: this.userTurns,
      ttftMs: { p50: pct(ttfts, 50), p95: pct(ttfts, 95), max: ttfts.length ? Math.max(...ttfts) : null },
      toolMs: { p50: pct(tools, 50), p95: pct(tools, 95), max: tools.length ? Math.max(...tools) : null },
      slowestTools: [...this.toolTimings].sort((a, b) => b.ms - a.ms).slice(0, 5),
      truncations: this.truncations,
      cacheCliffAtRequest,
      cacheReadTokens: this.usageCacheRead,
      cacheWriteTokens: this.usageCacheWrite,
    };
  }

  /**
   * Say something the MODEL did not author — the holding phrase, a re-spoken
   * sentence, an apology for our own outage.
   *
   * 🚨 These used to go straight out through sendText and be recorded nowhere.
   * The caller heard them; the model had no idea they existed. So the prompt
   * rules "say at most ONE holding phrase" and "don't reuse a phrase" were
   * asking it to obey a rule about words it could not see, and the filler fires
   * MORE often as a call gets longer — longer call, more fillers it can't see,
   * more chances it adds its own, caller hears two in a row and it sounds
   * confused. A feedback loop keyed on elapsed call time.
   *
   * Recorded in the transcript (so the owner sees what was actually said) and
   * held for the next turn (so the model does). Not pushed into `messages`
   * directly: an assistant message here would break the strict user/assistant
   * alternation the API requires mid-turn.
   */
  private speak(text: string, last: boolean) {
    this.sendText(text, last);
    const clean = text.trim();
    if (!clean) return;
    this.transcript.push({ role: "assistant", text: clean, ts: new Date().toISOString() });
    this.spokenAsides.push(clean);
  }

  private sendText(token: string, last: boolean) {
    // Belt to the prompt's "no markdown" rule: strip formatting characters the
    // TTS would otherwise SPEAK — the first live call (2026-08-09) read
    // "asterisk asterisk" aloud every time the model bolded a price. Safe on
    // streamed deltas because these are single characters (a "**" split across
    // two deltas still dies here), and none of them have a legitimate spoken
    // use in any of our locales.
    const clean = token.replace(/[*_`~]/g, "");
    if (!clean && !last) return; // nothing left to say and not the flush marker
    try {
      this.ws.send(JSON.stringify({ type: "text", token: clean, last }));
    } catch {
      /* socket closed */
    }
  }

  private endTransfer(reason: string) {
    // Outcome was already stamped by noteOutcome — a transfer must NOT
    // overwrite order_placed/reservation_booked (contract 2026-08-10).
    try {
      this.ws.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason }) }));
    } catch {
      /* ignore */
    }
  }

  onClose() {
    this.controller?.abort();
    clearTimeout(this.resumeTimer);
    clearTimeout(this.wrapUpTimer);
    clearTimeout(this.hangUpTimer);
    // The caller has hung up: a pending retry or filler would start a whole new
    // model turn (and bill for it) talking to nobody.
    clearTimeout(this.silentTurnTimer);
    clearTimeout(this.fillerTimer);
    void this.finalize();
  }

  private async finalize() {
    if (this.finalized) return;
    this.finalized = true;
    // A tool can still be in flight when the socket closes — callers routinely
    // hang up the instant they say "yes", and the maxCallSeconds hangup makes
    // the same timing deterministic. The place_order POST carries no abort
    // signal, so the order WILL be created and printed: wait for the turn to
    // drain so the VoiceCall carries the real outcome + orderNumber instead of
    // logging "abandoned" against an order that exists. Capped at ~10s; the
    // row already exists from the "start" upsert and nothing user-facing
    // waits on this.
    for (let i = 0; this.turnRunning && i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    // Default outcome (contract): a caller who engaged (2+ real turns) got
    // answers → faq_answered; otherwise abandoned. A stamped outcome —
    // including "error" — always survives finalize.
    const outcome = this.outcome ?? (this.userTurns >= 2 ? "faq_answered" : "abandoned");
    try {
      const r = await api.logCall({
        event: "end",
        restaurantId: this.token.restaurantId,
        callSid: this.token.callSid,
        fromNumber: this.token.from,
        toNumber: this.token.to,
        language: this.language,
        outcome,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        // Voice never learns the DB Reservation id — only the spoken
        // confirmation code. The server resolves the id from the code.
        reservationId: null,
        reservationCode: this.reservationCode,
        customerId: this.customerId,
        transferReason: this.ctx.pendingTransfer,
        transcript: this.transcript,
        model: CONFIG.model,
        tokensIn: this.usageIn,
        tokensOut: this.usageOut,
        // Priced here because only the service sees the cache split; the
        // intelligence pass would otherwise bill cached reads at full rate.
        costCents: this.costCents(),
        durationSeconds: Math.round((Date.now() - this.startedAt) / 1000),
        // A difference between these two is a caller billed a price they never
        // agreed to. The dashboard flags it; nothing used to.
        quotedTotal: this.quotedTotal,
        chargedTotal: this.chargedTotal,
        latency: this.latencySummary(),
      });
      if (!r.ok) console.error("[nabil-voice] logCall rejected", r.status);
    } catch (e) {
      console.error("[nabil-voice] logCall failed", e);
    }

    // Missed-call text-back: a caller who engaged (2+ turns) but didn't place an
    // order/booking or get transferred gets a branded order link — recovers the
    // sale instead of losing it. Best-effort; gated on smsConfirmations.
    const engaged = this.userTurns >= 2;
    const completed =
      this.outcome === "order_placed" || this.outcome === "reservation_booked" || this.outcome === "transferred";
    if (this.ctx.cfg.smsConfirmations && engaged && !completed && this.token.from) {
      try {
        await api.sendSms({
          restaurantId: this.token.restaurantId,
          slug: this.token.slug,
          to: this.token.from,
          linkType: "order_online",
        });
      } catch {
        /* best-effort */
      }
    }
  }
}
