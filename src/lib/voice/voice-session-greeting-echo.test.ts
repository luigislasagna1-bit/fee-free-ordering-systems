/**
 * Greeting echo guard (`services/nabil-voice/src/session.ts`).
 *
 * On speakerphone the ASR picks up Nabil's own greeting playing from the
 * speaker and delivers it as caller speech. Without a guard the model answers
 * the echo ("Hi there… pickup or delivery?") after the greeting was already
 * cut by the echo's interrupt — confusing the caller. Call cmsw33f3l,
 * 2026-08-16 13:33 EDT: "This call may be recorded" echoed back 2 s in, the
 * caller hung up and redialled.
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
    sendSms: vi.fn(),
    logEvents: vi.fn(),
  },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";
import { createEventSink } from "../../../services/nabil-voice/src/events";

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+14168338405" };

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
  };
}

function fakeAnthropic(replies: Array<{ deltas: string[] }> = []) {
  let call = 0;
  return {
    calls: () => call,
    messages: {
      stream: () => {
        const reply = replies[call++] ?? { deltas: ["Okay."] };
        const listeners: Array<(d: string) => void> = [];
        const run = async () => {
          await Promise.resolve();
          for (const d of reply.deltas) {
            for (const l of listeners) l(d);
          }
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: reply.deltas.join("") }],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
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

const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's Lasagna", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's Lasagna" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true });
  apiMock.logCall.mockResolvedValue({ ok: true });
  apiMock.logEvents.mockResolvedValue({ ok: true });
});

async function startedSession(anthropic: ReturnType<typeof fakeAnthropic>, greeting = "") {
  const ws = fakeWs();
  const events = createEventSink();
  const s = new CallSession(ws as never, TOKEN, anthropic as never, { events });
  if (greeting) s.setGreeting(greeting);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s, events };
}

describe("greeting echo guard — pattern-based (ConversationRelay)", () => {
  it("drops 'This call may be recorded' as the first prompt", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Hi there!"] }]);
    const { ws, s, events } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "This call may be recorded" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(ws.sent.filter((m) => m.type === "text")).toHaveLength(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("drops 'Thanks for calling Luigi's'", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Hi!"] }]);
    const { s, events } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Thanks for calling Luigi's Lasagna" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("drops 'Thank you for calling'", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Hi!"] }]);
    const { s, events } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Thank you for calling" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("passes a REAL first prompt through", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Sure, what can I get you?"] }]);
    const { s, events } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hi, I'd like to order a pizza." }));
    await settle(20);

    expect(anthropic.calls()).toBe(1);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(false);
  });

  it("does not flag second-turn text that starts with 'thanks for calling'", async () => {
    const anthropic = fakeAnthropic([
      { deltas: ["Sure, what can I get you?"] },
      { deltas: ["You're welcome!"] },
    ]);
    const { s, events } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hey, I need a large pizza." }));
    await settle(20);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Thanks for calling, you're great." }));
    await settle(20);

    expect(anthropic.calls()).toBe(2);
    expect(events.drain().filter((e) => (e as any).type === "greeting_echo_dropped")).toHaveLength(0);
  });
});

describe("greeting echo guard — exact match (Media Streams with known greeting)", () => {
  const GREETING = "This call may be recorded for quality and training. Thanks for calling Luigi's Lasagna. How can I help you?";

  it("drops a prefix of the known greeting", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Hi!"] }]);
    const { s, events } = await startedSession(anthropic, GREETING);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "This call may be recorded for quality" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("drops the middle portion echoed as the first prompt", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Hi!"] }]);
    const { s, events } = await startedSession(anthropic, GREETING);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Thanks for calling Luigi's Lasagna" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("drops a custom greeting echo that wouldn't match patterns", async () => {
    const custom = "Hello and welcome to Bella Pasta, what can I get for you today?";
    const anthropic = fakeAnthropic([{ deltas: ["Hi!"] }]);
    const { s, events } = await startedSession(anthropic, custom);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hello and welcome to Bella Pasta" }));
    await settle(20);

    expect(anthropic.calls()).toBe(0);
    expect(events.drain().some((e) => (e as any).type === "greeting_echo_dropped")).toBe(true);
  });

  it("seeds lastSpokenText so the interrupt stale detector catches greeting interrupts", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Sure, what can I get you?"] }]);
    const { ws, s } = await startedSession(anthropic, GREETING);

    s.onMessage(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: "This call may be recorded for quality and training" }));
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hi, one large pepperoni please." }));
    await settle(20);

    expect(anthropic.calls()).toBe(1);
    const echoed = ws.sent.filter((m) => m.type === "text");
    expect(echoed.map((m) => m.token).join("")).toContain("what can I get you?");
  });
});
