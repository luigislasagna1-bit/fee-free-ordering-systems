/**
 * A11 / C34 — an IVR on the line ends as `spam` through the ordered end path
 * (services/nabil-voice/src/session.ts), without a model turn.
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

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return { sent, send: (raw: string) => sent.push(JSON.parse(raw)), close: () => undefined, endFrames: () => sent.filter((m) => m.type === "end") };
}
function fakeAnthropic() {
  let calls = 0;
  return {
    calls: () => calls,
    messages: {
      stream: () => {
        calls++;
        return { on: () => undefined, finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Okay." }], usage: { input_tokens: 1, output_tokens: 1 } }) };
      },
    },
  };
}
const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+14168338405" };
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: false }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logCall.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logEvents.mockResolvedValue({ ok: true, status: 200, json: {} });
  apiMock.logHandoff.mockResolvedValue({ ok: true, status: 200, json: {} });
});

describe("A11 — an IVR on the line", () => {
  it("is classified spam and ended through the ordered path, with no model turn", async () => {
    const anthropic = fakeAnthropic();
    const ws = fakeWs();
    const s = new CallSession(ws as never, TOKEN, anthropic as never, { thinkingFillerMs: 0, noInputRepromptMs: 0, leadingHoldMs: 0 } as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "A dasher has reported your store as being closed. Press one if your store is open, press four if it is closed.", lang: "en-US" }));
    for (let i = 0; i < 30 && ws.endFrames().length === 0; i++) await settle(10);
    expect(ws.endFrames()).toHaveLength(1);
    expect(JSON.parse(String(ws.endFrames()[0].handoffData)).reason).toBe("spam");
    expect(anthropic.calls()).toBe(0);
    expect(apiMock.logHandoff).toHaveBeenCalledWith(expect.objectContaining({ reason: "spam" }));
    s.onClose(1000, "bye");
    for (let i = 0; i < 40 && apiMock.logCall.mock.calls.length === 0; i++) await settle(10);
    const end = apiMock.logCall.mock.calls[0][0] as { outcome: string; events: Array<{ type: string }> };
    expect(end.outcome).toBe("spam");
    expect(end.events.some((e) => e.type === "robocall_detected")).toBe(true);
  });

  it("a real caller is never classified — one weak cue in an order is fine", async () => {
    const anthropic = fakeAnthropic();
    const ws = fakeWs();
    const s = new CallSession(ws as never, TOKEN, anthropic as never, { thinkingFillerMs: 0, noInputRepromptMs: 0, leadingHoldMs: 0 } as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hi, please hold on, let me grab my list. One large pepperoni for pickup.", lang: "en-US" }));
    await settle(150);
    expect(ws.endFrames()).toHaveLength(0);
    expect(anthropic.calls()).toBe(1);
  });
});
