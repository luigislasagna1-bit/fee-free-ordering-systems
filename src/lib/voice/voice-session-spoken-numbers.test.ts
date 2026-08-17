/**
 * Numbers reach the voice as WORDS (spoken-numbers.ts wired in session.ts) —
 * sentence-chunk mode (the live setting on Luigi's line). The scripted model
 * writes the callback number as digits exactly as it did on call cmswj3rv1
 * (2026-08-16); the caller must hear "six four seven, six six nine, zero
 * eight zero eight". A non-English call passes digits through untouched.
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

const DELTAS = ["Perfect. ", "Can I get a name for the order, and is 647-", "669-0808 the best number for you? ", "Delivery to 338 Black Drive is $7.99."];

describe("spoken numbers — sentence-chunk mode", () => {
  it("speaks digits as words, whole sentences, and logs a numbers_verbalized event", async () => {
    const ws = fakeWs();
    const rec = createRecordingSink();
    const s = new CallSession(ws as never, TOKEN, scripted(DELTAS) as never, { events: rec.sink });
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "It's for Sam.", lang: "en-US" }));
    await settle(30);
    const spoken = ws.tokens().join("");
    expect(spoken).toContain("is six four seven, six six nine, zero eight zero eight the best number for you?");
    expect(spoken).toContain("Delivery to three thirty-eight Black Drive is seven dollars and ninety-nine cents.");
    expect(spoken).not.toMatch(/\d/);
    // still whole sentences
    expect(ws.tokens().filter((t) => t.trim()).length).toBe(3);
    // the transcript keeps what the MODEL wrote (evidence), the voice got words
    expect(rec.all.some((e: any) => e.type === "numbers_verbalized" && e.count >= 1)).toBe(true);
  });

  it("leaves a non-English call untouched (its TTS reads digits natively)", async () => {
    const ws = fakeWs();
    const s = new CallSession(ws as never, { ...TOKEN, lang: "it-IT" }, scripted(["Il numero è 647-669-0808, giusto?"]) as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Sì.", lang: "it-IT" }));
    await settle(30);
    expect(ws.tokens().join("")).toContain("647-669-0808");
  });

  it("uses the ASR language when the token has none (older tokens)", async () => {
    const ws = fakeWs();
    const { lang: _drop, ...noLang } = TOKEN;
    const s = new CallSession(ws as never, noLang, scripted(["Is 647-669-0808 right?"]) as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Yes.", lang: "en-US" }));
    await settle(30);
    expect(ws.tokens().join("")).toContain("six four seven, six six nine, zero eight zero eight");
  });
});
