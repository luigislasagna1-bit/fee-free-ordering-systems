/**
 * A2 (dead air) + A4 (no-input watchdog) in the REAL voice session
 * (services/nabil-voice/src/session.ts).
 *
 * 2026-08-21: 29 of 52 calls had ≥8 s of dead air (the thinking filler was
 * cancelled the moment hop 1 turned out to be a tool call; nothing covered a
 * 6–17 s first-token stall), and a silent line after a question was never
 * re-prompted (33 s, 126 s). These pin:
 *   • the filler deadline survives a tool hop — a fast tool turn with a slow
 *     second hop still gets a filler;
 *   • a second-stage cue plays when no text has arrived by the deadline;
 *   • a hop with no first token by the watchdog is aborted and retried once
 *     (`model_retry`), and the caller still gets the reply;
 *   • a silent caller after a question gets one re-prompt, then a goodbye and
 *     an ordered `end` with reason `no_input` (never a store dial);
 *   • a caller who speaks cancels the watchdog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
});

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    menu: vi.fn(),
    context: vi.fn(),
    returningCaller: vi.fn(),
    logCallStart: vi.fn(),
    logCall: vi.fn(),
    logEvents: vi.fn(),
    logHandoff: vi.fn(),
    sendSms: vi.fn(),
  },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";

type Reply = { deltas?: string[]; toolUse?: { name: string; input: Record<string, unknown> }; delayMs?: number; hangMs?: number };

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
    close: () => undefined,
    said: () =>
      sent
        .filter((m) => m.type === "text")
        .map((m) => String(m.token))
        .join(""),
    endFrames: () => sent.filter((m) => m.type === "end"),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Streaming fake with per-reply delay before the first token (`delayMs`) or a
 *  hang that only ends when aborted (`hangMs` → rejects with AbortError). */
function fakeAnthropic(replies: Reply[]) {
  let call = 0;
  return {
    calls: () => call,
    messages: {
      stream: (_params: unknown, opts?: { signal?: AbortSignal }) => {
        const reply = replies[call++] ?? { deltas: ["Okay."] };
        const listeners: Array<(d: string) => void> = [];
        const run = async () => {
          if (reply.hangMs !== undefined) {
            await new Promise<void>((_, reject) => {
              const t = setTimeout(() => reject(Object.assign(new Error("hung"), { name: "HangError" })), reply.hangMs);
              opts?.signal?.addEventListener("abort", () => {
                clearTimeout(t);
                reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
              });
            });
          }
          if (reply.delayMs) await sleep(reply.delayMs);
          for (const d of reply.deltas ?? []) {
            await Promise.resolve();
            for (const l of listeners) l(d);
          }
          const content: unknown[] = [];
          if (reply.deltas?.length) content.push({ type: "text", text: reply.deltas.join("") });
          if (reply.toolUse) content.push({ type: "tool_use", id: `tu_${call}`, name: reply.toolUse.name, input: reply.toolUse.input });
          return { stop_reason: reply.toolUse ? "tool_use" : "end_turn", content, usage: { input_tokens: 10, output_tokens: 5 } };
        };
        let started: Promise<unknown> | null = null;
        return {
          on: (evt: string, cb: (d: string) => void) => {
            if (evt === "text") listeners.push(cb);
          },
          finalMessage: () => (started ??= run()),
        };
      },
    },
  };
}

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+14168338405" };
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logCall.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logEvents.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logHandoff.mockResolvedValue({ ok: true, status: 200, json: {} });
});

/** Fast test clocks: everything in tens of milliseconds. */
const FAST = { thinkingFillerMs: 40, secondStageMs: 120, hopTtftWatchdogMs: 150, noInputRepromptMs: 60, noInputCloseMs: 180, speechMsPerChar: 0, callerActiveHoldMs: 0, earlyFragmentMs: 0 };

async function started(anthropic: unknown, deps: Record<string, unknown> = {}) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never, { ...FAST, ...deps } as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}

async function turn(s: CallSession, text: string, waitMs = 400) {
  s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: text, lang: "en-US" }));
  await sleep(waitMs);
}

async function hangUp(s: CallSession) {
  s.onClose(1000, "caller hung up");
  for (let i = 0; i < 40 && apiMock.logCall.mock.calls.length === 0; i++) await settle(10);
}

const events = () => (apiMock.logCall.mock.calls[0][0] as { events: Array<{ type: string; [k: string]: unknown }> }).events;

describe("A2 — one dead-air deadline across hops", () => {
  it("a fast tool hop followed by a slow second hop still gets the thinking filler", async () => {
    const { s, ws } = await started(
      fakeAnthropic([
        { toolUse: { name: "set_fulfilment", input: { type: "pickup" } } }, // no text, instant tool
        { deltas: ["Pickup it is — what can I get you?"], delayMs: 90 }, // hop 2 first token after the 40 ms deadline
      ]),
      { noInputRepromptMs: 0 },
    );
    await turn(s, "Pickup please.");
    await hangUp(s);
    const fillers = events().filter((e) => e.type === "filler");
    expect(fillers.length).toBeGreaterThanOrEqual(1);
    expect(fillers[0].kind).toBe("thinking");
    expect(ws.said()).toMatch(/Pickup it is/);
  });

  it("a first-token stall past the second-stage deadline gets the 'still with you' cue, and ttfa counts the filler", async () => {
    const { s, ws } = await started(fakeAnthropic([{ deltas: ["Here you go."], delayMs: 200 }]), { noInputRepromptMs: 0, hopTtftWatchdogMs: 0 });
    await turn(s, "What's your most popular pizza?", 500);
    await hangUp(s);
    const kinds = events().filter((e) => e.type === "filler").map((e) => e.kind);
    expect(kinds).toContain("thinking");
    expect(kinds).toContain("second_stage");
    expect(ws.said()).toMatch(/Still with you|Almost there/);
    expect(ws.said()).toMatch(/Here you go/);
    const t = events().find((e) => e.type === "turn") as { ttfaMs: number | null; hops: Array<{ ttftMs: number | null }> };
    expect(t.ttfaMs).not.toBeNull();
    expect(t.ttfaMs!).toBeLessThan(t.hops[0].ttftMs!);
  });

  it("a hop with no first token by the watchdog is aborted and retried once — the caller still gets the reply", async () => {
    const anthropic = fakeAnthropic([{ hangMs: 5_000 }, { deltas: ["Sorry about that — what can I get you?"] }]);
    const { s, ws } = await started(anthropic, { noInputRepromptMs: 0, secondStageMs: 0 });
    await turn(s, "Hi there.", 700);
    await hangUp(s);
    expect(anthropic.calls()).toBe(2);
    const retry = events().find((e) => e.type === "model_retry") as { hop: number; afterMs: number } | undefined;
    expect(retry).toBeDefined();
    expect(retry!.hop).toBe(1);
    expect(events().filter((e) => e.type === "error" && e.where === "model")).toHaveLength(0);
    expect(ws.said()).toMatch(/what can I get you/);
  });
});

describe("A4 — no-input watchdog", () => {
  it("silence after a question: one re-prompt, then goodbye + an ordered end with reason no_input", async () => {
    const anthropic = fakeAnthropic([
      { deltas: ["Sure — can I get a name for the order?"] }, // the question
      { deltas: ["Still there? What name should I put on the order?"] }, // the re-prompt turn
      { deltas: ["(should never be asked)"] },
    ]);
    const { s, ws } = await started(anthropic);
    await turn(s, "Pickup, a large pepperoni.", 150);
    // Silence: re-prompt at +60 ms, close at +120 ms after the re-prompt.
    await sleep(600);
    const ends = ws.endFrames();
    expect(ends).toHaveLength(1);
    expect(JSON.parse(String(ends[0].handoffData)).reason).toBe("no_input");
    expect(apiMock.logHandoff).toHaveBeenCalledWith(expect.objectContaining({ event: "handoff", reason: "no_input" }));
    expect(ws.said()).toMatch(/Still there\?/);
    expect(ws.said()).toMatch(/let you go/);
    await hangUp(s);
    const ni = events().filter((e) => e.type === "no_input").map((e) => e.stage);
    expect(ni).toEqual(["reprompt", "close"]);
    const end = apiMock.logCall.mock.calls[0][0] as { outcome: string; transferReason: string | null };
    expect(end.outcome).not.toBe("transferred");
    expect(end.transferReason).toBe("no_input");
  });

  it("a caller who answers cancels the watchdog — no re-prompt, no close", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Can I get a name for the order?"] }, { deltas: ["Thanks, Marco."] }]);
    const { s, ws } = await started(anthropic, { noInputRepromptMs: 300 });
    await turn(s, "Pickup please.", 150); // the question ends ~10 ms in; the caller answers at 150 ms, before the 300 ms nudge
    await turn(s, "It's Marco.", 150);
    await sleep(600);
    expect(ws.endFrames()).toHaveLength(0);
    await hangUp(s);
    expect(events().filter((e) => e.type === "no_input")).toHaveLength(0);
  });

  it("a statement (not a question) never arms the watchdog", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Your order is placed. See you soon."] }]);
    const { s, ws } = await started(anthropic);
    await turn(s, "Thanks, bye.", 150);
    await sleep(600);
    expect(ws.endFrames()).toHaveLength(0);
    await hangUp(s);
    expect(events().filter((e) => e.type === "no_input")).toHaveLength(0);
  });
});
