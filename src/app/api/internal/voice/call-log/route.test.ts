/**
 * Route wiring for the event-log branches of /api/internal/voice/call-log:
 * "events" stubs the call, REDACTS every payload, writes with skipDuplicates
 * on (callId, seq) and bumps eventCount with COALESCE; "end" maps the §27
 * versions block onto the new columns and persists the event tail; and
 * "menu-snapshot" upserts by content hash. Auth stays fail-closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceCall: { upsert: vi.fn(), findUnique: vi.fn() },
    voiceCallEvent: { createMany: vi.fn() },
    voiceMenuSnapshot: { upsert: vi.fn() },
    voiceAgentConfig: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("next/server", async (orig) => {
  const mod = await orig<typeof import("next/server")>();
  return { ...mod, after: (fn: () => void) => void fn() };
});
vi.mock("@/lib/voice/twilio-recording", () => ({ startCallRecording: vi.fn(async () => undefined) }));
vi.mock("@/lib/voice/call-intelligence", () => ({ generateCallIntelligence: vi.fn(async () => undefined) }));
// The alarm module imports ops-messages (server-only + Prisma) — mocked here;
// its own behaviour is pinned in src/lib/voice/totals-mismatch-alarm.test.ts.
const { alarmMock } = vi.hoisted(() => ({ alarmMock: vi.fn(async () => "skipped" as const) }));
vi.mock("@/lib/voice/totals-mismatch-alarm", () => ({ alertTotalsMismatch: alarmMock }));

import { POST } from "./route";

const SECRET = "shh";
function post(body: unknown, key: string | null = SECRET) {
  return new NextRequest("http://localhost/api/internal/voice/call-log", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-internal-key": key } : {}) },
    body: JSON.stringify(body),
  });
}
const ISO = "2026-08-15T12:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_API_SECRET", SECRET);
  prismaMock.voiceCall.upsert.mockResolvedValue({ id: "call_1" });
  prismaMock.voiceCallEvent.createMany.mockResolvedValue({ count: 2 });
  prismaMock.voiceMenuSnapshot.upsert.mockResolvedValue({ hash: "h" });
  prismaMock.voiceAgentConfig.findUnique.mockResolvedValue(null);
  prismaMock.$executeRaw.mockResolvedValue(1);
});
afterEach(() => vi.unstubAllEnvs());

describe("auth", () => {
  it("rejects a missing/wrong internal key before touching the DB", async () => {
    const res = await POST(post({ event: "events", callSid: "CA1", restaurantId: "r1", events: [] }, "nope"));
    expect(res.status).toBe(403);
    expect(prismaMock.voiceCall.upsert).not.toHaveBeenCalled();
  });
});

describe('event:"events"', () => {
  it("stubs the call, redacts payloads, inserts with skipDuplicates and bumps eventCount", async () => {
    const res = await POST(
      post({
        event: "events",
        callSid: "CA1",
        restaurantId: "r1",
        events: [
          { seq: 1, ts: ISO, turn: 0, type: "asr", text: "call me at 416 833 8405", lang: "en", synthetic: false },
          { seq: 2, ts: ISO, turn: 0, type: "tool_use", hop: 1, toolUseId: "t1", name: "set_fulfilment", input: { street: "123 Main St" }, cartHashBefore: "4168338405aaaa" },
          { seq: 3, ts: ISO, turn: 0, type: "bogus" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "call_1", inserted: 2 });

    // Stub row keyed on callSid, never clobbering what start/end wrote.
    const up = prismaMock.voiceCall.upsert.mock.calls[0][0];
    expect(up.where).toEqual({ callSid: "CA1" });
    expect(up.create).toMatchObject({ callSid: "CA1", restaurantId: "r1" });
    expect(up.update).toEqual({});

    const cm = prismaMock.voiceCallEvent.createMany.mock.calls[0][0];
    expect(cm.skipDuplicates).toBe(true);
    expect(cm.data).toHaveLength(2); // the bogus type was dropped
    expect(cm.data[0]).toMatchObject({ callId: "call_1", seq: 1, turn: 0, type: "asr" });
    expect(cm.data[0].payload.text).toBe("call me at ***-8405"); // REDACTED
    expect(cm.data[1].payload.input.street).toBe("1** Main St"); // street number masked
    expect(cm.data[1].payload.cartHashBefore).toBe("4168338405aaaa"); // hash keys untouched
    expect(cm.data[1].cartHash).toBe("4168338405aaaa");

    // eventCount bump is a COALESCE update (nullable column), by the inserted count.
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prismaMock.$executeRaw.mock.calls[0];
    expect(strings.join("?")).toMatch(/COALESCE\("eventCount", 0\) \+ \?/);
    expect(values).toEqual([2, "call_1"]);
  });

  it("does not bump eventCount when a retried flush inserts nothing", async () => {
    prismaMock.voiceCallEvent.createMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(post({ event: "events", callSid: "CA1", restaurantId: "r1", events: [{ seq: 1, ts: ISO, turn: 0, type: "asr", text: "hi" }] }));
    expect(await res.json()).toEqual({ ok: true, id: "call_1", inserted: 0 });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("400s without callSid/restaurantId/events", async () => {
    expect((await POST(post({ event: "events", callSid: "CA1", events: [] }))).status).toBe(400);
    expect((await POST(post({ event: "events", callSid: "CA1", restaurantId: "r1" }))).status).toBe(400);
  });
});

describe('event:"end"', () => {
  it("maps versions + menuSnapshotHash onto the columns and persists the event tail", async () => {
    const res = await POST(
      post({
        event: "end",
        callSid: "CA1",
        restaurantId: "r1",
        fromNumber: "+14168338405",
        toNumber: "+13656581458",
        outcome: "order_placed",
        versions: { agentVersion: "fly-1", promptVersion: "p9", toolsVersion: "t4", model: "claude", menuSnapshotHash: "8baa73198470c7bb" },
        menuSnapshotHash: "8baa73198470c7bb",
        events: [{ seq: 40, ts: ISO, turn: 6, type: "call_end", outcome: "order_placed", latency: {}, usage: {}, costCents: 12 }],
      }),
    );
    expect(res.status).toBe(200);
    const up = prismaMock.voiceCall.upsert.mock.calls[0][0];
    expect(up.update).toMatchObject({ agentVersion: "fly-1", promptVersion: "p9", toolsVersion: "t4", menuSnapshotHash: "8baa73198470c7bb", outcome: "order_placed" });
    expect(up.create).toMatchObject({ agentVersion: "fly-1", fromDigits: "4168338405" });
    const cm = prismaMock.voiceCallEvent.createMany.mock.calls[0][0];
    expect(cm.data).toHaveLength(1);
    expect(cm.data[0]).toMatchObject({ callId: "call_1", seq: 40, type: "call_end" });
  });

  it("an un-upgraded service (no versions/events) leaves the version columns alone", async () => {
    await POST(post({ event: "end", callSid: "CA1", restaurantId: "r1", outcome: "abandoned" }));
    const up = prismaMock.voiceCall.upsert.mock.calls[0][0];
    expect("agentVersion" in up.update).toBe(false);
    expect("menuSnapshotHash" in up.update).toBe(false);
    expect(prismaMock.voiceCallEvent.createMany).not.toHaveBeenCalled();
  });

  it("hands the parsed totals + placement facts to the quoted≠charged alarm after the response (the alarm decides)", async () => {
    await POST(
      post({ event: "end", callSid: "CA9", restaurantId: "r1", outcome: "order_placed", orderNumber: "ORD-1", quotedTotal: 24.5, chargedTotal: 27.1 }),
    );
    expect(alarmMock).toHaveBeenCalledTimes(1);
    expect(alarmMock.mock.calls[0][0]).toMatchObject({
      callId: "call_1",
      restaurantId: "r1",
      callSid: "CA9",
      orderNumber: "ORD-1",
      outcome: "order_placed",
      quoted: 24.5,
      charged: 27.1,
    });
    expect(alarmMock.mock.calls[0][0].endedAt).toBeInstanceOf(Date);
  });

  it("a rejected alarm never surfaces (fire-and-forget after the response)", async () => {
    alarmMock.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(post({ event: "end", callSid: "CA9", restaurantId: "r1", outcome: "order_placed", quotedTotal: 1, chargedTotal: 2 }));
    expect(res.status).toBe(200);
  });
});

describe('event:"menu-snapshot"', () => {
  it("upserts by content hash (idempotent on retry)", async () => {
    const res = await POST(post({ event: "menu-snapshot", restaurantId: "r1", hash: "8baa73198470c7bb", payload: { items: [] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, hash: "8baa73198470c7bb" });
    const up = prismaMock.voiceMenuSnapshot.upsert.mock.calls[0][0];
    expect(up.where).toEqual({ hash: "8baa73198470c7bb" });
    expect(up.create).toEqual({ hash: "8baa73198470c7bb", restaurantId: "r1", payload: { items: [] } });
    expect(up.update).toEqual({});
  });

  it("400s on a bad hash", async () => {
    expect((await POST(post({ event: "menu-snapshot", restaurantId: "r1", hash: "no spaces!", payload: {} }))).status).toBe(400);
  });
});
