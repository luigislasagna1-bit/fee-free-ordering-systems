import type Anthropic from "@anthropic-ai/sdk";
import type { WebSocket } from "ws";
import { CONFIG, type CallToken } from "./config";
import { api } from "./api";
import { TOOLS, executeTool, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./prompt";

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
  private ready = false;
  private queued: string[] = [];
  private outcome: string | null = null;
  private orderId: string | null = null;
  private reservationId: string | null = null;
  private language: string | null = null;
  private usageIn = 0;
  private usageOut = 0;
  private startedAt = Date.now();
  private finalized = false;

  constructor(
    private ws: WebSocket,
    private token: CallToken,
    private anthropic: Anthropic,
  ) {
    this.ctx = { token, cfg: {}, cashDeliveryBlocked: false, pendingTransfer: null, orderSeq: 0 };
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
        if (text) void this.handlePrompt(String(text));
        break;
      }
      case "interrupt":
        this.interrupted = true;
        this.controller?.abort();
        break;
      case "dtmf":
        // Treat keypad input as spoken text (e.g. "press 1 for a person").
        if (msg.digit || msg.digits) void this.handlePrompt(`(pressed ${msg.digit ?? msg.digits})`);
        break;
      case "error":
        console.error("[nabil-voice] relay error", msg);
        break;
      default:
        break;
    }
  }

  private async init() {
    try {
      const [menu, context, returningCaller] = await Promise.all([
        api.menu(this.token.slug),
        api.context(this.token.slug),
        api.returningCaller(this.token.slug, this.token.from).catch(() => ({ found: false })),
      ]);
      this.ctx.cashDeliveryBlocked = !!context?.delivery?.cashDeliveryBlocked;
      // Config comes back on context in a later revision; default permissive.
      this.ctx.cfg = context?.config ?? { canTakeOrders: true, canBookReservations: true, canAnswerFaq: true };
      this.system = buildSystemPrompt({ menu, context, returningCaller, cfg: this.ctx.cfg });
    } catch (e) {
      console.error("[nabil-voice] init failed", e);
      this.system = `You are Nabil, the phone assistant for this restaurant. Apologize that you're having trouble accessing the menu right now and offer to connect the caller to a team member (call transfer_to_human).`;
    }
    this.ready = true;
    // Flush anything the caller said before we finished loading.
    const pending = this.queued.splice(0);
    for (const t of pending) await this.runTurn(t);
  }

  private async handlePrompt(text: string) {
    if (!this.ready) {
      this.queued.push(text);
      return;
    }
    await this.runTurn(text);
  }

  private async runTurn(userText: string) {
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
          max_tokens: 1024,
          system: this.system,
          tools: TOOLS as any,
          messages: this.messages,
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
        if (this.interrupted) return; // caller barged in — next prompt is a fresh turn
        console.error("[nabil-voice] stream error", e);
        this.sendText(" Sorry, I didn't catch that — could you say it again?", true);
        return;
      }
      this.controller = null;

      this.messages.push({ role: "assistant", content: final.content });
      if (assistantText.trim()) this.transcript.push({ role: "assistant", text: assistantText, ts: new Date().toISOString() });
      this.usageIn += final.usage?.input_tokens ?? 0;
      this.usageOut += final.usage?.output_tokens ?? 0;

      if (final.stop_reason === "tool_use") {
        const results: any[] = [];
        for (const block of final.content) {
          if (block.type === "tool_use") {
            let out: any;
            try {
              out = await executeTool(block.name, block.input, this.ctx);
            } catch (e) {
              console.error("[nabil-voice] tool failed", block.name, e);
              out = { error: true, message: "That didn't work — let me try another way." };
            }
            this.noteOutcome(block.name, out);
            results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
          }
        }
        this.messages.push({ role: "user", content: results });
        continue; // let the model speak its next turn
      }

      // Final assistant turn.
      this.sendText("", true);
      if (this.ctx.pendingTransfer) await this.endCall("transferred", this.ctx.pendingTransfer);
      return;
    }
  }

  private noteOutcome(tool: string, out: any) {
    if (tool === "place_order" && out?.ok) {
      this.outcome = "order_placed";
      this.orderId = out.orderId ?? out.orderNumber ?? null;
    } else if (tool === "book_reservation" && out?.ok) {
      this.outcome = "reservation_booked";
    } else if (tool === "transfer_to_human") {
      this.outcome = "transferred";
    } else if (!this.outcome) {
      this.outcome = "faq_answered";
    }
  }

  private sendText(token: string, last: boolean) {
    try {
      this.ws.send(JSON.stringify({ type: "text", token, last }));
    } catch {
      /* socket closed */
    }
  }

  private async endCall(outcome: string, reason: string) {
    this.outcome = outcome;
    try {
      this.ws.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason }) }));
    } catch {
      /* ignore */
    }
  }

  onClose() {
    this.controller?.abort();
    void this.finalize();
  }

  private async finalize() {
    if (this.finalized) return;
    this.finalized = true;
    try {
      await api.logCall({
        restaurantId: this.token.restaurantId,
        callSid: this.token.callSid,
        fromNumber: this.token.from,
        toNumber: this.token.to,
        language: this.language,
        outcome: this.outcome ?? "abandoned",
        orderId: this.orderId,
        reservationId: this.reservationId,
        transcript: this.transcript,
        model: CONFIG.model,
        tokensIn: this.usageIn,
        tokensOut: this.usageOut,
        durationSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      });
    } catch (e) {
      console.error("[nabil-voice] logCall failed", e);
    }

    // Missed-call text-back: a caller who engaged (2+ turns) but didn't place an
    // order/booking or get transferred gets a branded order link — recovers the
    // sale instead of losing it. Best-effort.
    const engaged = this.transcript.filter((t) => t.role === "user").length >= 2;
    const completed =
      this.outcome === "order_placed" || this.outcome === "reservation_booked" || this.outcome === "transferred";
    if (engaged && !completed && this.token.from) {
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
