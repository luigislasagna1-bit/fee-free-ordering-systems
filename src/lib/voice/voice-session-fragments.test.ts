/**
 * A7 — fragments and repeats in the REAL voice session (C26/C27, 2026-08-21):
 *   • a direct ANSWER to a question Nabil just asked is never held as an
 *     "early fragment" once the reply has started playing (cmt3ie48z: "Marco."
 *     1.2 s after "Can I get a name?" sat for 6 s);
 *   • a LEADING fragment ("It's") waits briefly for its continuation and runs
 *     as one utterance ("It's Marco.");
 *   • the caller repeating themselves — or "hello?" — while the reply is
 *     already being generated is dropped, not answered twice.
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

import { CallSession, isLeadingFragment } from "../../../services/nabil-voice/src/session";

type Reply = { deltas?: string[]; delayMs?: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return { sent, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined };
}

function fakeAnthropic(replies: Reply[]) {
  const prompts: string[] = [];
  let call = 0;
  return {
    prompts,
    calls: () => call,
    messages: {
      stream: (params: { messages: Array<{ role: string; content: unknown }> }) => {
        const reply = replies[call++] ?? { deltas: ["Okay."] };
        const last = params.messages[params.messages.length - 1];
        const blocks = Array.isArray(last?.content) ? (last.content as Array<{ type?: string; text?: string }>) : [];
        prompts.push(blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n"));
        const listeners: Array<(d: string) => void> = [];
        const run = async () => {
          if (reply.delayMs) await sleep(reply.delayMs);
          for (const d of reply.deltas ?? []) {
            await Promise.resolve();
            for (const l of listeners) l(d);
          }
          return { stop_reason: "end_turn", content: [{ type: "text", text: (reply.deltas ?? []).join("") }], usage: { input_tokens: 10, output_tokens: 5 } };
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

const QUIET = { thinkingFillerMs: 0, secondStageMs: 0, hopTtftWatchdogMs: 0, noInputRepromptMs: 0, callerActiveHoldMs: 0 };

async function started(anthropic: unknown, deps: Record<string, unknown> = {}) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never, { ...QUIET, ...deps } as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}
const say = (s: CallSession, text: string) => s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: text, lang: "en-US" }));

async function hangUp(s: CallSession) {
  s.onClose(1000, "bye");
  for (let i = 0; i < 40 && apiMock.logCall.mock.calls.length === 0; i++) await settle(10);
}
const events = () => (apiMock.logCall.mock.calls[0][0] as { events: Array<{ type: string; [k: string]: unknown }> }).events;

describe("isLeadingFragment", () => {
  it("recognises sentence starts the endpointer cut early, not answers", () => {
    for (const t of ["It's", "I'll get", "Can I have a", "Right. And", "I want the", "Give me"]) expect(isLeadingFragment(t)).toBe(true);
    for (const t of ["Marco.", "Pickup.", "Large pepperoni.", "No thanks.", "(pressed 0)", "Two large pizzas and a coke please"]) expect(isLeadingFragment(t)).toBe(false);
  });
});

describe("early fragment vs direct answer", () => {
  it("'Marco.' 700 ms after 'Can I get a name?' runs at once — not held", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Sure — can I get a name for the order?"] }, { deltas: ["Thanks, Marco."] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 1_500, leadingHoldMs: 0 });
    say(s, "Pickup, one large pepperoni.");
    await sleep(150);
    await sleep(700);
    say(s, "Marco.");
    await sleep(150);
    expect(anthropic.calls()).toBe(2);
    expect(anthropic.prompts[1]).toMatch(/Marco\./);
    await hangUp(s);
    expect(events().filter((e) => e.type === "tail_fragment")).toHaveLength(0);
  });

  it("a fragment 100 ms after the reply (before anyone could hear it) is still held as context", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Sure — can I get a name for the order?"] }, { deltas: ["Thanks."] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 1_500, leadingHoldMs: 0 });
    say(s, "Pickup, one large pepperoni.");
    await sleep(120);
    say(s, "special");
    await sleep(150);
    expect(anthropic.calls()).toBe(1);
    await hangUp(s);
    expect(events().filter((e) => e.type === "tail_fragment" && e.early === true)).toHaveLength(1);
  });
});

describe("leading fragment hold", () => {
  it("'It's' + 'Marco.' within the hold become ONE utterance", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Can I get a name?"] }, { deltas: ["Thanks, Marco."] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 0, leadingHoldMs: 300 });
    say(s, "Pickup please.");
    await sleep(150);
    say(s, "It's");
    await sleep(100);
    say(s, "Marco.");
    await sleep(200);
    expect(anthropic.calls()).toBe(2);
    expect(anthropic.prompts[1]).toMatch(/It's Marco\./);
    await hangUp(s);
  });

  it("a leading fragment with no continuation runs on its own after the hold", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Can I get a name?"] }, { deltas: ["Sorry — what was that?"] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 0, leadingHoldMs: 200 });
    say(s, "Pickup please.");
    await sleep(150);
    say(s, "I'll get");
    await sleep(100);
    expect(anthropic.calls()).toBe(1);
    await sleep(300);
    expect(anthropic.calls()).toBe(2);
    expect(anthropic.prompts[1]).toMatch(/I'll get/);
    await hangUp(s);
  });
});

describe("repeats and 'hello?' while the reply is being generated", () => {
  it("the same words again, or 'hello?', are dropped — not queued as a second turn", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["One large pepperoni, got it."], delayMs: 400 }, { deltas: ["(should not run)"] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 0, leadingHoldMs: 0 });
    say(s, "A large pepperoni please.");
    await sleep(100);
    say(s, "A large pepperoni, please!");
    say(s, "Hello?");
    await sleep(700);
    expect(anthropic.calls()).toBe(1);
    await hangUp(s);
    const drops = events().filter((e) => e.type === "asr_dropped").map((e) => e.reason);
    expect(drops).toEqual(["repeat_during_turn", "hello_during_turn"]);
  });

  it("genuinely new words during the turn are still queued and answered after it", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["One large pepperoni, got it."], delayMs: 300 }, { deltas: ["And a Coke — done."] }]);
    const { s } = await started(anthropic, { earlyFragmentMs: 0, leadingHoldMs: 0 });
    say(s, "A large pepperoni please.");
    await sleep(100);
    say(s, "Oh, and a Coke.");
    await sleep(800);
    expect(anthropic.calls()).toBe(2);
    expect(anthropic.prompts[1]).toMatch(/Coke/);
    await hangUp(s);
  });
});
