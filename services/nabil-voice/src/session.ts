import type Anthropic from "@anthropic-ai/sdk";
import type { WebSocket } from "ws";
import { CONFIG, type CallToken } from "./config";
import { api } from "./api";
import { TOOLS, executeTool, toolsForConfig, canonicalPhone, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { normalizeAgentConfig } from "./agent-config";
import { withMessageCacheBreakpoint } from "./cache-breakpoints";
import { normalizeAsr } from "./asr-normalize";

/** maxCallSeconds timing (contract): wrap-up nudge at T-45s, hangup at T+15s. */
const WRAP_UP_LEAD_MS = 45_000;
const HANGUP_GRACE_MS = 15_000;

const MAX_TOOL_HOPS = 8;

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
    this.messages.push({ role: "user", content: userText });
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
        this.sendText("One moment.", false);
      }
    }, FILLER_AFTER_MS);

    let hops = 0;
    while (hops++ < MAX_TOOL_HOPS && !this.interrupted) {
      const controller = new AbortController();
      this.controller = controller;

      const stream = this.anthropic.messages.stream(
        {
          model: CONFIG.model,
          // 2048: cheap insurance against mid-word truncation on long
          // readbacks in token-dense locales (Hindi/German multi-item orders)
          // — the max_tokens continuation below is the backstop, this makes
          // it rare. Review wf_a62b0536.
          // 4096, not 2048: reasoning tokens now share this budget, and a
          // truncated turn is a sentence that stops mid-word.
          max_tokens: 4096,
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
          // SECOND breakpoint, on the newest message: the system one only
          // caches what precedes it, so the conversation itself was still
          // re-billed in full every turn — and it grew fast once pizza landed
          // (one get_item_options result is thousands of topping tokens that
          // then ride along for the rest of the call). See cache-breakpoints.ts
          // for why this never mutates the stored messages.
          messages: withMessageCacheBreakpoint(this.messages as any) as any,
          // Reasoning ON (Luigi, 2026-08-14, to be reviewed after a week).
          // Disabled is documented to make the model LESS likely to reach for a
          // tool — which is how it announced "we do have extra large available"
          // without ever looking. It costs ~0.3-0.8s before it speaks, on the
          // hard turns only; every other change in this batch buys that back.
          thinking: { type: "adaptive" },
        } as any,
        { signal: controller.signal },
      );

      let assistantText = "";
      stream.on("text", (delta: string) => {
        if (this.interrupted) return;
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
          this.sendText(
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
        this.sendText(" Sorry — that dropped on my end. Go ahead.", true);
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

      if (final.stop_reason === "max_tokens") {
        // A truncated turn otherwise flushed last:true and the caller heard
        // the sentence stop mid-word (review wf_a62b0536). Continue the turn.
        this.messages.push({ role: "user", content: "(continue exactly where you left off — do not repeat what you already said)" });
        continue;
      }

      if (final.stop_reason === "tool_use") {
        const results: any[] = [];
        let stateChanged = false;
        for (const block of final.content) {
          if (block.type === "tool_use") {
            let out: any;
            try {
              out = await executeTool(block.name, block.input, this.ctx);
            } catch (e) {
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
      const last = this.messages[this.messages.length - 1];
      if (last?.role === "user" && last?.content === userText) this.messages.pop();
      this.transcript.pop();
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
      this.sendText(` Sorry — let me say that again. ${text}`, false);
      this.transcript.push({
        role: "assistant",
        text: `(repeated after barge-in) ${text}`,
        ts: new Date().toISOString(),
      });
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
