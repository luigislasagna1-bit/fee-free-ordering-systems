/**
 * NABIL_TTS_CHUNK=sentence: text reaches ConversationRelay in whole
 * sentences, and a sentence that is the model thinking aloud is dropped
 * before it is spoken (narration-filter.ts) and logged as narration_dropped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.NABIL_TTS_CHUNK = "sentence";
});
const { apiMock } = vi.hoisted(() => ({
  apiMock: { menu: vi.fn(), context: vi.fn(), returningCaller: vi.fn(), logCallStart: vi.fn(), logCall: vi.fn(), sendSms: vi.fn(), logEvents: vi.fn() },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";
import { createRecordingSink } from "./sim/harness";

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+14168338405" };
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

describe("sentence-chunk TTS + narration filter", () => {
  it("forwards whole sentences and drops the thinking-aloud one", async () => {
    const ws = fakeWs();
    const rec = createRecordingSink();
    const anthropic = scripted(["Sure", ". ", "I'll use the Large 1 Topping menu item directly", ". ", "That's a large pizza with pepperoni", ". Anything else?"]);
    const s = new CallSession(ws as never, TOKEN, anthropic as never, { events: rec.sink });
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Two large pepperoni pizzas." }));
    await settle(30);
    const spoken = ws.tokens().join("");
    expect(spoken).toContain("Sure.");
    expect(spoken).toContain("That's a large pizza with pepperoni.");
    expect(spoken).toContain("Anything else?");
    expect(spoken).not.toContain("menu item");
    // whole sentences, not tokens
    expect(ws.tokens().filter((t) => t.trim())).toEqual(["Sure.", " That's a large pizza with pepperoni.", " Anything else?"]);
    expect(rec.all.some((e: any) => e.type === "narration_dropped" && /menu item/.test(e.text))).toBe(true);
  });
});
