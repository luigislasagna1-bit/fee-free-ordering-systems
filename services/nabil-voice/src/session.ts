import type Anthropic from "@anthropic-ai/sdk";
import type { WebSocket } from "ws";
import { CONFIG, type CallToken } from "./config";
import { api as defaultApi, type VoiceApi } from "./api";
import { TOOLS, executeTool, toolsForConfig, canonicalPhone, stateOf, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { normalizeAgentConfig } from "./agent-config";
import { withMessageCacheBreakpoints } from "./cache-breakpoints";
import { normalizeAsr } from "./asr-normalize";
import { CartEngine } from "./cart-engine";
import { compilerFromApi } from "./compiler-port";
import { buildMenuIndex, type MenuIndex } from "./menu-index";
import { renderStateBlock, buildUserTurnContent } from "./turn-context";
import { createDialogueState, noteToolResult, noteSpoken, beginTurn as dialogueBeginTurn, type DialogueState } from "./dialogue-state";
import { compact, createCompactionState, estimateTokens, shouldCompact, type MessageMeta, type TranscriptEntry, type CompactionState } from "./compaction";
import { createEventSink, type EventSink } from "./events";
import { checkClaims } from "./claims-guard";
import { agentVersion, hashJson, quickHash, type Versions } from "./versions";
import { PLAYBOOK_PROTOCOL, PLAYBOOK_STYLE } from "./playbook";
import { isNarrationLeak } from "./narration-filter";
import { verbalizeNumbersEn } from "./spoken-numbers";
import { voicePhrase, voiceFillers } from "./voice-i18n";
import { captureError } from "./observability";

/** maxCallSeconds timing (contract): wrap-up nudge at T-45s, hangup at T+15s. */
const WRAP_UP_LEAD_MS = 45_000;
const HANGUP_GRACE_MS = 15_000;

const MAX_TOOL_HOPS = 8;
const MAX_CONTINUATIONS = 2;

/** An `interrupt` arriving within this long of a turn opening belongs to the
 *  sentence BEFORE it — fallback when the payload carries no heard text. */
const INTERRUPT_GRACE_MS = 800;

/** Filler policy: armed ONLY while a tool hop is running (silence during the
 *  tool + the next hop's TTFT), never on a plain answer's first-token latency.
 *  On 2026-08-15 the old 1.2 s any-turn filler spoke "One moment." on 12 of 17
 *  turns of a call whose plain TTFT was ~1 s. */
const FILLER_AFTER_TOOL_MS = 1_500;
/**
 * THINKING filler (call cmsw4s0mz, 2026-08-16): when the model's first hop
 * goes STRAIGHT to a tool (no acknowledgement first — the playbook asks for
 * one, the model skips it about half the time), the caller hears nothing for
 * the whole first-hop latency (2.6–4 s on that call, every pizza edit) and the
 * tool filler above only arms once the tool call has started. This one fires
 * once per turn if NO assistant text has streamed by the deadline, with a
 * short acknowledgement (never "one moment"), and never doubles the tool
 * filler (fillerUsed is shared). The deadline sits ABOVE a plain answer's
 * first-token latency (p50 ≈ 1.2 s, p95 ≈ 2.2 s) — the 2026-08-15 any-turn
 * filler that over-fired was 1.2 s. Test seam: SessionDeps.thinkingFillerMs.
 */
const THINKING_FILLER_AFTER_MS = 2_500;
/**
 * BOOKKEEPING MERGE (latency, Luigi's live call 2026-08-15: 2.9 s of silence
 * after "my name is Sam" because set_fulfilment + set_customer forced a second
 * model hop before "Thanks, Sam"). When a hop's tools are ALL of these, ALL
 * succeeded, and the model already spoke a complete sentence in that same
 * message, there is nothing left to say: the turn ends there and the
 * tool_result blocks ride at the front of the NEXT user message (a valid
 * shape — results first, then STATE + the caller's words). Saves ~1 s and one
 * request on every name / pickup turn. Anything whose RESULT the caller must
 * hear (a delivery address check with a fee, any cart change) is excluded.
 */
const MERGEABLE_TOOLS = new Set(["set_customer"]);
const isMergeableCall = (name: string, input: any): boolean =>
  MERGEABLE_TOOLS.has(name) || (name === "set_fulfilment" && String(input?.type ?? "").toLowerCase() === "pickup" && !input?.street);

/** Bare acknowledgement before a tool call ("Yep.", "Yeah.") — held in the TTS
 *  buffer and merged with the next sentence so the caller hears one phrase, not
 *  a choppy one-word utterance followed by silence while the tool runs. */
const BARE_ACK_RE = /^(ok(ay)?|yes|yeah|yep|sure|alright|right|got it|yup|mhm)\W*$/i;

const SILENT_TURN_RETRY_MS = 1_200;
/** A tail fragment counts only this soon after the previous reply finished. */
const TAIL_WINDOW_MS = 6_000;
/** One to three words that are the END of a sentence, never a request on their own. */
const TAIL_WORDS = /^(?:instead|please|too|as well|also|thanks|thank you|only|though|actually|and|or|for now|as well please|please instead)[.!,\s]*$/i;
export function isTailFragment(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (t.split(/\s+/).length > 3) return false;
  return TAIL_WORDS.test(t);
}
/**
 * EARLY FRAGMENTS (Roya's call, 2026-08-16 11:41): the model asked "what
 * topping would you like on it?" and, ONE millisecond after that reply was
 * generated — before a single word of it could have been played — Flux
 * delivered "special" as its own utterance (the tail of the caller's "Yes…
 * special"). It matched no tail word and the reply ended in "?", so it was
 * answered as a fresh turn and the caller heard the topping question twice.
 * Anything that arrives within EARLY_FRAGMENT_MS of a reply's end cannot be a
 * response to that reply — the caller has not heard it yet. It is held as
 * context for their real response; if nothing follows once the reply has been
 * spoken plus a pause, it runs as its own turn with a nudge framing.
 */
const EARLY_FRAGMENT_MS = 1_500;
const EARLY_FRAGMENT_MAX_WORDS = 3;
/** Silence after the reply is estimated to have finished playing before the held fragment runs on its own. */
const EARLY_FRAGMENT_SILENCE_MS = 7_000;
/** ~150 wpm ≈ 15 chars/s at 1.0×, plus first-audio latency. */
export function estimateSpeechMs(text: string): number {
  return Math.min(20_000, 600 + Math.round((String(text ?? "").length / 15) * 1000));
}
export function isEarlyFragment(text: string, msSinceReplyEnd: number, windowMs: number = EARLY_FRAGMENT_MS): boolean {
  const t = String(text ?? "").trim();
  if (windowMs <= 0) return false;
  if (!t || msSinceReplyEnd < 0 || msSinceReplyEnd > windowMs) return false;
  if (/^\(pressed /.test(t)) return false; // DTMF markers are never fragments
  return t.split(/\s+/).length <= EARLY_FRAGMENT_MAX_WORDS;
}
/** Hard cap on how long one sentence may hold off barge-in. */
const PROTECT_MAX_MS = 8_000;
const STRUGGLE_LIMIT = 3;
/** How often the event log is flushed to the app mid-call (crash-safety). */
const EVENT_FLUSH_EVERY_TURNS = 10;

/** Menu hashes already upserted by THIS process — the app dedupes by hash too,
 *  this only saves the 1 MB round trip on every call. */
const KNOWN_MENU_HASHES = new Set<string>();

export type SessionDeps = {
  api?: VoiceApi;
  now?: () => number;
  events?: EventSink;
  /** Test seam: the sim harness's scripted caller answers within milliseconds
   *  of a reply because there is no TTS to hear — real timing can't exist
   *  there. 0 disables the early-fragment hold. Default EARLY_FRAGMENT_MS. */
  earlyFragmentMs?: number;
  /** Silence before the THINKING filler speaks (no assistant text yet this
   *  turn). 0 disables it. Default THINKING_FILLER_AFTER_MS. */
  thinkingFillerMs?: number;
};

type PerRequest = { hop: number; ttftMs: number | null; totalMs: number; cacheRead: number; cacheWrite: number; uncached: number; stop: string | null };

/**
 * One phone call. Bridges the Twilio ConversationRelay WebSocket to a Claude
 * turn-loop with tools, with the AUTHORITATIVE CART (cart-engine.ts) as the
 * source of truth for the order and a STATE block re-rendered into every turn
 * so the model reads the order instead of remembering it.
 */
export class CallSession {
  private messages: any[] = [];
  private messageMeta: MessageMeta[] = [];
  private system = "";
  private callFacts = "";
  private callFactsSent = false;
  private ctx: ToolContext;
  private readonly api: VoiceApi;
  private readonly now: () => number;
  private readonly events: EventSink;
  private transcript: TranscriptEntry[] = [];
  private interrupted = false;
  private controller: AbortController | null = null;
  private streamFailures = 0;
  private ready = false;
  private queued: string[] = [];
  private pendingPrompts: string[] = [];
  /** tool_result blocks held back by the bookkeeping merge — prepended to the next user message. */
  private pendingToolResults: any[] = [];
  private lastPromptAt = 0;
  private lastTurnEndedAt = 0;
  /** Flux tail fragments absorbed since the last turn (see handlePrompt). */
  private tailFragments: string[] = [];
  /** Runs a held EARLY fragment on its own if the caller says nothing more (see handlePrompt). */
  private earlyFragmentTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly earlyFragmentMs: number;
  private readonly thinkingFillerMs: number;
  private thinkingFillerTimer: ReturnType<typeof setTimeout> | undefined;
  /** Last REAL barge-in (not stale, not during a protected sentence): the caller
   *  was talking over the reply, so what follows is a real utterance, never an
   *  early fragment. */
  private lastBargeInAt = 0;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;
  private turnRunning = false;
  private turnStartedAt = 0;
  private turnIndex = 0;
  private silentTurnTimer: ReturnType<typeof setTimeout> | undefined;
  private fillerTimer: ReturnType<typeof setTimeout> | undefined;
  private fillerCount = 0;
  private lastFillerPhrase = "";
  private protectedUntil = 0;
  private protectedText = "";
  /** Pending TTS text when CONFIG.ttsChunk === "sentence" (flushed at clause boundaries). */
  private ttsBuffer = "";
  /** Token mode: deltas held back so a number is never split across the wire
   *  before spoken-numbers.ts sees it whole ("647-" | "669-" | "0808"). */
  private tokBuffer = "";
  private bargedDuringProtected = false;
  /** Text spoken so far in the CURRENT stream — what an interrupt payload is compared against. */
  private currentStreamText = "";
  /** Everything the caller has heard in the CURRENT turn before the current
   *  stream: earlier hops' sentences and any filler ("Okay.", "Let me check
   *  that."). An interrupt whose heard text is a prefix of THIS is a real
   *  barge-in on this turn, never a stale one — the thinking filler made a
   *  400 ms barge-in read as stale (its words were the "last spoken text" and
   *  not the stream's), so the caller's correction was ignored (T11, 2026-08-16). */
  private turnSpokenSoFar = "";
  private lastSpokenText = "";
  private outcome: string | null = null;
  private orderId: string | null = null;
  private orderNumber: string | null = null;
  private reservationCode: string | null = null;
  private customerId: string | null = null;
  private language: string | null = null;
  private quotedTotal: number | null = null;
  private chargedTotal: number | null = null;
  private usageIn = 0;
  private usageOut = 0;
  private usageCacheWrite = 0;
  private usageCacheRead = 0;
  private perRequest: PerRequest[] = [];
  private toolTimings: Array<{ name: string; ms: number; ok: boolean }> = [];
  private truncations = 0;
  private modelRequests = 0;
  private cacheAnchor: number | null = null;
  private spokenAsides: string[] = [];
  private struggles = 0;
  private startedAt: number;
  private finalized = false;
  private userTurns = 0;
  private tools: typeof TOOLS = TOOLS;
  private wrapUpTimer: ReturnType<typeof setTimeout> | undefined;
  private hangUpTimer: ReturnType<typeof setTimeout> | undefined;
  private wrapUpInjected = false;
  private hangUpRequested = false;
  private dialogue: DialogueState = createDialogueState();
  private compaction: CompactionState = createCompactionState();
  private versions: Versions;
  private menuHash: string | null = null;
  private menuFacts: { soldOut: string[]; notToday: string[] } = { soldOut: [], notToday: [] };
  private hallucinationSuspects = 0;
  private narrationDropped = 0;
  /** Digit → words substitutions made before the voice (spoken-numbers.ts). */
  private numbersVerbalized = 0;
  /** The greeting Nabil spoke at the top of the call (set externally for Media
   *  Streams; reconstructed from config for ConversationRelay). Used to detect
   *  speakerphone echo: the ASR picks up the speaker output and sends it as
   *  caller speech, which the model would answer as a real utterance. */
  private greetingText = "";
  /** Epoch millis when AI handed the call to a human — billing stops here. */
  private transferredAt: number | null = null;
  private ttfaMsList: number[] = [];
  private eventFlushInFlight: Promise<unknown> | null = null;

  constructor(
    private ws: WebSocket,
    private token: CallToken,
    private anthropic: Anthropic,
    deps: SessionDeps = {},
  ) {
    this.api = deps.api ?? defaultApi;
    this.now = deps.now ?? Date.now;
    this.earlyFragmentMs = deps.earlyFragmentMs ?? EARLY_FRAGMENT_MS;
    this.thinkingFillerMs = deps.thinkingFillerMs ?? THINKING_FILLER_AFTER_MS;
    this.events = deps.events ?? createEventSink(this.now);
    this.startedAt = this.now();
    const cfg = normalizeAgentConfig(undefined);
    // Placeholder engine until init() loads the menu — tools cannot run before
    // `ready`, so this is never used for real, but the type is total.
    const emptyMenu = buildMenuIndex({ menu: [] });
    this.ctx = {
      token,
      cfg,
      api: this.api,
      cart: new CartEngine({ compiler: { compile: async () => ({ ok: false, code: "not_ready", message: "not ready" }) }, menu: emptyMenu }),
      menu: emptyMenu,
      cashDeliveryBlocked: false,
      pendingTransfer: null,
      itemOptionsCache: new Map(),
      speakExactlyThisTurn: [],
      currency: "usd",
    };
    this.versions = {
      agentVersion: agentVersion(),
      promptVersion: quickHash([PLAYBOOK_STYLE, PLAYBOOK_PROTOCOL]),
      toolsVersion: quickHash(TOOLS),
      model: CONFIG.model,
      modelConfig: { thinking: CONFIG.thinking, maxTokens: CONFIG.maxTokens, effort: "low" },
      menuSnapshotHash: null,
      cfgHash: null,
      sttModel: token.sttModel ?? null,
      ttsVoice: token.ttsVoice ?? null,
    };
  }

  /** Called by the server layer (Media Streams) to store the greeting Nabil
   *  spoke, so echo detection works against the exact text. Also seeds
   *  lastSpokenText so the stale-interrupt detector recognises a greeting echo
   *  interrupt as stale (the greeting wasn't spoken through the session's TTS
   *  path, so lastSpokenText would otherwise be empty). */
  setGreeting(text: string) {
    const t = (text || "").trim();
    if (t) {
      this.greetingText = t;
      this.lastSpokenText = t;
    }
  }

  /** Test/sim accessor: the authoritative cart. */
  debugCart(): CartEngine {
    return this.ctx.cart;
  }
  debugVersions(): Versions {
    return this.versions;
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
        // Partial transcripts are never requested; guard anyway — acting on one
        // would double-process the utterance.
        if (msg.last === false) break;
        const text = normalizeAsr(String(msg.voicePrompt ?? msg.text ?? msg.transcript ?? ""));
        if (msg.lang) this.language = msg.lang;
        this.lastPromptAt = this.now();
        if (text) {
          // GREETING ECHO GUARD (call cmsw33f3l, 2026-08-16): on speakerphone
          // the ASR picks up Nabil's own greeting from the speaker and sends it
          // as caller speech. Drop it before it reaches the model — a greeting
          // echo is never a real utterance (nobody calls a restaurant and says
          // "Thanks for calling Luigi's"). Only the first prompt can be an echo;
          // after the caller has spoken once, the ASR is locked on their voice.
          if (this.userTurns === 0 && this.isGreetingEcho(text)) {
            this.events.emit({ type: "greeting_echo_dropped", turn: this.turnIndex, text });
            break;
          }
          clearTimeout(this.resumeTimer);
          this.resumeTimer = undefined;
          clearTimeout(this.silentTurnTimer);
          this.silentTurnTimer = undefined;
          this.userTurns++;
          void this.handlePrompt(String(text));
        }
        break;
      }
      case "interrupt": {
        const heard: string | null = typeof msg.utteranceUntilInterrupt === "string" ? msg.utteranceUntilInterrupt : null;
        // Stale = belongs to the PREVIOUS sentence: either the payload says so
        // (it is a prefix of the last completed sentence and not of the
        // current stream) or, without a payload, it landed within the grace
        // window of the turn opening.
        const heardTrim = (heard ?? "").trim();
        // What the caller has heard of THIS turn so far: earlier hops + fillers +
        // the live stream. A prefix of that is a barge-in on this turn.
        // The payload echoes the text WE SENT — i.e. the spoken form (numbers
        // as words, spoken-numbers.ts) — so both sides are compared in that
        // form; otherwise a stale interrupt on "…is 647-669-0808…" would never
        // match "…is six four seven…" and would abort the live turn.
        const heardThisTurn = this.spokenForm(this.turnRunning ? this.turnSpokenSoFar + this.currentStreamText : this.currentStreamText, true);
        const stale = heardTrim
          ? this.spokenForm(this.lastSpokenText, true).startsWith(heardTrim) && !heardThisTurn.startsWith(heardTrim)
          : this.turnRunning && this.now() - this.turnStartedAt < INTERRUPT_GRACE_MS;
        const duringProtected = this.now() < this.protectedUntil;
        this.events.emit({ type: "interrupt", turn: this.turnIndex, heard, stale, duringProtected });
        if (stale) break;
        if (duringProtected) {
          this.bargedDuringProtected = true;
          break;
        }
        this.interrupted = true;
        this.lastBargeInAt = this.now();
        this.ttsBuffer = ""; // never speak buffered text after the caller cut in
        this.tokBuffer = "";
        if (heard !== null) this.currentStreamText = heard;
        this.controller?.abort();
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          const last = this.messages[this.messages.length - 1];
          const lastText = typeof last?.content === "string" ? last.content : "";
          // Only resume when there IS a real partial to pick up.
          if (last?.role !== "assistant" || !/ —$/.test(lastText)) return;
          if (this.now() - this.lastPromptAt > 2000 && !this.turnRunning) {
            const prefix = lastText.replace(/ —$/, "").slice(-160);
            void this.runTurn(`(You were cut off after: "${prefix}". The caller didn't actually say anything. Finish that thought in one short sentence.)`, true);
          }
        }, 4000);
        break;
      }
      case "dtmf":
        if (msg.digit || msg.digits) {
          this.lastPromptAt = this.now();
          clearTimeout(this.resumeTimer);
          this.resumeTimer = undefined;
          this.userTurns++;
          void this.handlePrompt(`(pressed ${msg.digit ?? msg.digits})`);
        }
        break;
      case "error":
        console.error("[nabil-voice] relay error", msg);
        captureError(new Error(`relay error: ${String(msg?.description ?? msg?.message ?? "relay error")}`), { where: "relay", callSid: this.token.callSid, restaurantId: this.token.restaurantId });
        this.events.emit({ type: "error", turn: this.turnIndex, where: "relay", message: String(msg?.description ?? msg?.message ?? "relay error") });
        break;
      default:
        break;
    }
  }

  private async init() {
    void this.api
      .logCallStart({
        event: "start",
        restaurantId: this.token.restaurantId,
        callSid: this.token.callSid,
        fromNumber: this.token.from,
        toNumber: this.token.to,
        startedAtIso: new Date(this.now()).toISOString(),
      })
      .then((r) => {
        if (!r.ok) {
          console.error("[nabil-voice] logCallStart rejected", r.status);
          captureError(new Error(`logCallStart rejected ${r.status}`), { where: "logCallStart", callSid: this.token.callSid, restaurantId: this.token.restaurantId, extra: { status: r.status } });
        }
      })
      .catch((e) => {
        console.error("[nabil-voice] logCallStart failed", e);
        captureError(e, { where: "logCallStart", callSid: this.token.callSid, restaurantId: this.token.restaurantId });
      });

    try {
      const [menu, context, returningCaller] = await Promise.all([
        this.api.menu(this.token.slug),
        this.api.context(this.token.slug),
        this.api.returningCaller(this.token.slug, this.token.from).catch(() => ({ found: false })),
      ]);
      this.ctx.cashDeliveryBlocked = !!context?.delivery?.cashDeliveryBlocked;
      this.ctx.cfg = normalizeAgentConfig(context?.config);
      if (this.token.isDemo && (!this.ctx.cfg.maxCallSeconds || this.ctx.cfg.maxCallSeconds > 240)) {
        this.ctx.cfg.maxCallSeconds = 240;
      }
      this.ctx.currency = String(menu?.restaurant?.currency || context?.restaurant?.currency || "usd");
      this.customerId = typeof (returningCaller as any)?.customerId === "string" ? (returningCaller as any).customerId : null;
      const knownName = (returningCaller as any)?.found ? (returningCaller as any)?.name : null;

      // THE MENU INDEX + THE CART ENGINE. The engine's compiler port is the
      // app's build-line route (same compiler the web store uses).
      const menuIndex: MenuIndex = buildMenuIndex(menu);
      this.ctx.menu = menuIndex;
      this.menuHash = hashJson(menu);
      // Store the menu this call saw, ONCE per hash per process, so a failed
      // call can be replayed against the exact menu it ran on (directive §26).
      // Fire-and-forget; a 1 MB upsert must never delay the greeting.
      if (this.menuHash && !KNOWN_MENU_HASHES.has(this.menuHash)) {
        KNOWN_MENU_HASHES.add(this.menuHash);
        void this.api
          .logEvents({ event: "menu-snapshot", restaurantId: this.token.restaurantId, hash: this.menuHash, payload: menu })
          .catch((e) => {
            KNOWN_MENU_HASHES.delete(this.menuHash!);
            console.error("[nabil-voice] menu-snapshot upsert failed", e);
          });
      }
      this.menuFacts = {
        soldOut: menuIndex.entries().filter((e) => e.soldOut).map((e) => e.name),
        notToday: menuIndex.notToday.map((n) => n.name),
      };
      const slug = this.token.slug;
      const api = this.api;
      this.ctx.cart = new CartEngine({
        compiler: compilerFromApi(api, slug),
        menu: menuIndex,
        askGroupIds: this.ctx.cfg.pizzaAskGroups,
        offerDeals: this.ctx.cfg.offerDayDeals,
        allowPizzaCombo: this.ctx.cfg.allowPizzaCombo,
        callerId: canonicalPhone(this.token.from || "") || null,
        knownName: typeof knownName === "string" && knownName.trim() ? knownName.trim() : null,
      });

      const built = buildSystemPrompt({ menu, context, returningCaller, cfg: this.ctx.cfg, callerPhone: this.token.from, isDemo: !!this.token.isDemo });
      this.system = built.system;
      this.callFacts = built.callFacts;
      this.versions.menuSnapshotHash = this.menuHash;
      this.versions.cfgHash = quickHash(this.ctx.cfg);
      this.versions.promptVersion = quickHash([PLAYBOOK_STYLE, PLAYBOOK_PROTOCOL, this.ctx.cfg.allowPizzaCombo, this.ctx.cfg.canTakeOrders, this.ctx.cfg.canBookReservations]);
    } catch (e) {
      console.error("[nabil-voice] init failed", e);
      captureError(e, { where: "init", callSid: this.token.callSid, restaurantId: this.token.restaurantId });
      this.events.emit({ type: "error", turn: 0, where: "init", message: String((e as Error)?.message ?? e) });
      this.system = `You are Nabil, the phone assistant for this restaurant. Apologize that you're having trouble accessing the menu right now and offer to connect the caller to a team member (call transfer_to_human).`;
    }
    this.tools = toolsForConfig(this.ctx.cfg);
    this.versions.toolsVersion = quickHash(this.tools);
    this.events.emit({ type: "call_start", turn: 0, versions: this.versions as any, from: this.token.from ?? null, to: this.token.to ?? null });
    this.startMaxCallTimers();
    this.ready = true;
    const pending = this.queued.splice(0);
    for (const t of pending) await this.runTurn(t);
  }

  private costCents(): number {
    const IN_PER_TOK = 3 / 1_000_000;
    const OUT_PER_TOK = 15 / 1_000_000;
    const uncachedIn = Math.max(0, this.usageIn - this.usageCacheWrite - this.usageCacheRead);
    const writeMult = CONFIG.cacheTtl === "1h" ? 2 : 1.25;
    const dollars = uncachedIn * IN_PER_TOK + this.usageCacheWrite * IN_PER_TOK * writeMult + this.usageCacheRead * IN_PER_TOK * 0.1 + this.usageOut * OUT_PER_TOK;
    return Math.round(dollars * 100);
  }

  private startMaxCallTimers() {
    const max = this.ctx.cfg.maxCallSeconds;
    if (!max) return;
    const elapsed = this.now() - this.startedAt;
    this.wrapUpTimer = setTimeout(() => {
      if (this.finalized || this.wrapUpInjected) return;
      this.wrapUpInjected = true;
      void this.handlePrompt("(You are nearing the maximum call length. Wrap up politely now — finish the current action first.)", true);
    }, Math.max(0, max * 1000 - WRAP_UP_LEAD_MS - elapsed));
    this.hangUpTimer = setTimeout(() => {
      if (this.finalized) return;
      if (this.turnRunning) {
        this.hangUpRequested = true;
        this.hangUpTimer = setTimeout(() => this.endCapped(), 30_000);
        return;
      }
      this.endCapped();
    }, Math.max(0, max * 1000 + HANGUP_GRACE_MS - elapsed));
  }

  private endCapped() {
    if (this.finalized) return;
    this.interrupted = true;
    this.controller?.abort();
    try {
      this.ws.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason: "call_time_limit" }) }));
    } catch {
      /* ignore */
    }
  }

  private async handlePrompt(text: string, synthetic = false) {
    if (!this.ready) {
      this.queued.push(text);
      return;
    }
    // FLUX TAIL FRAGMENTS (2026-08-16): Deepgram Flux ends a turn at a short
    // pause, so the tail of a sentence ("…and the wings barbecue" / "instead.")
    // can arrive as its own prompt AFTER the reply was already spoken. Answering
    // it ("Sorry, what would you like instead?") is exactly the "random" a
    // caller notices. A short tail arriving within a few seconds of the last
    // reply, when that reply asked no question, is folded into the next turn.
    if (!synthetic && !this.turnRunning && isTailFragment(text) && this.now() - this.lastTurnEndedAt <= TAIL_WINDOW_MS && !/\?\s*$/.test(this.lastSpokenText.trim())) {
      this.tailFragments.push(text.trim());
      this.transcript.push({ role: "user", text, ts: new Date(this.now()).toISOString(), turn: this.turnIndex });
      this.events.emit({ type: "tail_fragment", turn: this.turnIndex, text });
      return;
    }
    // EARLY FRAGMENTS (see isEarlyFragment): a short utterance landing before
    // the previous reply could have been heard is not a response to it. Hold
    // it as context for the caller's real response; if the reply has played
    // and the caller stays silent, run it on its own with a nudge framing.
    if (
      !synthetic &&
      !this.turnRunning &&
      this.turnIndex > 0 &&
      this.earlyFragmentMs > 0 &&
      // a barge-in in the last few seconds means the caller is talking over us —
      // their words are a real utterance, not the tail of an earlier one
      this.now() - this.lastBargeInAt > 5_000 &&
      isEarlyFragment(text, this.now() - this.lastTurnEndedAt, this.earlyFragmentMs)
    ) {
      this.tailFragments.push(text.trim());
      this.transcript.push({ role: "user", text, ts: new Date(this.now()).toISOString(), turn: this.turnIndex });
      this.events.emit({ type: "tail_fragment", turn: this.turnIndex, text, early: true });
      clearTimeout(this.earlyFragmentTimer);
      const wait = estimateSpeechMs(this.lastSpokenText) + EARLY_FRAGMENT_SILENCE_MS;
      this.earlyFragmentTimer = setTimeout(() => {
        this.earlyFragmentTimer = undefined;
        if (this.finalized || this.turnRunning || !this.tailFragments.length) return;
        void this.runTurn("", false, "early_fragment_alone");
      }, wait);
      return;
    }
    clearTimeout(this.earlyFragmentTimer);
    this.earlyFragmentTimer = undefined;
    // Serialize turns. A prompt that lands while a turn is running waits —
    // and is COALESCED with any others that queue behind it: two prompts
    // during one turn are almost always one utterance split by endpointing
    // ("Yeah." + "Yes." made two orders on 2026-08-10).
    if (this.turnRunning) {
      this.pendingPrompts.push(text);
      return;
    }
    await this.runTurn(text, synthetic);
  }

  private async runTurn(userText: string, synthetic = false, mode: "normal" | "early_fragment_alone" = "normal") {
    this.turnRunning = true;
    // A tail fragment absorbed since the last turn rides in as context, not as
    // a question to answer.
    const tails = this.tailFragments.splice(0);
    const text =
      mode === "early_fragment_alone"
        ? `(Right after their previous sentence they added "${tails.join(" ")}", and have said nothing since. If that was a request, act on it now; if it was just the tail of what they'd said, briefly re-ask your last question in different words.)`
        : tails.length && !synthetic
          ? `(Right after their previous sentence they added "${tails.join(" ")}" — the tail of that sentence, nothing to answer.) ${userText}`
          : userText;
    try {
      await this.runTurnInner(text, synthetic);
    } finally {
      this.turnRunning = false;
      this.lastTurnEndedAt = this.now();
      clearTimeout(this.fillerTimer);
      this.fillerTimer = undefined;
      clearTimeout(this.thinkingFillerTimer);
      this.thinkingFillerTimer = undefined;
    }
    if (this.pendingPrompts.length) {
      const joined = this.pendingPrompts.splice(0).join(" ");
      await this.runTurn(joined);
      return;
    }
    if (this.hangUpRequested) {
      clearTimeout(this.hangUpTimer);
      this.endCapped();
    }
    if (this.turnIndex % EVENT_FLUSH_EVERY_TURNS === 0) this.flushEvents();
  }

  private pushMessage(msg: any, meta: MessageMeta) {
    this.messages.push(msg);
    this.messageMeta.push(meta);
  }

  private stateBlockFor(turn: number, extraNotes: string[] = []): string | null {
    const cart = this.ctx.cart;
    const order = cart.stateForModel();
    const relevant = order.lines.length > 0 || order.fulfilment.type !== null || this.dialogue.pending !== null || order.placed.length > 0 || this.dialogue.placeFailed !== null || extraNotes.length > 0;
    if (!relevant && !this.ctx.cfg.canTakeOrders) return null;
    if (!relevant) return null;
    return renderStateBlock({ order: { ...order, turn }, dialogue: this.dialogue, extraNotes });
  }

  private async runTurnInner(userText: string, synthetic: boolean) {
    this.turnIndex++;
    const turn = this.turnIndex;
    const cart = this.ctx.cart;
    cart.beginTurn();
    dialogueBeginTurn(this.dialogue, turn);
    this.ctx.speakExactlyThisTurn = [];
    this.ctx.lastUserText = synthetic ? undefined : userText;
    // The caller's own words, last three turns — what halfRecipes must be
    // justified against (a recipe named two turns ago, added now, is fine).
    if (!synthetic) this.ctx.recentUserTexts = [...(this.ctx.recentUserTexts ?? []), userText].slice(-3);
    const cartHashBefore = cart.cartHash();
    const turnStarted = this.now();

    // Compaction runs BETWEEN turns only, before this turn's message is pushed.
    let compacted = false;
    if (shouldCompact(this.messages, this.compaction, turn)) {
      const before = this.messages.length;
      const r = compact({ messages: this.messages, meta: this.messageMeta, transcript: this.transcript, turn, cs: this.compaction, ledger: this.ledgerFacts() });
      this.messages = r.messages;
      this.messageMeta = r.meta;
      this.cacheAnchor = null;
      compacted = true;
      this.events.emit({ type: "compaction", turn, droppedMessages: before - r.messages.length, bytesBefore: r.bytesBefore, bytesAfter: r.bytesAfter });
    }

    this.transcript.push({ role: "user", text: userText, ts: new Date(this.now()).toISOString(), turn });
    this.events.emit({ type: "asr", turn, text: userText, lang: this.language, synthetic });

    const asides = this.spokenAsides.splice(0);
    const extra: string[] = [];
    if (!this.callFactsSent && this.callFacts) {
      extra.push(...this.callFacts.split("\n"));
      this.callFactsSent = true;
    }
    const stateBlock = this.stateBlockFor(turn, extra) ?? (extra.length ? `[CALL FACTS]\n${extra.join("\n")}\n[/CALL FACTS]` : null);
    // Results held back by the bookkeeping merge ride at the FRONT of this
    // message (tool_result blocks must precede any text in the reply turn).
    const content = [...this.pendingToolResults.splice(0), ...buildUserTurnContent({ stateBlock, asides, text: userText })];
    this.pushMessage({ role: "user", content }, { turn, kind: "user" });
    this.interrupted = false;
    this.turnStartedAt = this.now();
    this.currentStreamText = "";
    this.turnSpokenSoFar = "";
    let spokeAnything = false;
    let spokenThisTurn = "";
    let ttfaMs: number | null = null;
    let fillerUsed: { phrase: string; afterMs: number } | null = null;
    let mergedBookkeeping = false;
    const toolOutputsThisTurn: unknown[] = [];
    const toolNamesThisTurn: string[] = [];
    const hopsRecord: Array<{ hop: number; ttftMs: number | null; totalMs: number; stop: string | null; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number }> = [];
    const toolsRecord: Array<{ name: string; ms: number; ok: boolean }> = [];

    const stopFiller = () => {
      clearTimeout(this.fillerTimer);
      this.fillerTimer = undefined;
      clearTimeout(this.thinkingFillerTimer);
      this.thinkingFillerTimer = undefined;
    };
    // THINKING filler — see THINKING_FILLER_AFTER_MS. Armed once per turn, at
    // the turn's start; the first streamed text token (stopFiller in the
    // "text" handler), a barge-in, or a protected sentence cancels it.
    if (this.thinkingFillerMs > 0 && !synthetic) {
      clearTimeout(this.thinkingFillerTimer);
      const armedAt = this.now();
      this.thinkingFillerTimer = setTimeout(() => {
        this.thinkingFillerTimer = undefined;
        if (spokeAnything || fillerUsed || this.interrupted || this.now() < this.protectedUntil) return;
        const thinkPhrases = voiceFillers(this.language ?? this.token.lang, "thinkingFillers");
        const phrase = thinkPhrases[(this.fillerCount + turn) % thinkPhrases.length];
        this.lastFillerPhrase = phrase;
        this.fillerCount++;
        fillerUsed = { phrase, afterMs: this.now() - armedAt };
        spokeAnything = true;
        this.speak(`${phrase} `, false);
        this.events.emit({ type: "filler", turn, hop: 1, tool: null, afterMs: this.now() - armedAt, phrase, kind: "thinking" });
      }, this.thinkingFillerMs);
    }
    const armFiller = (toolName: string, hop: number) => {
      stopFiller();
      const armedAt = this.now();
      this.fillerTimer = setTimeout(() => {
        // No "let me check that" while merely saving a name or "pickup" — the
        // caller heard exactly that on 2026-08-15 and asked "what happened?".
        if (fillerUsed || this.interrupted || this.now() < this.protectedUntil || toolName === "transfer_to_human" || toolName === "set_customer" || toolName === "set_fulfilment") return;
        const toolPhrases = voiceFillers(this.language ?? this.token.lang, "fillers");
        const phrase = toolPhrases.filter((p) => p !== this.lastFillerPhrase)[(this.fillerCount + turn) % (toolPhrases.length - 1)] ?? toolPhrases[0];
        this.lastFillerPhrase = phrase;
        this.fillerCount++;
        fillerUsed = { phrase, afterMs: this.now() - armedAt };
        spokeAnything = true;
        this.speak(`${phrase} `, false);
        this.events.emit({ type: "filler", turn, hop, tool: toolName, afterMs: this.now() - armedAt, phrase });
      }, FILLER_AFTER_TOOL_MS);
    };

    let hops = 0;
    let continuations = 0;
    while (hops < MAX_TOOL_HOPS && !this.interrupted) {
      hops++;
      const controller = new AbortController();
      this.controller = controller;
      const cached = withMessageCacheBreakpoints(this.messages as any, this.cacheAnchor);
      this.cacheAnchor = cached.anchorIndex;

      const params: any = {
        model: CONFIG.model,
        max_tokens: CONFIG.maxTokens,
        // The store prefix (system + menu) is byte-identical across calls to
        // the same store — cache it with a long TTL so the dinner rush reads it.
        system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral", ttl: CONFIG.cacheTtl } }],
        tools: this.tools as any,
        messages: cached.messages as any,
      };
      if (CONFIG.thinking === "adaptive") {
        params.thinking = { type: "adaptive" };
        params.output_config = { effort: "low" };
      } else {
        params.thinking = { type: "disabled" };
      }
      const stream = this.anthropic.messages.stream(params, { signal: controller.signal });

      const requestStartedAt = this.now();
      this.modelRequests++;
      let ttftMs: number | null = null;
      let assistantText = "";
      stream.on("text", (delta: string) => {
        if (this.interrupted) return;
        if (ttftMs === null) ttftMs = this.now() - requestStartedAt;
        if (ttfaMs === null) ttfaMs = this.now() - turnStarted;
        assistantText += delta;
        this.currentStreamText = assistantText;
        stopFiller();
        spokeAnything = true;
        if (this.now() < this.protectedUntil) this.protectedText += delta;
        this.sendText(delta, false);
      });

      let final: any;
      try {
        final = await stream.finalMessage();
      } catch (e) {
        this.controller = null;
        if (this.interrupted) {
          // Record what the caller actually HEARD (the interrupt payload
          // truncated currentStreamText to the heard prefix when available).
          const heard = this.currentStreamText.trim() || assistantText.trim();
          if (heard) {
            this.pushMessage({ role: "assistant", content: heard + " —" }, { turn, kind: "assistant" });
            this.transcript.push({ role: "assistant", text: heard + " [interrupted]", ts: new Date(this.now()).toISOString(), turn });
            this.lastSpokenText = heard;
            spokenThisTurn += heard;
            this.events.emit({ type: "model_text", turn, hop: hops, text: heard, interrupted: true });
          } else {
            this.scheduleSilentTurnRetry(userText, turn);
          }
          this.emitTurnEvent({ turn, userText, synthetic, hopsRecord, toolsRecord, ttfaMs, fillerUsed, interrupted: true, spoken: spokenThisTurn, cartHashBefore, stateBlock, compacted });
          return;
        }
        console.error("[nabil-voice] stream error", e);
        captureError(e, { where: "model", callSid: this.token.callSid, restaurantId: this.token.restaurantId, extra: { status: Number((e as { status?: unknown })?.status) || 0, hop: hops } });
        const status = Number((e as { status?: unknown })?.status) || 0;
        const unrecoverable = status === 401 || status === 402 || status === 403 || status === 429;
        this.streamFailures++;
        this.events.emit({ type: "error", turn, where: "model", message: `${status || "stream"}: ${String((e as Error)?.message ?? e).slice(0, 200)}` });
        if (unrecoverable || this.streamFailures >= 2) {
          this.ctx.pendingTransfer = `voice service error${status ? ` (${status})` : ""}`;
          this.speak(` ${voicePhrase(this.language ?? this.token.lang, "errorTransfer")}`, true);
          this.endTransfer(this.ctx.pendingTransfer);
          return;
        }
        this.speak(` ${voicePhrase(this.language ?? this.token.lang, "errorDropped")}`, true);
        return;
      }
      this.controller = null;
      this.streamFailures = 0;

      this.pushMessage({ role: "assistant", content: final.content }, { turn, kind: "assistant" });
      if (assistantText.trim()) {
        this.transcript.push({ role: "assistant", text: assistantText, ts: new Date(this.now()).toISOString(), turn });
        this.lastSpokenText = assistantText;
        this.turnSpokenSoFar += assistantText;
        spokenThisTurn += (spokenThisTurn ? " " : "") + assistantText;
        this.events.emit({ type: "model_text", turn, hop: hops, text: assistantText, interrupted: false });
        noteSpoken(this.dialogue);
      }
      const u = final.usage ?? {};
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      this.usageIn += (u.input_tokens ?? 0) + cacheWrite + cacheRead;
      this.usageCacheWrite += cacheWrite;
      this.usageCacheRead += cacheRead;
      this.usageOut += u.output_tokens ?? 0;
      const totalMs = this.now() - requestStartedAt;
      this.perRequest.push({ hop: hops, ttftMs, totalMs, cacheRead, cacheWrite, uncached: u.input_tokens ?? 0, stop: final.stop_reason ?? null });
      hopsRecord.push({ hop: hops, ttftMs, totalMs, stop: final.stop_reason ?? null, tokensIn: (u.input_tokens ?? 0) + cacheWrite + cacheRead, tokensOut: u.output_tokens ?? 0, cacheRead, cacheWrite });
      if (cacheRead === 0 && this.usageCacheRead > 0) {
        console.error("[nabil-voice] CACHE MISS mid-call — prefix re-processed", { callSid: this.token.callSid, request: this.modelRequests, hop: hops, uncached: u.input_tokens ?? 0, ttftMs });
        this.events.emit({ type: "cache_miss", turn, request: this.modelRequests, uncached: u.input_tokens ?? 0 });
      }

      if (final.stop_reason === "max_tokens") {
        continuations++;
        this.truncations++;
        console.warn("[nabil-voice] max_tokens truncation", { callSid: this.token.callSid, hop: hops, continuation: continuations, spokenChars: assistantText.length });
        if (continuations > MAX_CONTINUATIONS) {
          this.sendText(` ${voicePhrase(this.language ?? this.token.lang, "errorRestart")}`, true);
          break;
        }
        hops--;
        this.pushMessage({ role: "user", content: "(continue exactly where you left off — do not repeat what you already said)" }, { turn, kind: "continuation" });
        continue;
      }

      if (final.stop_reason === "tool_use") {
        const results: any[] = [];
        let stateChanged = false;
        const toolNames: string[] = [];
        for (const block of final.content) {
          if (block.type !== "tool_use") continue;
          toolNames.push(block.name);
          const before = this.ctx.cart.cartHash();
          this.events.emit({ type: "tool_use", turn, hop: hops, toolUseId: block.id, name: block.name, input: block.input, cartHashBefore: before });
          armFiller(block.name, hops);
          const toolStartedAt = this.now();
          let out: any;
          try {
            out = await executeTool(block.name, block.input, this.ctx);
          } catch (e) {
            console.error("[nabil-voice] tool failed", block.name, e);
            captureError(e, { where: "tool", callSid: this.token.callSid, restaurantId: this.token.restaurantId, extra: { tool: block.name } });
            out = { error: true, code: "tool_exception", message: "That didn't work — let me try another way." };
          }
          const ms = this.now() - toolStartedAt;
          const ok = !(out as any)?.error && (out as any)?.ok !== false;
          this.toolTimings.push({ name: block.name, ms, ok });
          toolsRecord.push({ name: block.name, ms, ok });
          toolOutputsThisTurn.push(out);
          toolNamesThisTurn.push(block.name);
          const after = this.ctx.cart.cartHash();
          noteToolResult(this.dialogue, turn, block.name, block.input, out, after);
          this.events.emit({ type: "tool_result", turn, hop: hops, toolUseId: block.id, name: block.name, ok, code: (out as any)?.code ?? null, ms, output: out, cartHashAfter: after });
          if (before !== after) {
            const st = stateOf(out);
            this.events.emit({ type: "cart", turn, hash: after, lines: st?.lines ?? null, problems: st?.problems ?? null, fulfilment: st?.fulfilment ?? null });
          }
          if ((block.name === "place_order" || block.name === "book_reservation" || block.name === "quote_order") && (out as any)?.ok) stateChanged = true;
          this.noteStruggle(block.name, out);
          this.noteOutcome(block.name, out);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
        }
        // BOOKKEEPING MERGE — see MERGEABLE_TOOLS. The model already said its
        // sentence; the results only close the loop, so they wait for the next
        // user message instead of costing a second hop of silence.
        // The merged reply must hand the turn BACK to the caller with a
        // question ("Thanks, Sam — what can I get for you?"). "Thanks, Riley."
        // alone leaves silence where the second hop would have asked the next
        // thing (gate 2026-08-15, I03: the number check never came).
        const spokeSentence = /\?["')]?\s*$/.test(assistantText.trim()) && assistantText.trim().length >= 8;
        const mergeable =
          !this.interrupted &&
          spokeSentence &&
          final.content.every((b: any) => b.type !== "tool_use" || isMergeableCall(b.name, b.input)) &&
          toolOutputsThisTurn.slice(-toolNames.length).every((o: any) => o && o.ok !== false && !o.error && !o.needsInfo);
        if (mergeable) {
          this.pendingToolResults.push(
            ...results.map((r: any) => ({
              ...r,
              // Compact: the next STATE block carries the customer / fulfilment; the payload need not.
              content: JSON.stringify({ ok: true, applied: true, note: "applied while you were speaking; see STATE" }),
            })),
          );
          mergedBookkeeping = true;
          this.closeProtectedWindow();
          this.sendText("", true);
          if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
          break;
        }
        // The tool RAN — its result goes into history no matter what happens
        // to the sentence after it, or the model's next turn believes the
        // order is something it isn't.
        this.pushMessage({ role: "user", content: results }, { turn, kind: "tool_result", toolNames });
        if (stateChanged) {
          this.interrupted = false;
          this.protectedUntil = this.now() + PROTECT_MAX_MS;
          this.protectedText = "";
          this.bargedDuringProtected = false;
        }
        continue;
      }

      // Final assistant turn.
      this.closeProtectedWindow();
      this.sendText("", true);
      if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
      break;
    }

    if (hops >= MAX_TOOL_HOPS && !this.interrupted) {
      this.closeProtectedWindow();
      this.sendText("", true);
      if (this.ctx.pendingTransfer) this.endTransfer(this.ctx.pendingTransfer);
    } else if (this.interrupted && !spokeAnything) {
      this.scheduleSilentTurnRetry(userText, turn);
    }

    // Grounding measurement over what the caller heard this turn.
    if (spokenThisTurn.trim()) {
      const hits = checkClaims({
        spoken: spokenThisTurn,
        toolOutputs: toolOutputsThisTurn,
        toolNames: toolNamesThisTurn,
        placedThisCall: this.ctx.cart.placedOrders().length > 0,
        speakExactly: this.ctx.speakExactlyThisTurn,
        menuFacts: this.menuFacts,
      });
      for (const h of hits) {
        this.hallucinationSuspects++;
        this.events.emit({ type: "hallucination_suspect", turn, kind: h.kind, sentence: h.sentence.slice(0, 300), evidence: h.evidence.slice(0, 5) });
      }
    }
    if (ttfaMs !== null) this.ttfaMsList.push(ttfaMs);
    this.emitTurnEvent({ turn, userText, synthetic, hopsRecord, toolsRecord, ttfaMs, fillerUsed, interrupted: this.interrupted, spoken: spokenThisTurn, cartHashBefore, stateBlock, compacted, mergedBookkeeping });
  }

  private emitTurnEvent(a: {
    turn: number;
    userText: string;
    synthetic: boolean;
    hopsRecord: any[];
    toolsRecord: any[];
    ttfaMs: number | null;
    fillerUsed: { phrase: string; afterMs: number } | null;
    interrupted: boolean;
    spoken: string;
    cartHashBefore: string;
    stateBlock: string | null;
    compacted: boolean;
    mergedBookkeeping?: boolean;
  }) {
    this.events.emit({
      type: "turn",
      turn: a.turn,
      turnId: `${this.token.callSid}#${a.turn}`,
      utterance: a.userText,
      synthetic: a.synthetic,
      hops: a.hopsRecord,
      tools: a.toolsRecord,
      ttfaMs: a.ttfaMs,
      filler: a.fillerUsed,
      interrupted: a.interrupted,
      spoken: a.spoken,
      cartHashBefore: a.cartHashBefore,
      cartHashAfter: this.ctx.cart.cartHash(),
      stateChars: a.stateBlock?.length ?? 0,
      messagesEstTokens: estimateTokens(this.messages),
      ...(a.mergedBookkeeping ? { mergedBookkeeping: true } : {}),
    });
    if (a.compacted) {
      /* recorded separately */
    }
  }

  /** Non-transactional facts for the compaction digest. */
  private ledgerFacts(): string[] {
    const out: string[] = [];
    const declined = this.dialogue.offered.filter((o) => o.outcome === "declined").map((o) => o.what);
    if (declined.length) out.push(`offered and declined: ${declined.join(", ")}`);
    if (this.language && this.language !== "en-US") out.push(`caller language: ${this.language}`);
    return out;
  }

  private scheduleSilentTurnRetry(userText: string, turn: number) {
    if (this.pendingPrompts.length || this.lastPromptAt > this.turnStartedAt) return;
    clearTimeout(this.silentTurnTimer);
    this.silentTurnTimer = setTimeout(() => {
      this.silentTurnTimer = undefined;
      if (this.turnRunning || this.finalized) return;
      // Drop the unanswered user turn (identified by its META, not by string
      // equality on content that now carries a state block) before replaying it.
      const lastIdx = this.messages.length - 1;
      const lastMeta = this.messageMeta[lastIdx];
      if (lastMeta && lastMeta.kind === "user" && lastMeta.turn === turn) {
        this.messages.pop();
        this.messageMeta.pop();
        const lastT = this.transcript[this.transcript.length - 1];
        if (lastT?.role === "user" && lastT?.turn === turn) this.transcript.pop();
        this.turnIndex = Math.max(0, this.turnIndex - 1);
      }
      this.interrupted = false;
      void this.runTurn(userText);
    }, SILENT_TURN_RETRY_MS);
  }

  private closeProtectedWindow() {
    if (!this.protectedUntil) return;
    const text = this.protectedText.trim();
    const barged = this.bargedDuringProtected;
    this.protectedUntil = 0;
    this.protectedText = "";
    this.bargedDuringProtected = false;
    if (barged && text) {
      this.speak(` ${voicePhrase(this.language ?? this.token.lang, "errorRepeat")} ${text}`, false);
      this.transcript.push({ role: "assistant", text: `(repeated after barge-in) ${text}`, ts: new Date(this.now()).toISOString(), turn: this.turnIndex });
      this.events.emit({ type: "protected_respoken", turn: this.turnIndex, text });
    }
  }

  /** Two failed attempts at the same thing → a person. `needsInfo` deliberately
   *  does NOT count — asking the caller a question is the system working. */
  private noteStruggle(tool: string, out: any) {
    const failed = (!!out?.error || out?.notPlaced === true) && !out?.needsInfo;
    if (!failed) {
      if (out?.ok) {
        this.struggles = 0;
        // A success AFTER the struggle hand-off was armed in this same turn
        // means the model recovered (bench T25, 2026-08-15: two bad ids, then
        // find_menu_item, then a clean add — and the caller was transferred
        // anyway). Only a turn that ENDS in failure hands off.
        if (this.ctx.pendingTransfer?.startsWith("agent struggling")) this.ctx.pendingTransfer = null;
      }
      return;
    }
    // A wrong menu id is the model's own slip with an obvious recovery
    // (find_menu_item) — the tool result says so. It is not a reason to give
    // up on the caller.
    if (out?.code === "unknown_item") return;
    // A recipe the caller didn't name is a one-hop correction (send the
    // toppings instead), not a failure to serve — never counts toward hand-off.
    if (out?.code === "recipe_not_named") return;
    this.struggles++;
    if (this.struggles >= STRUGGLE_LIMIT && !this.ctx.pendingTransfer) {
      console.warn("[nabil-voice] struggling — handing off", { callSid: this.token.callSid, tool, code: out?.code ?? null, struggles: this.struggles });
      this.ctx.pendingTransfer = `agent struggling (${this.struggles} failed attempts, last: ${tool})`;
      if (out && typeof out === "object") {
        out.instruction =
          "STOP TRYING. This has failed twice and the caller is being put through to a person now. Say one short, warm sentence — that you'll get someone who can sort it out — and nothing else.";
      }
    }
  }

  private noteOutcome(tool: string, out: any) {
    if (tool === "quote_order" && out?.ok && typeof out.total === "number") this.quotedTotal = out.total;
    if (tool === "place_order") {
      if (out?.ok) {
        this.outcome = "order_placed";
        if (out.orderId != null) this.orderId = String(out.orderId);
        if (out.orderNumber != null) this.orderNumber = String(out.orderNumber);
        if (typeof out.total === "number") this.chargedTotal = out.total;
        if (typeof out.quotedTotal === "number") this.quotedTotal = out.quotedTotal;
      } else if (out?.refused !== "prepayment_required" && !out?.needsInfo && out?.code !== "cart_invalid" && out?.code !== "not_quoted") {
        this.outcome = "error";
        if (typeof out?.total === "number") this.chargedTotal = out.total;
        if (typeof out?.quotedTotal === "number") this.quotedTotal = out.quotedTotal;
      }
    } else if (tool === "book_reservation") {
      this.outcome = out?.ok ? "reservation_booked" : "error";
      if (out?.ok && out.confirmationCode != null) this.reservationCode = String(out.confirmationCode);
    } else if (tool === "transfer_to_human") {
      if (this.outcome !== "order_placed" && this.outcome !== "reservation_booked") this.outcome = "transferred";
    }
  }

  private latencySummary() {
    const pct = (xs: number[], p: number): number | null => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    };
    const ttfts = this.perRequest.map((r) => r.ttftMs).filter((n): n is number => typeof n === "number");
    const tools = this.toolTimings.map((t) => t.ms);
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
      ttfaMs: { p50: pct(this.ttfaMsList, 50), p95: pct(this.ttfaMsList, 95) },
      toolMs: { p50: pct(tools, 50), p95: pct(tools, 95), max: tools.length ? Math.max(...tools) : null },
      slowestTools: [...this.toolTimings].sort((a, b) => b.ms - a.ms).slice(0, 5),
      truncations: this.truncations,
      fillers: this.fillerCount,
      hallucinationSuspects: this.hallucinationSuspects,
      narrationDropped: this.narrationDropped,
      numbersVerbalized: this.numbersVerbalized,
      cacheCliffAtRequest,
      cacheReadTokens: this.usageCacheRead,
      cacheWriteTokens: this.usageCacheWrite,
      messagesEstTokens: estimateTokens(this.messages),
    };
  }

  /** Say something the MODEL did not author. Recorded in the transcript and
   *  told to the model on its next turn. */
  private speak(text: string, last: boolean) {
    this.sendText(text, last);
    const clean = text.trim();
    if (!clean) return;
    this.transcript.push({ role: "assistant", text: clean, ts: new Date(this.now()).toISOString(), turn: this.turnIndex });
    this.spokenAsides.push(clean);
    this.lastSpokenText = clean;
    // Fillers/asides are part of what the caller hears in this turn — an
    // interrupt right after "Okay." is a barge-in on THIS turn.
    if (this.turnRunning) this.turnSpokenSoFar += text.replace(/[*_`~#]/g, "");
  }

  private sendText(token: string, last: boolean) {
    const clean = token.replace(/[*_`~#]/g, "");
    if (!clean && !last) return;
    if (CONFIG.ttsChunk === "sentence") {
      // Buffer to SENTENCE boundaries so (a) the voice gets whole phrases, not
      // three-word fragments ("Take your time." arrived as three tokens on
      // 2026-08-15 and came out as mumble), and (b) a sentence that is the
      // model thinking aloud can be DROPPED before anyone hears it
      // (narration-filter.ts). Flush on . ! ? … or at 140 chars.
      this.ttsBuffer += clean;
      if (!last) {
        const m = /^([\s\S]*?[.!?…]["')]?(?=\s|$))([\s\S]*)$/.exec(this.ttsBuffer);
        if (m && m[1].trim()) {
          // Bare filler hold: "Yep." or "Yeah." before a tool call sounds
          // robotic when spoken alone. Replace its period with a comma so it
          // merges with the next sentence: "Yep, got it, pickup it is."
          if (BARE_ACK_RE.test(m[1].trim())) {
            this.ttsBuffer = m[1].trim().replace(/[.!]$/, ", ") + m[2];
          } else {
            this.ttsBuffer = m[2];
            this.speakClause(m[1], false);
          }
        } else if (this.ttsBuffer.length >= 140) {
          // Long clause: cut at a point that doesn't split a number, so
          // "647-669-0808" is never half in one chunk and half in the next.
          const cut = this.numberSafeFlushIndex(this.ttsBuffer);
          const chunk = this.ttsBuffer.slice(0, cut);
          this.ttsBuffer = this.ttsBuffer.slice(cut);
          if (chunk) this.speakClause(chunk, false);
        }
        return;
      }
      const rest = this.ttsBuffer;
      this.ttsBuffer = "";
      this.speakClause(rest, true);
      return;
    }
    // Token mode: forward deltas as they arrive, but hold from the first
    // digit-bearing word until a whole plain word (or the sentence end) has
    // followed it, so the number reaches spoken-numbers.ts in one piece.
    this.tokBuffer += clean;
    if (last) {
      const out = this.tokBuffer;
      this.tokBuffer = "";
      this.wsSendText(this.spokenForm(out), true);
      return;
    }
    const cut = this.numberSafeFlushIndex(this.tokBuffer);
    if (cut > 0) {
      const out = this.tokBuffer.slice(0, cut);
      this.tokBuffer = this.tokBuffer.slice(cut);
      this.wsSendText(this.spokenForm(out), false);
    }
  }

  /**
   * How much of `buf` can go to the voice without splitting a number. All of
   * it when there are no digits; otherwise up to the start of the first
   * digit-bearing word — or past the number once a whole non-numeric word
   * (or a sentence end) has followed the last digit-bearing word. A held span
   * of 140+ chars is released whole (a number that long is not a number).
   */
  private numberSafeFlushIndex(buf: string): number {
    const first = buf.search(/[\d$½¼¾]/);
    if (first < 0) return buf.length;
    let zoneStart = first;
    while (zoneStart > 0 && !/\s/.test(buf[zoneStart - 1])) zoneStart--;
    const held = buf.slice(zoneStart);
    const m = /^([\s\S]*[\d$½¼¾][^\s]*)(?:[.!?…]["')]?\s|\s+[^\s\d$½¼¾]+\s)/.exec(held);
    if (m) return zoneStart + m[0].length;
    if (held.length >= 140) return buf.length;
    return zoneStart;
  }

  /** True when the caller's first utterance is Nabil's own greeting echoing
   *  back from a speakerphone. Exact prefix match when the greeting text is
   *  known; pattern fallback for standard openers otherwise. */
  private isGreetingEcho(text: string): boolean {
    const normWords = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    if (this.greetingText) {
      const pw = normWords(text);
      const gw = normWords(this.greetingText);
      if (pw.length >= 3) {
        let match = true;
        for (let i = 0; i < pw.length && i < gw.length; i++) {
          if (pw[i] !== gw[i]) { match = false; break; }
        }
        if (match && pw.length <= gw.length) return true;
      }
    }
    const t = text.trim();
    return /^this call may be recorded/i.test(t) || /^than(?:k you|ks) for calling\b/i.test(t);
  }

  /**
   * The spoken form of text about to reach the voice: numbers as words on an
   * English call (spoken-numbers.ts); untouched otherwise. `silent` = a
   * comparison, not a send (no event, no counter).
   */
  private spokenForm(text: string, silent = false): string {
    if (!text) return text;
    const lang = this.language ?? this.token.lang ?? "en-US";
    if (!/^en(?:[-_]|$)/i.test(lang)) return text;
    const r = verbalizeNumbersEn(text.replace(/[*_`~#]/g, ""));
    if (r.changes && !silent) {
      this.numbersVerbalized += r.changes;
      this.events.emit({ type: "numbers_verbalized", turn: this.turnIndex, count: r.changes });
    }
    return r.text.replace(/\bBBQ\b/gi, "barbecue");
  }

  /** Sentence-chunk mode: forward a complete clause unless it is narration. */
  private speakClause(clause: string, last: boolean) {
    if (clause.trim() && isNarrationLeak(clause)) {
      // Rescue a bare-ack filler ("Sure,") that was comma-merged into this
      // narration clause — without this the caller hears silence.
      const ci = clause.indexOf(", ");
      if (ci > 0 && BARE_ACK_RE.test(clause.slice(0, ci).trim() + ".")) {
        this.wsSendText(this.spokenForm(clause.slice(0, ci).trim() + "."), last);
      } else if (last) {
        this.wsSendText("", true);
      }
      this.narrationDropped++;
      this.events.emit({ type: "narration_dropped", turn: this.turnIndex, text: clause.trim().slice(0, 300) });
      return;
    }
    this.wsSendText(this.spokenForm(clause), last);
  }

  private wsSendText(token: string, last: boolean) {
    try {
      this.ws.send(JSON.stringify({ type: "text", token, last }));
    } catch {
      /* socket closed */
    }
  }

  private endTransfer(reason: string) {
    if (!this.transferredAt) this.transferredAt = this.now();
    try {
      this.ws.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason }) }));
    } catch {
      /* ignore */
    }
  }

  /**
   * Deploy / restart drain — hand the caller to a person rather than letting the
   * socket die under them. (2026-08-15)
   *
   * Before this existed, `fly deploy` just killed the process. The caller was
   * not left in silence — the WebSocket dropped, ConversationRelay ended, and
   * Twilio's <Connect action> fired the handoff route, so their phone was warm-
   * transferred to the store. But it happened mid-sentence with no explanation,
   * and `finalize()` was killed in flight: the call record, transcript, cost and
   * revenue attribution were all lost. A deploy silently erased whatever calls
   * were live, which is why "how many calls did we take today" could quietly
   * undercount.
   *
   * One sentence, the same end-of-relay path a normal transfer uses, then the
   * record is actually written before the process goes away.
   */
  async shutdownTransfer(reason = "service_restart"): Promise<void> {
    if (this.finalized) return;
    this.interrupted = true;
    this.controller?.abort();
    this.ctx.pendingTransfer = reason;
    this.speak(` ${voicePhrase(this.language ?? this.token.lang, "transferHold")}`, true);
    this.endTransfer(reason);
    // finalize() flips `finalized` first thing, so the onClose() that follows
    // Twilio tearing down the socket is a no-op rather than a second write.
    await this.finalize();
  }

  private flushEvents() {
    if (this.events.size() === 0 || this.eventFlushInFlight) return;
    const events = this.events.drain();
    this.eventFlushInFlight = this.api
      .logEvents({ event: "events", restaurantId: this.token.restaurantId, callSid: this.token.callSid, events })
      .catch((e) => {
        console.error("[nabil-voice] event flush failed", e);
        captureError(e, { where: "events", callSid: this.token.callSid, restaurantId: this.token.restaurantId });
      })
      .finally(() => {
        this.eventFlushInFlight = null;
      });
  }

  onClose() {
    this.controller?.abort();
    clearTimeout(this.resumeTimer);
    clearTimeout(this.wrapUpTimer);
    clearTimeout(this.hangUpTimer);
    clearTimeout(this.silentTurnTimer);
    clearTimeout(this.fillerTimer);
    clearTimeout(this.thinkingFillerTimer);
    clearTimeout(this.earlyFragmentTimer);
    void this.finalize();
  }

  private async finalize() {
    if (this.finalized) return;
    this.finalized = true;
    for (let i = 0; this.turnRunning && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    const outcome = this.outcome ?? (this.userTurns >= 2 ? "faq_answered" : "abandoned");
    const latency = this.latencySummary();
    const usage = { tokensIn: this.usageIn, tokensOut: this.usageOut, cacheRead: this.usageCacheRead, cacheWrite: this.usageCacheWrite };
    this.events.emit({ type: "call_end", turn: this.turnIndex, outcome, latency, usage, costCents: this.costCents() });
    if (this.eventFlushInFlight) await this.eventFlushInFlight.catch(() => undefined);
    const events = this.events.drain();
    try {
      const r = await this.api.logCall({
        event: "end",
        restaurantId: this.token.restaurantId,
        callSid: this.token.callSid,
        fromNumber: this.token.from,
        toNumber: this.token.to,
        language: this.language,
        outcome,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        reservationId: null,
        reservationCode: this.reservationCode,
        customerId: this.customerId,
        transferReason: this.ctx.pendingTransfer,
        transferredAtIso: this.transferredAt ? new Date(this.transferredAt).toISOString() : null,
        transcript: this.transcript.map(({ role, text, ts }) => ({ role, text, ts })),
        model: CONFIG.model,
        tokensIn: this.usageIn,
        tokensOut: this.usageOut,
        costCents: this.costCents(),
        durationSeconds: Math.round((this.now() - this.startedAt) / 1000),
        billableSeconds: this.transferredAt
          ? Math.max(0, Math.round((this.transferredAt - this.startedAt) / 1000))
          : Math.round((this.now() - this.startedAt) / 1000),
        quotedTotal: this.quotedTotal,
        chargedTotal: this.chargedTotal,
        latency,
        versions: this.versions,
        menuSnapshotHash: this.menuHash,
        events,
      });
      if (!r.ok) {
        console.error("[nabil-voice] logCall rejected", r.status);
        captureError(new Error(`logCall rejected ${r.status}`), { where: "logCall", callSid: this.token.callSid, restaurantId: this.token.restaurantId, orderNumber: this.orderNumber, extra: { status: r.status } });
      }
    } catch (e) {
      console.error("[nabil-voice] logCall failed", e);
      captureError(e, { where: "logCall", callSid: this.token.callSid, restaurantId: this.token.restaurantId, orderNumber: this.orderNumber });
    }

    const engaged = this.userTurns >= 2;
    const completed = this.outcome === "order_placed" || this.outcome === "reservation_booked" || this.outcome === "transferred";
    if (this.ctx.cfg.smsConfirmations && engaged && !completed && this.token.from) {
      try {
        await this.api.sendSms({ restaurantId: this.token.restaurantId, slug: this.token.slug, to: this.token.from, linkType: "order_online" });
      } catch {
        /* best-effort */
      }
    }
  }
}
