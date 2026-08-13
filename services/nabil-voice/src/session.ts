import type Anthropic from "@anthropic-ai/sdk";
import type { WebSocket } from "ws";
import { CONFIG, type CallToken } from "./config";
import { api } from "./api";
import { TOOLS, executeTool, toolsForConfig, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { normalizeAgentConfig } from "./agent-config";
import { withMessageCacheBreakpoint } from "./cache-breakpoints";

/** maxCallSeconds timing (contract): wrap-up nudge at T-45s, hangup at T+15s. */
const WRAP_UP_LEAD_MS = 45_000;
const HANGUP_GRACE_MS = 15_000;

const MAX_TOOL_HOPS = 8;

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
  private outcome: string | null = null;
  private orderId: string | null = null;
  private orderNumber: string | null = null;
  private reservationCode: string | null = null;
  private customerId: string | null = null;
  private language: string | null = null;
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
        const text = msg.voicePrompt ?? msg.text ?? msg.transcript ?? "";
        if (msg.lang) this.language = msg.lang;
        this.lastPromptAt = Date.now();
        if (text) {
          // Real caller speech landed, so the barge-in resume is moot. Without
          // this the timer still fires after we've answered and the agent
          // re-speaks its pre-interrupt half-sentence over the caller.
          clearTimeout(this.resumeTimer);
          this.resumeTimer = undefined;
          this.userTurns++;
          void this.handlePrompt(String(text));
        }
        break;
      }
      case "interrupt":
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
          max_tokens: 2048,
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
          thinking: { type: "disabled" },
        } as any,
        { signal: controller.signal },
      );

      let assistantText = "";
      stream.on("text", (delta: string) => {
        if (this.interrupted) return;
        assistantText += delta;
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
        this.sendText(" Sorry, I didn't catch that — could you say it again?", true);
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
            if (
              (block.name === "place_order" ||
                block.name === "book_reservation" ||
                block.name === "send_sms_link" ||
                block.name === "add_pizza" ||
                block.name === "add_combo" ||
                block.name === "revise_line" ||
                block.name === "remove_line" ||
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
        if (stateChanged) this.interrupted = false;
        continue; // let the model speak its next turn
      }

      // Final assistant turn.
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
    if (!this.interrupted) {
      this.sendText("", true);
      if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
    }
  }

  /** Outcome taxonomy (contract pinned 2026-08-10): read-only tools NEVER
   *  stamp an outcome; a FAILED place_order/book_reservation stamps "error"
   *  (dashboard "needs attention"); transfer never overwrites a placed
   *  order/booked reservation; finalize() defaults the rest. */
  private noteOutcome(tool: string, out: any) {
    if (tool === "place_order") {
      if (out?.ok) {
        this.outcome = "order_placed";
        if (out.orderId != null) this.orderId = String(out.orderId);
        if (out.orderNumber != null) this.orderNumber = String(out.orderNumber);
      } else {
        this.outcome = "error";
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
