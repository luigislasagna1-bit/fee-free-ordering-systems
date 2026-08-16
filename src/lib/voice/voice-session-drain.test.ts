/**
 * Deploy drain in the REAL voice session (`services/nabil-voice/src/session.ts`).
 *
 * Until 2026-08-15 nothing listened for SIGTERM, so `fly deploy` killed the
 * process outright. The caller was not left in silence — Twilio's <Connect
 * action> fires whenever the relay ends, so their phone was warm-transferred to
 * the store — but it happened mid-sentence with no explanation, and `finalize()`
 * was killed in flight. That is the expensive half: the call record, transcript,
 * cost and revenue attribution for every in-progress call were lost, so a deploy
 * silently erased whatever was live.
 *
 * shutdownTransfer() is the fix, and these pin its three obligations: say
 * something, hand off through the same path a normal transfer uses, and WRITE
 * THE RECORD before the process goes away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// CONFIG reads these at import time and throws without them.
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
vi.mock("../../../services/nabil-voice/src/api", () => ({ api: apiMock }));

import { CallSession } from "../../../services/nabil-voice/src/session";

function fakeWs() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
    said: () =>
      sent
        .filter((m) => m.type === "text")
        .map((m) => String(m.token))
        .join(""),
    ended: () => sent.filter((m) => m.type === "end"),
  };
}

/** Never asked to stream in these tests — the drain happens between turns. */
const idleAnthropic = {
  messages: {
    stream: () => ({
      on: () => {},
      finalMessage: async () => ({ stop_reason: "end_turn", content: [], usage: { input_tokens: 0, output_tokens: 0 } }),
    }),
  },
};

const TOKEN = { restaurantId: "r1", slug: "luigis", callSid: "CA-drain-1", to: "+15551112222", from: "+14168338405" };
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

async function startedSession() {
  const ws = fakeWs();
  const s = new CallSession(ws as never, TOKEN, idleAnthropic as never);
  s.onMessage(JSON.stringify({ type: "setup" }));
  await settle();
  await settle();
  return { ws, s };
}

describe("shutdownTransfer — a deploy must not cut a caller off silently", () => {
  it("says one sentence before handing over, instead of the line just dying", async () => {
    const { ws, s } = await startedSession();
    await s.shutdownTransfer();
    expect(ws.said()).toContain("putting you through to the restaurant");
  });

  it("ends the relay with a transfer reason, so the handoff route dials the store", async () => {
    const { ws, s } = await startedSession();
    await s.shutdownTransfer();

    const ends = ws.ended();
    expect(ends).toHaveLength(1);
    const handoff = JSON.parse(String(ends[0].handoffData));
    // NOT "call_time_limit" — that reason makes the handoff route say goodbye
    // and hang up instead of bridging the caller to a person.
    expect(handoff.reason).toBe("service_restart");
  });

  it("WRITES THE CALL RECORD before the process goes away — the half a kill used to lose", async () => {
    const { s } = await startedSession();
    await s.shutdownTransfer();

    expect(apiMock.logCall).toHaveBeenCalledTimes(1);
    const body = apiMock.logCall.mock.calls[0][0];
    expect(body.event).toBe("end");
    expect(body.callSid).toBe(TOKEN.callSid);
    expect(body.transferReason).toBe("service_restart");
    expect(typeof body.durationSeconds).toBe("number");
  });

  it("is idempotent — the socket closing right after must not write a second record", async () => {
    const { s } = await startedSession();
    await s.shutdownTransfer();
    s.onClose();
    await settle(10);
    await s.shutdownTransfer();
    await settle(10);

    expect(apiMock.logCall).toHaveBeenCalledTimes(1);
  });

  it("carries a custom reason through to the handoff", async () => {
    const { ws, s } = await startedSession();
    await s.shutdownTransfer("scale_down");
    expect(JSON.parse(String(ws.ended()[0].handoffData)).reason).toBe("scale_down");
  });
});
