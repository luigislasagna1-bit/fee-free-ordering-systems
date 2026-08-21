/**
 * POST-FILLER ACK DE-DUP (Luigi call review, 2026-08-20).
 *
 * The 2.5s thinking filler says "Sure thing."; the model's reply then opens
 * "Got it, delivering to…" — on the 3:41 PM Aug 20 call the caller heard a
 * double ack on EVERY turn. The session now holds the first reply deltas after
 * a filler and drops a duplicated leading bare ack.
 *
 * Unit matrix over `ackStripDecision` (pure), then the REAL session driven
 * delta-by-delta through the fake harness.
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
    sendSms: vi.fn(),
  },
}));
vi.mock("../../../services/nabil-voice/src/api", () => ({
  api: apiMock,
  fetchActiveStores: vi.fn().mockResolvedValue({ stores: [] }),
}));

import { ACK_HOLD_MAX, CallSession, ackStripDecision, leadAcksFor } from "../../../services/nabil-voice/src/session";
import { voiceFillers } from "../../../services/nabil-voice/src/voice-i18n";

/* ─────────────────────────── decision matrix ───────────────────────────── */

const EN = leadAcksFor("en-US");

describe("ackStripDecision", () => {
  it("strips a duplicated leading ack and capitalizes the remainder", () => {
    expect(ackStripDecision("Got it, delivering to Milton.", EN)).toEqual({ kind: "strip", emit: "Delivering to Milton." });
    expect(ackStripDecision("Okay! Two large pizzas.", EN)).toEqual({ kind: "strip", emit: "Two large pizzas." });
    expect(ackStripDecision("Sure thing — one sec, adding that.", EN)).toEqual({ kind: "strip", emit: "One sec, adding that." });
  });

  it("holds while the opener could still become a strippable ack", () => {
    expect(ackStripDecision("Got", EN)).toEqual({ kind: "hold" });
    expect(ackStripDecision("Got it", EN)).toEqual({ kind: "hold" });
    expect(ackStripDecision("Got it,", EN)).toEqual({ kind: "hold" });
    expect(ackStripDecision("Okay.", EN)).toEqual({ kind: "hold" }); // could be the whole reply
  });

  it("passes content that merely starts with ack-shaped words", () => {
    expect(ackStripDecision("Okay?", EN)).toEqual({ kind: "pass" }); // a question is content
    expect(ackStripDecision("Right now the special is", EN)).toEqual({ kind: "pass" }); // no punctuation after the ack word
    expect(ackStripDecision("Yesterday's special", EN)).toEqual({ kind: "pass" }); // "yes" is a prefix of a longer word
    expect(ackStripDecision("Delivering to Milton.", EN)).toEqual({ kind: "pass" });
  });

  it("gives up holding at ACK_HOLD_MAX", () => {
    const long = "x".repeat(ACK_HOLD_MAX + 1);
    expect(ackStripDecision(long, EN).kind).toBe("pass");
  });

  it("is locale-driven: another locale's own filler phrases strip, unknown openers pass", () => {
    const fr = leadAcksFor("fr-FR");
    const frPhrase = voiceFillers("fr", "thinkingFillers")[0].replace(/[.!\s]+$/, "");
    const d = ackStripDecision(`${frPhrase}, je vous écoute.`, fr);
    expect(d).toEqual({ kind: "strip", emit: "Je vous écoute." });
    // A greeting that is not in the ack set is untouched.
    expect(ackStripDecision("Bonjour, je vous écoute.", fr).kind).toBe("pass");
  });
});

/* ───────────────────────── session-level behavior ──────────────────────── */

type Spoken = { token: string; last: boolean };

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
    spoken: (): Spoken[] => sent.filter((m) => m.type === "text").map((m) => ({ token: String(m.token), last: !!m.last })),
    said: () =>
      sent
        .filter((m) => m.type === "text")
        .map((m) => String(m.token))
        .join(""),
  };
}

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
        const waitOrAbort = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, ms);
            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(aborted());
            });
          });
        const run = async () => {
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
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true });
  apiMock.logCall.mockResolvedValue({ ok: true });
  apiMock.logEvents.mockResolvedValue({ ok: true });
});

async function startedSession(anthropic: ReturnType<typeof fakeAnthropic>, thinkingFillerMs: number) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never, { thinkingFillerMs } as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}

describe("the session strips a double ack after a filler", () => {
  const THINKING = voiceFillers("en", "thinkingFillers");

  it('filler fires, then fragmented "Got it, delivering…" arrives → the caller hears ONE ack and the substance', async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Got", " it", ",", " delivering", " to Milton District Hospital."], ttft: 120 }]);
    const { ws, s } = await startedSession(anthropic, 10);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "It's a delivery." }));
    await settle(400);

    const said = ws.said();
    expect(THINKING.some((p) => said.includes(p))).toBe(true); // the filler played
    expect(said).toContain("Delivering to Milton District Hospital.");
    expect(said).not.toContain("Got it"); // the duplicate ack is gone
  });

  it("a reply that IS only a bare ack is kept whole", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Okay", "."], ttft: 120 }]);
    const { ws, s } = await startedSession(anthropic, 10);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "One second." }));
    await settle(400);

    expect(ws.said()).toContain("Okay.");
  });

  it("no filler → the opener is untouched, zero holding on the common path", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Got it, one large pizza — what toppings?"] }]);
    const { ws, s } = await startedSession(anthropic, 60_000);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "A large pizza." }));
    await settle(200);

    expect(ws.said()).toContain("Got it, one large pizza — what toppings?");
  });
});

/* ───────────── filler talk-over hold (calls cmt237qmr/cmt24gemw) ────────── */

describe("a due filler HOLDS while the caller's mic still shows speech", () => {
  const THINKING = voiceFillers("en", "thinkingFillers");
  const saidFiller = (ws: ReturnType<typeof fakeWs>) => THINKING.some((p) => ws.said().includes(p));

  async function holdSession(anthropic: ReturnType<typeof fakeAnthropic>, callerActiveHoldMs: number) {
    const ws = fakeWs();
    const s = new CallSession(ws as never, TOKEN, anthropic as never, { thinkingFillerMs: 30, callerActiveHoldMs } as never);
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    return { ws, s };
  }

  it("caller still talking at the deadline → no filler; real silence later → it fires (late, once)", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Here you go."], ttft: 700 }]);
    const { ws, s } = await holdSession(anthropic, 150);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "I want" }));
    s.noteCallerAudio(); // interim speech right as the turn starts
    await settle(100); // past the 30ms deadline, inside the 150ms hold
    expect(saidFiller(ws)).toBe(false);

    await settle(300); // hold lapsed, still no reply text → the filler fires
    expect(saidFiller(ws)).toBe(true);
    expect(ws.spoken().filter((t) => THINKING.some((p) => t.token.includes(p)))).toHaveLength(1);
  });

  it("caller talking and the reply arrives during the hold → no filler at all", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["One large pizza — toppings?"], ttft: 80 }]);
    const { ws, s } = await holdSession(anthropic, 60_000);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "A large pizza" }));
    s.noteCallerAudio();
    await settle(300);

    expect(saidFiller(ws)).toBe(false);
    expect(ws.said()).toContain("One large pizza — toppings?");
  });

  it("no speech activity ever noted (ConversationRelay) → today's behavior, filler at the deadline", async () => {
    const anthropic = fakeAnthropic([{ deltas: ["Here you go."], ttft: 500 }]);
    const { ws, s } = await holdSession(anthropic, 150);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "One second" }));
    await settle(120);

    expect(saidFiller(ws)).toBe(true);
  });
});
