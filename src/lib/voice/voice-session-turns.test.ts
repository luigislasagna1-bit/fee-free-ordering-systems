/**
 * Turn handling in the REAL voice session (`services/nabil-voice/src/session.ts`).
 *
 * These cover the two ways a live call went silent on 2026-08-13 (ORD-264127463,
 * Roya Safi), both of which read to the caller as a broken phone line:
 *
 *   • Twilio ConversationRelay sends `interrupt` and `prompt` as SEPARATE
 *     events, and the interrupt raised by a caller talking over the previous
 *     sentence routinely lands a beat AFTER the prompt it produced. That stale
 *     interrupt aborted the reply to the very words that caused it, and the 4s
 *     barge-in resume timer then self-cancelled (it bails when the last message
 *     is a USER turn, which is exactly what a zero-token abort leaves). The
 *     caller said "Pickup." and got nothing at all until she asked "Hello?".
 *
 *   • A barge-in during a post-tool confirmation truncated the one sentence
 *     that had to be heard: "your actual total comes to twenty five ninety se—".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// CONFIG reads these at import time and throws without them. Hoisted, because
// session.ts imports config.ts as a VALUE (tools.ts only imports its types, so
// the sibling test can get away with plain assignments).
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
  },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";

type Spoken = { token: string; last: boolean };

/** A ConversationRelay socket that just records what was said. */
function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
    spoken: (): Spoken[] =>
      sent.filter((m) => m.type === "text").map((m) => ({ token: String(m.token), last: !!m.last })),
    said: () =>
      sent
        .filter((m) => m.type === "text")
        .map((m) => String(m.token))
        .join(""),
  };
}

/**
 * A stand-in for the Anthropic streaming client. Each queued reply is emitted
 * one delta at a time with an await between them, so a test can interleave a
 * WebSocket event partway through a turn exactly as Twilio would.
 */
function fakeAnthropic(replies: Array<{ deltas: string[]; ttft?: number }>) {
  let call = 0;
  return {
    calls: () => call,
    messages: {
      stream: (_params: unknown, opts?: { signal?: AbortSignal }) => {
        const reply = replies[call++] ?? { deltas: ["Okay."] };
        const listeners: Array<(d: string) => void> = [];
        const aborted = () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          return err;
        };
        // The real SDK rejects finalMessage() as soon as the signal fires — a
        // fake that merely finishes late would let the session sit through a
        // barge-in it should have noticed.
        const waitOrAbort = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, ms);
            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(aborted());
            });
          });
        const run = async () => {
          // Time-to-first-token: the window in which a barge-in kills a turn
          // before it has said anything at all.
          if (reply.ttft) await waitOrAbort(reply.ttft);
          for (const d of reply.deltas) {
            await Promise.resolve();
            if (opts?.signal?.aborted) throw aborted();
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

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA1", to: "+15551112222", from: "+14168338405" };

/** Let queued microtasks and short timers drain. */
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true });
  apiMock.logCall.mockResolvedValue({ ok: true });
});

async function startedSession(anthropic: ReturnType<typeof fakeAnthropic>) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle(); // init() fetches menu/context/caller
  await settle();
  return { ws, s };
}

describe("a turn never ends in silence", () => {
  it("answers the prompt even when the previous sentence's interrupt lands just after it", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Sounds like pickup — ", "what can I get you?"] }]);
    const { ws, s } = await startedSession(anthropic);

    // The caller talks over the sentence still playing. Twilio delivers the
    // transcript first and the interrupt a beat later — the exact race that
    // produced the dead air.
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    s.onMessage(JSON.stringify({ type: "interrupt" }));
    await settle(20);

    expect(ws.said()).toContain("what can I get you?");
  });

  it("re-answers a turn that was aborted before it said a word", async () => {
    // The first attempt is aborted before its first token; the retry is the
    // only thing the caller ever hears.
    const anthropic = fakeAnthropic([
      { deltas: ["Sure — "], ttft: 5_000 },
      { deltas: ["Pickup it is. What can I get you?"] },
    ]);
    const { ws, s } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    // Late enough to be treated as a real barge-in, not a stale event.
    await settle(900);
    s.onMessage(JSON.stringify({ type: "interrupt" }));
    await settle(1600); // SILENT_TURN_RETRY_MS + slack

    expect(ws.said()).toContain("What can I get you?");
  });

  it("does not re-answer when the caller has already moved on", async () => {
    const anthropic = fakeAnthropic([
      { deltas: ["Sure — "], ttft: 5_000 },
      { deltas: ["Two large pizzas, got it."] },
    ]);
    const { ws, s } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(900);
    s.onMessage(JSON.stringify({ type: "interrupt" }));
    // Real speech arrives before the retry would have fired — talking over the
    // caller to finish an abandoned thought is worse than the silence.
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Two large pizzas." }));
    await settle(1600);

    expect(ws.said()).toContain("Two large pizzas, got it.");
    expect(anthropic.calls()).toBeLessThanOrEqual(2);
  });
});

describe("a silent tool hop never sounds like a dropped call", () => {
  it("says something rather than nothing while the model is slow to start", async () => {
    // A reply that takes longer than the filler deadline to produce its first
    // token: the line would otherwise be dead air.
    const slow = {
      messages: {
        stream: () => ({
          on: () => {},
          finalMessage: async () => {
            await settle(1500);
            return { stop_reason: "end_turn", content: [], usage: {} };
          },
        }),
      },
    };
    const { ws, s } = await startedSession(slow as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(1400);

    expect(ws.said()).toContain("One moment");
  });
});
