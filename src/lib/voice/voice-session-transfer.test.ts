/**
 * A1 — transfer invariants in the REAL voice session (services/nabil-voice/src/session.ts).
 *
 * 2026-08-21, calls cmt33pksg (7 min) and cmt33zt8f (2.7 min): transfer_to_human
 * returned ok, the relay was told to end, and the session kept answering the
 * caller's "Hello?" with "still connecting…" for minutes. These tests pin the
 * invariant that now makes that impossible by construction:
 *
 *   • after the hand-off decision exactly ONE `end` frame is sent, nothing is
 *     spoken after it, and no caller message (prompt / interrupt / dtmf) starts
 *     a model turn — they are counted on call_end as `droppedAfterEnd`;
 *   • the hand-off reason is written to the app BEFORE the relay is ended (the
 *     <Connect action> route never races the end record);
 *   • a failed write still ends the session (the store is dialled from the row /
 *     fallback), and a socket Twilio never closes is closed by the watchdog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
});

const { apiMock, order } = vi.hoisted(() => ({
  order: [] as string[],
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

/** A ConversationRelay socket that records frames in order. */
function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  let closed = 0;
  return {
    sent,
    closedCount: () => closed,
    send: (raw: string) => {
      const m = JSON.parse(raw);
      if (m.type === "end") order.push("end");
      sent.push(m);
    },
    close: () => {
      closed++;
    },
    said: () =>
      sent
        .filter((m) => m.type === "text")
        .map((m) => String(m.token))
        .join(""),
    endFrames: () => sent.filter((m) => m.type === "end"),
  };
}

/** Streaming fake: each reply is text deltas plus an optional tool_use block. */
function fakeAnthropic(replies: Reply[]) {
  let call = 0;
  return {
    calls: () => call,
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
          return {
            stop_reason: reply.toolUse ? "tool_use" : "end_turn",
            content,
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
  order.length = 0;
  apiMock.menu.mockResolvedValue({ restaurant: { name: "Luigi's", currency: "cad" }, menu: [] });
  apiMock.context.mockResolvedValue({ restaurant: { name: "Luigi's" }, open: { isOpenNow: true }, config: {} });
  apiMock.returningCaller.mockResolvedValue({ found: false });
  apiMock.logCallStart.mockResolvedValue({ ok: true });
  apiMock.logCall.mockResolvedValue({ ok: true });
  apiMock.logEvents.mockResolvedValue({ ok: true });
  apiMock.logHandoff.mockImplementation(async () => {
    order.push("handoff");
    return { ok: true, status: 200, json: { ok: true } };
  });
});

async function startedSession(anthropic: ReturnType<typeof fakeAnthropic>) {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, anthropic as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}

const TRANSFER: Reply[] = [
  { deltas: ["Sure — I'll put you through. "], toolUse: { name: "transfer_to_human", input: { reason: "caller asked for a person" } } },
  { deltas: ["Connecting you to a team member now."] },
];

function endEvents(body: unknown) {
  const b = body as { events?: Array<Record<string, unknown>> };
  return b?.events ?? [];
}

describe("after the hand-off decision the session is inert", () => {
  it("sends exactly one end frame, writes the reason BEFORE it, and ignores everything the caller says after", async () => {
    const anthropic = fakeAnthropic(TRANSFER);
    const { ws, s } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Can I talk to a person?" }));
    await settle(150);

    expect(ws.endFrames()).toHaveLength(1);
    expect(ws.said()).toContain("Connecting you to a team member now.");
    // ordered hand-off: the write landed before the relay was told to end
    expect(apiMock.logHandoff).toHaveBeenCalledTimes(1);
    expect(apiMock.logHandoff.mock.calls[0][0]).toMatchObject({ event: "handoff", callSid: "CA1", restaurantId: "r1", reason: "caller asked for a person" });
    expect(order).toEqual(["handoff", "end"]);

    const spokenBefore = ws.said();
    const callsBefore = anthropic.calls();
    // The caller keeps talking (the 2026-08-21 pattern) — nothing may answer.
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hello?" }));
    s.onMessage(JSON.stringify({ type: "interrupt", utteranceUntilInterrupt: "Connecting" }));
    s.onMessage(JSON.stringify({ type: "dtmf", digit: "0" }));
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Hello? Hello?" }));
    await settle(200);

    expect(anthropic.calls()).toBe(callsBefore);
    expect(ws.said()).toBe(spokenBefore);
    expect(ws.endFrames()).toHaveLength(1);

    // Twilio tears the socket down → the record says what happened.
    s.onClose();
    await settle(50);
    expect(apiMock.logCall).toHaveBeenCalledTimes(1);
    const body = apiMock.logCall.mock.calls[0][0] as Record<string, unknown>;
    expect(body.outcome).toBe("transferred");
    expect(body.transferReason).toBe("caller asked for a person");
    const evs = endEvents(body);
    const handoff = evs.find((e) => e.type === "transfer_handoff");
    expect(handoff).toMatchObject({ outcome: "handoff_written", reason: "caller asked for a person" });
    const end = evs.find((e) => e.type === "call_end");
    expect(end?.droppedAfterEnd).toBe(4);
  });

  it("a failed hand-off write still ends the session (never holds a caller for a log line)", async () => {
    apiMock.logHandoff.mockRejectedValue(new Error("app down"));
    const anthropic = fakeAnthropic(TRANSFER);
    const { ws, s } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Can I talk to a person?" }));
    await settle(150);

    expect(ws.endFrames()).toHaveLength(1);
    s.onClose();
    await settle(50);
    const evs = endEvents(apiMock.logCall.mock.calls[0][0]);
    expect(evs.find((e) => e.type === "transfer_handoff")).toMatchObject({ outcome: "handoff_write_failed" });
  });

  it("closes the socket itself if Twilio never does (watchdog)", { timeout: 10_000 }, async () => {
    const anthropic = fakeAnthropic(TRANSFER);
    const { ws, s } = await startedSession(anthropic);

    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Can I talk to a person?" }));
    await settle(150);
    expect(ws.endFrames()).toHaveLength(1);
    expect(apiMock.logCall).not.toHaveBeenCalled();

    // No onClose from the socket. The watchdog finalizes and closes.
    await settle(6_500);
    expect(apiMock.logCall).toHaveBeenCalledTimes(1);
    expect(ws.closedCount()).toBeGreaterThanOrEqual(1);
    const evs = endEvents(apiMock.logCall.mock.calls[0][0]);
    expect(evs.some((e) => e.type === "transfer_handoff" && e.outcome === "hard_closed")).toBe(true);
  });

  it("a second transfer request in the same call is a no-op (idempotent end)", async () => {
    const anthropic = fakeAnthropic([
      { deltas: ["One moment. "], toolUse: { name: "transfer_to_human", input: { reason: "first" } } },
      { deltas: ["Putting you through. "], toolUse: { name: "transfer_to_human", input: { reason: "second" } } },
      { deltas: ["Connecting you now."] },
    ]);
    const { ws, s } = await startedSession(anthropic);
    s.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Person please." }));
    await settle(200);
    expect(ws.endFrames()).toHaveLength(1);
    expect(apiMock.logHandoff).toHaveBeenCalledTimes(1);
  });
});
