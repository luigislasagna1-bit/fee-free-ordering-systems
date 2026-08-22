/**
 * A3 — durable telemetry + honest outcomes in the REAL voice session
 * (services/nabil-voice/src/session.ts).
 *
 * 2026-08-21: every `faq_answered` that day was an abandoned order-in-progress;
 * a $69 placed order was logged `error` because the single 8 s end POST
 * failed; a socket closing mid-turn was logged as a model error. These pin:
 *   • the outcome fall-through: an order-in-progress is never "faq_answered";
 *   • a failed end record is SPOOLED (not lost) with the full payload;
 *   • events survive a failed flush (peek → post → ack);
 *   • our own abort on hangup is not a model error and speaks nothing.
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

type Reply = { deltas?: string[]; toolUse?: { name: string; input: Record<string, unknown> } };

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
  };
}

function fakeAnthropic(replies: Reply[]) {
  let call = 0;
  return {
    messages: {
      stream: () => {
        const reply = replies[call++] ?? { deltas: ["Okay."] };
        const listeners: Array<(d: string) => void> = [];
        const run = async () => {
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

async function started(anthropic: unknown, deps: Record<string, unknown> = {}) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never, deps as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}

async function turn(s: CallSession, text: string) {
  s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: text, lang: "en-US" }));
  for (let i = 0; i < 40; i++) await settle(5);
}

async function hangUp(s: CallSession, code = 1000, reason = "caller hung up") {
  s.onClose(code, reason);
  for (let i = 0; i < 40 && apiMock.logCall.mock.calls.length === 0; i++) await settle(10);
}

const endPayload = () => apiMock.logCall.mock.calls[0][0] as { outcome: string; events: Array<{ type: string; [k: string]: unknown }> };

describe("outcome classification at hangup", () => {
  it("an order in progress (fulfilment chosen, nothing placed) is 'abandoned' — never 'faq_answered'", async () => {
    const { s } = await started(
      fakeAnthropic([
        { deltas: ["Pickup it is. What can I get you?"], toolUse: { name: "set_fulfilment", input: { type: "pickup" } } },
        { deltas: ["What can I get you?"] },
        { deltas: ["Sure."] },
      ]),
    );
    await turn(s, "Pickup please.");
    await turn(s, "Hmm, hold on.");
    await hangUp(s);
    expect(endPayload().outcome).toBe("abandoned");
  });

  it("a question-only call with two caller turns stays 'faq_answered'", async () => {
    const { s } = await started(fakeAnthropic([{ deltas: ["We close at ten tonight."] }, { deltas: ["You're welcome!"] }]));
    await turn(s, "What time do you close?");
    await turn(s, "Thanks.");
    await hangUp(s);
    expect(endPayload().outcome).toBe("faq_answered");
  });

  it("call_end carries how the socket closed and the cart size", async () => {
    const { s } = await started(fakeAnthropic([{ deltas: ["Hello!"] }]));
    await turn(s, "Hi.");
    await hangUp(s, 1006, "abnormal closure");
    const end = endPayload().events.find((e) => e.type === "call_end");
    expect(end).toMatchObject({ closeCode: 1006, closeReason: "abnormal closure", cartLines: 0 });
  });
});

describe("durable writes", () => {
  it("a rejected end record is spooled with the full payload instead of being lost", async () => {
    apiMock.logCall.mockResolvedValue({ ok: false, status: 503, json: {} });
    const spool = vi.fn();
    const { s } = await started(fakeAnthropic([{ deltas: ["Hello!"] }]), { spool });
    await turn(s, "Hi.");
    await hangUp(s);
    expect(spool).toHaveBeenCalledTimes(1);
    const [kind, callSid, path, body] = spool.mock.calls[0];
    expect(kind).toBe("end");
    expect(callSid).toBe("CA1");
    expect(path).toBe("/api/internal/voice/call-log");
    expect(body).toMatchObject({ event: "end", callSid: "CA1", outcome: "abandoned" });
    expect((body as { events: unknown[] }).events.length).toBeGreaterThan(0);
  });

  it("a landed end record is never spooled", async () => {
    const spool = vi.fn();
    const { s } = await started(fakeAnthropic([{ deltas: ["Hello!"] }]), { spool });
    await turn(s, "Hi.");
    await hangUp(s);
    expect(spool).not.toHaveBeenCalled();
  });

  it("events survive a failed mid-call flush and go out with the next one (peek → post → ack)", async () => {
    const { s } = await started(fakeAnthropic([{ deltas: ["Hello!"] }, { deltas: ["Yes."] }]));
    await turn(s, "Hi.");
    apiMock.logEvents.mockResolvedValueOnce({ ok: false, status: 502, json: {} });
    await (s as unknown as { flushEvents: () => Promise<void> | null }).flushEvents();
    const firstBatch = (apiMock.logEvents.mock.calls[0][0] as { events: Array<{ seq: number }> }).events;
    expect(firstBatch.length).toBeGreaterThan(0);
    // Nothing acked → the same events are in the next flush, plus the new ones.
    await turn(s, "Still there?");
    await (s as unknown as { flushEvents: () => Promise<void> | null }).flushEvents();
    const secondBatch = (apiMock.logEvents.mock.calls[1][0] as { events: Array<{ seq: number }> }).events;
    expect(secondBatch[0].seq).toBe(firstBatch[0].seq);
    expect(secondBatch.length).toBeGreaterThan(firstBatch.length);
    // Acked now → the end record carries only what came after.
    await hangUp(s);
    const tail = endPayload().events;
    expect(tail.every((e) => (e as { seq: number }).seq > secondBatch[secondBatch.length - 1].seq)).toBe(true);
  });
});

describe("hangup mid-turn", () => {
  it("our own abort on close is not a model error: no error event, nothing spoken into the dead line", async () => {
    let session: CallSession | null = null;
    const anthropic = {
      messages: {
        stream: () => ({
          on: () => undefined,
          finalMessage: () =>
            new Promise((_, reject) =>
              setTimeout(() => {
                session?.onClose(1000, "caller hung up");
                reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
              }, 5),
            ),
        }),
      },
    };
    const { s, ws } = await started(anthropic);
    session = s;
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hi.", lang: "en-US" }));
    for (let i = 0; i < 40 && apiMock.logCall.mock.calls.length === 0; i++) await settle(10);
    const events = endPayload().events;
    expect(events.filter((e) => e.type === "error" && e.where === "model")).toHaveLength(0);
    expect(ws.said()).not.toMatch(/trouble|sorry|again/i);
  });
});
