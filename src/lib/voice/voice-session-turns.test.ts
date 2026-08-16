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

describe("fillers only cover TOOL silence, never plain first-token latency", () => {
  // 2026-08-15: the old any-turn filler spoke "One moment." on 12 of 17 turns
  // of a call whose plain TTFT was ~1 s. Now a filler is armed only while a
  // tool hop is running.
  const FILLERS = ["One sec.", "Let me check that.", "Just a moment.", "Bear with me a second."];

  it("stays quiet on a slow plain answer", async () => {
    const slow = {
      messages: {
        stream: () => ({
          on: () => {},
          finalMessage: async () => {
            await settle(1700);
            return { stop_reason: "end_turn", content: [{ type: "text", text: "Pickup it is." }], usage: {} };
          },
        }),
      },
    };
    const { ws, s } = await startedSession(slow as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(1650);
    for (const f of FILLERS) expect(ws.said()).not.toContain(f);
  });

  it("speaks exactly one rotated filler when a tool hop leaves the line silent", async () => {
    // Hop 1: the model calls a (slow) tool. Hop 2: the answer.
    apiMock.itemOptions = vi.fn(async () => {
      await settle(1800);
      return { item: { name: "Coke", modifierGroups: [], variants: [] }, combo: null };
    });
    apiMock.menu.mockResolvedValue({
      restaurant: { name: "Luigi's", currency: "cad" },
      menu: [{ category: "Drinks", items: [{ menuItemId: "coke", name: "Coke", price: 2, isPizza: false, isCombo: false, hasVariants: false, variants: [] }] }],
    });
    let call = 0;
    const two = {
      messages: {
        stream: () => {
          call++;
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              if (call === 1) {
                return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_item_options", input: { menuItemId: "coke" } }], usage: {} };
              }
              for (const l of listeners) l("Coke comes in one size.");
              return { stop_reason: "end_turn", content: [{ type: "text", text: "Coke comes in one size." }], usage: {} };
            },
          };
        },
      },
    };
    const { ws, s } = await startedSession(two as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "What sizes of Coke?" }));
    await settle(2400);
    const said = ws.said();
    const spokenFillers = FILLERS.filter((f) => said.includes(f));
    expect(spokenFillers).toHaveLength(1);
    expect(said).toContain("Coke comes in one size.");
  });
});

describe("the THINKING filler covers a first hop that stays silent past 2.5 s (call cmsw4s0mz, 2026-08-16)", () => {
  // Nabil went straight to a tool with no acknowledgement on every pizza edit —
  // 2.6–4 s of dead air each time; the tool filler only arms once the tool call
  // has started. One short ack after 2.5 s of nothing, never a second filler.
  const THINKING = ["Sure.", "Okay.", "Got it.", "Alright."];
  const TOOL_FILLERS = ["One sec.", "Let me check that.", "Just a moment.", "Bear with me a second."];

  it("speaks one ack when a plain answer's first token is 3 s away — and stays quiet at 1.7 s (the 08-15 rule)", async () => {
    const slow = (ms: number) => ({
      messages: {
        stream: () => {
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              await settle(ms);
              for (const l of listeners) l("Pickup it is.");
              return { stop_reason: "end_turn", content: [{ type: "text", text: "Pickup it is." }], usage: {} };
            },
          };
        },
      },
    });
    const a = await startedSession(slow(3_000) as never);
    a.s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(3_300);
    const said = a.ws.said();
    expect(THINKING.filter((p) => said.includes(p))).toHaveLength(1);
    expect(said.indexOf("Pickup it is.")).toBeGreaterThan(0); // the ack came first
    // a 1.7 s answer never gets one
    const b = await startedSession(slow(1_700) as never);
    b.s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(2_000);
    for (const p of THINKING) expect(b.ws.said()).not.toContain(p);
  });

  it("a slow tool-first hop gets the ack, and the tool filler does NOT double it", async () => {
    apiMock.itemOptions = vi.fn(async () => {
      await settle(1_800);
      return { item: { name: "Coke", modifierGroups: [], variants: [] }, combo: null };
    });
    apiMock.menu.mockResolvedValue({
      restaurant: { name: "Luigi's", currency: "cad" },
      menu: [{ category: "Drinks", items: [{ menuItemId: "coke", name: "Coke", price: 2, isPizza: false, isCombo: false, hasVariants: false, variants: [] }] }],
    });
    let call = 0;
    const two = {
      messages: {
        stream: () => {
          call++;
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              if (call === 1) {
                await settle(3_000); // the model "thinks" for 3 s before the tool call
                return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_item_options", input: { menuItemId: "coke" } }], usage: {} };
              }
              for (const l of listeners) l("Coke comes in one size.");
              return { stop_reason: "end_turn", content: [{ type: "text", text: "Coke comes in one size." }], usage: {} };
            },
          };
        },
      },
    };
    const { ws, s } = await startedSession(two as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "What sizes of Coke?" }));
    await settle(5_500);
    const said = ws.said();
    expect(THINKING.filter((p) => said.includes(p))).toHaveLength(1);
    expect(TOOL_FILLERS.filter((p) => said.includes(p))).toHaveLength(0);
    expect(said).toContain("Coke comes in one size.");
  });

  it("a barge-in right after the filler is a REAL interrupt on this turn, never 'stale' (T11, 2026-08-16)", async () => {
    // First hop: 3.5 s to the first token. The filler speaks at 2.5 s; the
    // caller cuts in at ~2.9 s having heard exactly "Okay. ". Before the fix
    // that read as a stale interrupt (the filler was the "last spoken text" and
    // not part of the stream), the reply carried on, and the caller's
    // correction was answered as if nothing had been said.
    const anthropic = fakeAnthropic([{ deltas: ["Pickup it is — a large pizza with green peppers."], ttft: 3_500 }, { deltas: ["Green olives instead — done."] }]);
    const { ws, s } = await startedSession(anthropic);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup, a large pizza with green peppers." }));
    await settle(2_900);
    const heard = ws.said();
    expect(THINKING.some((p) => heard.includes(p))).toBe(true);
    s.onMessage(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: heard }));
    await settle(1_200);
    expect(ws.said()).not.toContain("green peppers"); // the cut reply never played
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Wait — green olives, not green peppers." }));
    await settle(600);
    expect(ws.said()).toContain("Green olives instead — done.");
  });

  it("thinkingFillerMs: 0 disables it (harness seam)", async () => {
    const slow = {
      messages: {
        stream: () => {
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              await settle(3_000);
              for (const l of listeners) l("Pickup it is.");
              return { stop_reason: "end_turn", content: [{ type: "text", text: "Pickup it is." }], usage: {} };
            },
          };
        },
      },
    };
    const ws = fakeWs();
    const s = new CallSession(ws as never, TOKEN, slow as never, { thinkingFillerMs: 0 });
    s.onMessage(JSON.stringify({ type: "setup" }));
    await settle();
    await settle();
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
    await settle(3_300);
    for (const p of THINKING) expect(ws.said()).not.toContain(p);
    expect(ws.said()).toContain("Pickup it is.");
  });
});

/**
 * BOOKKEEPING MERGE (Luigi's live call 2026-08-15: 2.9 s of silence after "my
 * name is Sam" because set_fulfilment + set_customer forced a second model hop
 * before "Thanks, Sam"). When the model already spoke a full sentence in the
 * same message as pure bookkeeping calls, the turn ends there; the tool
 * results ride at the front of the NEXT user message.
 */
describe("bookkeeping merge — no second hop when the model already answered", () => {
  /** A fake that returns scripted messages and records every request's messages[]. */
  function scripted(script: Array<{ text?: string; tools?: Array<{ id: string; name: string; input: unknown }> }>) {
    const requests: any[] = [];
    let call = 0;
    return {
      requests,
      calls: () => call,
      messages: {
        stream: (params: any) => {
          requests.push(params.messages);
          const step = script[call++] ?? { text: "Okay." };
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              if (step.text) for (const l of listeners) l(step.text);
              const content: any[] = [];
              if (step.text) content.push({ type: "text", text: step.text });
              for (const t of step.tools ?? []) content.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
              return { stop_reason: step.tools?.length ? "tool_use" : "end_turn", content, usage: { input_tokens: 10, output_tokens: 5 } };
            },
          };
        },
      },
    };
  }

  it("text + set_fulfilment(pickup) + set_customer in ONE message = one request; results lead the next user turn", async () => {
    const fake = scripted([
      { text: "Thanks, Sam — what can I get for you?", tools: [{ id: "t1", name: "set_fulfilment", input: { type: "pickup" } }, { id: "t2", name: "set_customer", input: { name: "Sam" } }] },
      { text: "Sure. What size?" },
    ]);
    const { ws, s } = await startedSession(fake as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup, and my name is Sam." }));
    await settle(50);
    expect(fake.calls()).toBe(1); // no second hop
    expect(ws.said()).toContain("Thanks, Sam — what can I get for you?");
    expect(ws.spoken().some((t) => t.last)).toBe(true); // the turn was closed
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "A large pizza please." }));
    await settle(50);
    expect(fake.calls()).toBe(2);
    const second = fake.requests[1];
    const lastUser = second[second.length - 1];
    expect(lastUser.role).toBe("user");
    // tool_result blocks first (t1, t2), then the STATE / caller text blocks.
    expect(lastUser.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(lastUser.content[1]).toMatchObject({ type: "tool_result", tool_use_id: "t2" });
    expect(lastUser.content.slice(2).every((b: any) => b.type === "text")).toBe(true);
    expect(String(lastUser.content[lastUser.content.length - 1].text)).toContain("A large pizza please.");
  });

  it("does NOT merge when the model said nothing, when a tool changes the cart, or when a tool needs info", async () => {
    // (a) silent bookkeeping call → the second hop must run so the caller hears something.
    const silent = scripted([{ tools: [{ id: "t1", name: "set_customer", input: { name: "Sam" } }] }, { text: "Got it, Sam." }]);
    const a = await startedSession(silent as never);
    a.s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "It's Sam." }));
    await settle(50);
    expect(silent.calls()).toBe(2);
    expect(a.ws.said()).toContain("Got it, Sam.");

    // (b) a delivery address check is not bookkeeping — its result (fee/zone) must be spoken.
    apiMock.checkAddress = vi.fn(async () => ({ ok: true, located: true, inside: true, fee: 4.99, zoneName: "Zone A" }));
    const delivery = scripted([
      { text: "Delivery, got it.", tools: [{ id: "t1", name: "set_fulfilment", input: { type: "delivery", street: "1 Main St", city: "Milton", zip: "L9T 1A1" } }] },
      { text: "That's in our zone, delivery is four ninety-nine." },
    ]);
    const b = await startedSession(delivery as never);
    b.s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Delivery to 1 Main St Milton L9T 1A1." }));
    await settle(80);
    expect(delivery.calls()).toBe(2);
  });
});

/**
 * FLUX TAIL FRAGMENTS (2026-08-16): a one-word tail ("instead.") arriving right
 * after a reply that asked no question is absorbed and folded into the next
 * turn — never answered with "Sorry, what would you like instead?".
 */
describe("Flux tail fragments", () => {
  it("absorbs 'instead.' after a statement and passes it as context on the next turn; a tail after a QUESTION is a real answer", async () => {
    const requests: any[] = [];
    let call = 0;
    const replies = ["Done — that's a large pizza, half Philly Steak, half Chipotle Chicken.", "Great, that's all set then. Can I get a name for the order?", "Thanks, Sam."];
    const fake = {
      messages: {
        stream: (params: any) => {
          requests.push(params.messages);
          const text = replies[call++] ?? "Okay.";
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              for (const l of listeners) l(text);
              return { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } };
            },
          };
        },
      },
    };
    const { ws, s } = await startedSession(fake as never);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Switch the deluxe half with chipotle chicken." }));
    await settle(30);
    expect(call).toBe(1);
    // the tail arrives alone, 1 s later, after a reply with no question
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "instead." }));
    await settle(30);
    expect(call).toBe(1); // no model request, nothing spoken for it
    expect(ws.said()).not.toContain("instead");
    // next real prompt carries the tail as context
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "No. That was right." }));
    await settle(30);
    expect(call).toBe(2);
    const lastUser = requests[1][requests[1].length - 1];
    const text = String(lastUser.content[lastUser.content.length - 1].text);
    expect(text).toContain('they added "instead."');
    expect(text).toContain("No. That was right.");
    // after a QUESTION ("Can I get a name?") a short word that arrives once the
    // question could have been heard is an answer, not a tail
    (s as any).lastTurnEndedAt = Date.now() - 4_000;
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Please." }));
    await settle(30);
    expect(call).toBe(3);
  });
});

/**
 * EARLY FRAGMENTS (Roya's call, 2026-08-16 11:41): "special" landed 1 ms after
 * "what topping would you like on it?" was generated — the tail of her "Yes…
 * special", not an answer to a question she had not yet heard. Answering it
 * repeated the topping question. An utterance that arrives before the reply
 * could have been heard is held; the caller's real response carries it as
 * context; if they stay silent after the reply has played, it runs on its own.
 */
describe("early fragments — a word that arrives before the reply could be heard is never answered as a fresh turn", () => {
  function scriptedFake(replies: string[], requests: any[]) {
    let call = 0;
    return {
      calls: () => call,
      messages: {
        stream: (params: any) => {
          requests.push(params.messages);
          const text = replies[call++] ?? "Okay.";
          const listeners: Array<(d: string) => void> = [];
          return {
            on: (evt: string, cb: (d: string) => void) => {
              if (evt === "text") listeners.push(cb);
            },
            finalMessage: async () => {
              for (const l of listeners) l(text);
              return { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } };
            },
          };
        },
      },
    };
  }

  it("holds 'special' (1 ms after a QUESTION) and folds it into the real answer — the question is asked once", async () => {
    vi.useFakeTimers();
    try {
      const requests: any[] = [];
      const fake = scriptedFake(["Great, I've added a medium pizza with one topping — what topping would you like on it?", "Perfect, that's a medium pizza with pineapple. Anything else?"], requests);
      const ws = fakeWs();
      const s = new CallSession(ws as never, TOKEN, fake as never);
      s.onMessage(JSON.stringify({ type: "setup" }));
      await vi.advanceTimersByTimeAsync(5);
      await vi.advanceTimersByTimeAsync(5);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Yes." }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(1);
      // the tail lands 1 ms after the reply was generated
      await vi.advanceTimersByTimeAsync(1);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "special" }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(1); // NOT answered — no second "what topping?"
      // the real answer arrives 3 s later and carries the fragment as context
      await vi.advanceTimersByTimeAsync(3_000);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pineapple." }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(2);
      const lastUser = requests[1][requests[1].length - 1];
      const text = String(lastUser.content[lastUser.content.length - 1].text);
      expect(text).toContain('they added "special"');
      expect(text).toContain("Pineapple.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("if the caller says nothing after the reply has played, the held fragment runs on its own with the nudge framing (never lost)", async () => {
    vi.useFakeTimers();
    try {
      const requests: any[] = [];
      const fake = scriptedFake(["Got it, a garlic dip added. Anything else for you?", "Sure — what kind of salad?"], requests);
      const ws = fakeWs();
      const s = new CallSession(ws as never, TOKEN, fake as never);
      s.onMessage(JSON.stringify({ type: "setup" }));
      await vi.advanceTimersByTimeAsync(5);
      await vi.advanceTimersByTimeAsync(5);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Garlic." }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(1);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "and a salad" })); // blurted before hearing the reply
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(1);
      // reply (~50 chars ≈ 4 s) + 7 s silence → the fragment runs alone
      await vi.advanceTimersByTimeAsync(4_000 + 7_000 + 200);
      expect(fake.calls()).toBe(2);
      const lastUser = requests[1][requests[1].length - 1];
      const text = String(lastUser.content[lastUser.content.length - 1].text);
      expect(text).toContain('they added "and a salad"');
      expect(text).toContain("If that was a request, act on it now");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a fragment arriving AFTER the early window is handled by the ordinary rules (an answer to a question runs at once)", async () => {
    vi.useFakeTimers();
    try {
      const requests: any[] = [];
      const fake = scriptedFake(["Pickup or delivery?", "Pickup it is."], requests);
      const ws = fakeWs();
      const s = new CallSession(ws as never, TOKEN, fake as never);
      s.onMessage(JSON.stringify({ type: "setup" }));
      await vi.advanceTimersByTimeAsync(5);
      await vi.advanceTimersByTimeAsync(5);
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hi, I'd like to order." }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(1);
      await vi.advanceTimersByTimeAsync(2_500); // the caller heard the question
      s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Pickup." }));
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.calls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
