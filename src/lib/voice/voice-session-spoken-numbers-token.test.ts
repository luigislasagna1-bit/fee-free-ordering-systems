/**
 * Numbers reach the voice as WORDS in TOKEN mode too (NABIL_TTS_CHUNK unset /
 * "token"): deltas stream through, but a number is held back until it is
 * whole ("647-" | "669-" | "0808") so spoken-numbers.ts never sees half of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.NABIL_TTS_CHUNK = "token";
});
const { apiMock } = vi.hoisted(() => ({
  apiMock: { menu: vi.fn(), context: vi.fn(), returningCaller: vi.fn(), logCallStart: vi.fn(), logCall: vi.fn(), sendSms: vi.fn(), logEvents: vi.fn() },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+16476690808", lang: "en-US" };
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return { sent, send: (raw: string) => sent.push(JSON.parse(raw)), tokens: () => sent.filter((m) => m.type === "text").map((m) => String(m.token)) };
}
function scripted(deltas: string[]) {
  return {
    messages: {
      stream: () => {
        const listeners: Array<(d: string) => void> = [];
        return {
          on: (evt: string, cb: (d: string) => void) => {
            if (evt === "text") listeners.push(cb);
          },
          finalMessage: async () => {
            for (const d of deltas) {
              await Promise.resolve();
              for (const l of listeners) l(d);
            }
            return { stop_reason: "end_turn", content: [{ type: "text", text: deltas.join("") }], usage: { input_tokens: 10, output_tokens: 5 } };
          },
        };
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true });
  apiMock.logCall.mockResolvedValue({ ok: true });
});

describe("spoken numbers — token mode", () => {
  it("never splits a number across tokens and speaks it as words", async () => {
    const ws = fakeWs();
    const deltas = ["Perfect", ". Can I get a name, and is ", "647", "-", "669", "-0808", " the", " best", " number for you?"];
    const s = new CallSession(ws as never, TOKEN, scripted(deltas) as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "It's for Sam.", lang: "en-US" }));
    await settle(30);
    const toks = ws.tokens();
    const spoken = toks.join("");
    expect(spoken).toBe("Perfect. Can I get a name, and is six four seven, six six nine, zero eight zero eight the best number for you?");
    // the plain words still streamed early (not held to the end)
    expect(toks[0]).toBe("Perfect");
    // no token ever carried a bare digit fragment
    expect(toks.some((t) => /\d/.test(t))).toBe(false);
  });

  it("text without digits streams exactly as before", async () => {
    const ws = fakeWs();
    const deltas = ["Sure", ", pickup", " it is."];
    const s = new CallSession(ws as never, TOKEN, scripted(deltas) as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup.", lang: "en-US" }));
    await settle(30);
    expect(ws.tokens().filter((t) => t !== "")).toEqual(["Sure", ", pickup", " it is."]);
  });
});
