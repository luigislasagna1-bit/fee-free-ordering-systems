/**
 * Body-validation rules for the call-log start/end events: real startedAt is
 * required (garbage rejected), only whitelisted fields survive parsing, the
 * outcome is pinned to the taxonomy, and the transcript is capped before it
 * can become an unbounded Json value.
 */
import { describe, it, expect } from "vitest";
import {
  parseStartBody,
  parseEndBody,
  capTranscript,
  parseEvents,
  parseEventsBody,
  parseVersions,
  parseMenuSnapshotBody,
  capEventPayload,
  MAX_TRANSCRIPT_TURNS,
  MAX_TURN_TEXT_CHARS,
  MAX_EVENTS_PER_BODY,
  MAX_EVENT_PAYLOAD_CHARS,
} from "./validation";

const base = { callSid: "CA123", restaurantId: "rest_1" };

describe("parseStartBody", () => {
  it("parses a valid start body with the REAL startedAt", () => {
    const iso = new Date(Date.now() - 5_000).toISOString();
    const r = parseStartBody({ ...base, fromNumber: "+15551234567", toNumber: "+13656581458", startedAtIso: iso });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.startedAt.toISOString()).toBe(iso);
      expect(r.data.fromNumber).toBe("+15551234567");
    }
  });

  it("rejects missing callSid/restaurantId", () => {
    expect(parseStartBody({ restaurantId: "r", startedAtIso: new Date().toISOString() }).ok).toBe(false);
    expect(parseStartBody({ callSid: "CA1", startedAtIso: new Date().toISOString() }).ok).toBe(false);
    expect(parseStartBody(null).ok).toBe(false);
  });

  it("rejects garbage startedAtIso instead of silently substituting now()", () => {
    for (const bad of [undefined, "", "banana", 12345, "0000-00-00"]) {
      const r = parseStartBody({ ...base, startedAtIso: bad });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects implausible timestamps (far future / pre-product past)", () => {
    expect(parseStartBody({ ...base, startedAtIso: "1999-01-01T00:00:00Z" }).ok).toBe(false);
    expect(
      parseStartBody({ ...base, startedAtIso: new Date(Date.now() + 60 * 60_000).toISOString() }).ok,
    ).toBe(false);
    // small clock skew is tolerated
    expect(
      parseStartBody({ ...base, startedAtIso: new Date(Date.now() + 60_000).toISOString() }).ok,
    ).toBe(true);
  });
});

describe("parseEndBody", () => {
  it("keeps only whitelisted, type-valid fields", () => {
    const r = parseEndBody({
      ...base,
      outcome: "order_placed",
      orderId: "ord_abc",
      orderNumber: "ORD-123",
      reservationCode: "R7",
      transferReason: "caller asked for a human",
      tokensIn: 1000,
      tokensOut: 250.7, // floored
      durationSeconds: 92,
      evil: "DROP TABLE", // unknown field must not survive
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.outcome).toBe("order_placed");
      expect(r.data.orderNumber).toBe("ORD-123");
      expect(r.data.tokensOut).toBe(250);
      expect("evil" in r.data).toBe(false);
    }
  });

  it("pins unknown outcomes to 'abandoned' (the taxonomy is closed)", () => {
    for (const bad of [undefined, "won_the_lottery", 42, ""]) {
      const r = parseEndBody({ ...base, outcome: bad });
      expect(r.ok && r.data.outcome).toBe("abandoned");
    }
  });

  it("nulls out wrong-typed numeric fields instead of storing garbage", () => {
    const r = parseEndBody({ ...base, tokensIn: "12", tokensOut: -5, durationSeconds: NaN });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.tokensIn).toBeNull();
      expect(r.data.tokensOut).toBeNull();
      expect(r.data.durationSeconds).toBeNull();
    }
  });

  it("requires callSid/restaurantId like the legacy route did", () => {
    expect(parseEndBody({}).ok).toBe(false);
  });
});

describe("capTranscript", () => {
  it("passes a well-formed transcript through, preserving ts", () => {
    const t = capTranscript([
      { role: "caller", text: "Hi, one pizza please", ts: 1700000000000 },
      { role: "agent", text: "Sure!" },
    ]);
    expect(t).toEqual([
      { role: "caller", text: "Hi, one pizza please", ts: 1700000000000 },
      { role: "agent", text: "Sure!" },
    ]);
  });

  it("returns undefined for a non-array so the DB field is left untouched", () => {
    expect(capTranscript(undefined)).toBeUndefined();
    expect(capTranscript("hello")).toBeUndefined();
    expect(capTranscript({ role: "caller" })).toBeUndefined();
  });

  it("caps the number of turns and the per-turn text length", () => {
    const turns = Array.from({ length: MAX_TRANSCRIPT_TURNS + 50 }, (_, i) => ({
      role: "caller",
      text: "x".repeat(MAX_TURN_TEXT_CHARS + 500),
      ts: i,
    }));
    const t = capTranscript(turns)!;
    expect(t).toHaveLength(MAX_TRANSCRIPT_TURNS);
    expect(t[0].text).toHaveLength(MAX_TURN_TEXT_CHARS);
  });

  it("normalizes ISO-string ts (what the voice service actually sends) to epoch millis", () => {
    const iso = "2026-08-10T12:00:00.000Z";
    const t = capTranscript([{ role: "caller", text: "Hi", ts: iso }])!;
    expect(t).toEqual([{ role: "caller", text: "Hi", ts: Date.parse(iso) }]);
  });

  it("ignores unparseable / oversized ts strings rather than storing NaN", () => {
    for (const bad of ["not-a-number", "x".repeat(60), ""]) {
      const t = capTranscript([{ role: "caller", text: "Hi", ts: bad }])!;
      expect(t).toEqual([{ role: "caller", text: "Hi" }]);
    }
  });

  it("never cuts inside a surrogate pair (a lone surrogate fails the whole jsonb write)", () => {
    // Pizza emoji straddles the cap: the naive slice would leave \uD83C.
    const t = capTranscript([
      { role: "caller", text: "x".repeat(MAX_TURN_TEXT_CHARS - 1) + "🍕" + "tail" },
    ])!;
    expect(t[0].text).toHaveLength(MAX_TURN_TEXT_CHARS - 1);
    expect(/[\uD800-\uDBFF]$/.test(t[0].text)).toBe(false);
    // A pair that fits entirely is preserved.
    const whole = capTranscript([{ role: "caller", text: "x".repeat(MAX_TURN_TEXT_CHARS - 2) + "🍕" }])!;
    expect(whole[0].text.endsWith("🍕")).toBe(true);
  });

  it("drops malformed turns instead of failing the whole payload", () => {
    const t = capTranscript([
      null,
      "not a turn",
      { role: "caller" }, // no text
      { text: "no role" },
      { role: "agent", text: "kept", ts: "not-a-number" },
    ])!;
    expect(t).toEqual([{ role: "agent", text: "kept" }]);
  });

  it("preserves toolName and ok on tool turns, ignores them on non-tool turns", () => {
    const t = capTranscript([
      { role: "tool", text: "add_to_order: cuid123", ts: 1700000000000, toolName: "add_to_order", ok: true },
      { role: "tool", text: "place_order", ts: 1700000001000, toolName: "place_order", ok: false },
      { role: "user", text: "Hi", ts: 1700000002000, toolName: "sneaky", ok: true },
    ])!;
    expect(t[0]).toEqual({ role: "tool", text: "add_to_order: cuid123", ts: 1700000000000, toolName: "add_to_order", ok: true });
    expect(t[1]).toEqual({ role: "tool", text: "place_order", ts: 1700000001000, toolName: "place_order", ok: false });
    expect(t[2]).toEqual({ role: "user", text: "Hi", ts: 1700000002000 });
  });
});

// ── Event log (directive §25–§27) ──────────────────────────────────────────

const ISO = "2026-08-15T12:00:00.000Z";
const ev = (over: Record<string, unknown>) => ({ seq: 1, ts: ISO, turn: 0, type: "asr", text: "hi", ...over });

describe("parseEvents", () => {
  it("lifts seq/ts/turn/type into columns and keeps the rest as payload", () => {
    const [e] = parseEvents([ev({ type: "asr", text: "one large pepperoni", lang: "en", synthetic: false })]);
    expect(e.seq).toBe(1);
    expect(e.ts.toISOString()).toBe(ISO);
    expect(e.turn).toBe(0);
    expect(e.type).toBe("asr");
    expect(e.payload).toEqual({ text: "one large pepperoni", lang: "en", synthetic: false });
    expect(e.latencyMs).toBeNull();
    expect(e.cartHash).toBeNull();
  });

  it("derives latencyMs + cartHash per type (tool_result ms/cartHashAfter, cart hash, turn ttfaMs, filler afterMs, tool_use cartHashBefore)", () => {
    const out = parseEvents([
      ev({ seq: 1, type: "tool_use", hop: 1, toolUseId: "t1", name: "add_line", input: {}, cartHashBefore: "aaaa" }),
      ev({ seq: 2, type: "tool_result", hop: 1, toolUseId: "t1", name: "add_line", ok: true, code: null, ms: 321.7, output: {}, cartHashAfter: "bbbb" }),
      ev({ seq: 3, type: "cart", hash: "bbbb", lines: [], problems: [], fulfilment: null }),
      ev({ seq: 4, type: "filler", hop: 1, tool: "add_line", afterMs: 900, phrase: "one sec" }),
      ev({ seq: 5, type: "turn", turnId: "u1", ttfaMs: 1200, cartHashBefore: "aaaa", cartHashAfter: "bbbb", hops: [], tools: [] }),
    ]);
    expect(out.map((e) => [e.type, e.latencyMs, e.cartHash])).toEqual([
      ["tool_use", null, "aaaa"],
      ["tool_result", 321, "bbbb"],
      ["cart", null, "bbbb"],
      ["filler", 900, null],
      ["turn", 1200, "bbbb"],
    ]);
  });

  it("drops unknown types, bad seq, unparseable ts, and duplicate seqs (first wins) — never the whole batch", () => {
    const out = parseEvents([
      ev({ seq: 1, type: "asr", text: "kept" }),
      ev({ seq: 2, type: "made_up" }),
      ev({ seq: -1, type: "asr" }),
      ev({ seq: 1.5, type: "asr" }),
      ev({ seq: 3, ts: "banana", type: "asr" }),
      ev({ seq: 1, type: "asr", text: "dupe" }),
      null,
      "nope",
      ev({ seq: 4, ts: Date.parse(ISO), type: "error", where: "x", message: "y" }), // epoch ms accepted
    ]);
    expect(out.map((e) => e.seq)).toEqual([1, 4]);
    expect(out[0].payload.text).toBe("kept");
    expect(out[1].ts.toISOString()).toBe(ISO);
  });

  it("caps the batch at MAX_EVENTS_PER_BODY", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_BODY + 20 }, (_, i) => ev({ seq: i }));
    expect(parseEvents(many)).toHaveLength(MAX_EVENTS_PER_BODY);
  });

  it("returns [] for a non-array", () => {
    expect(parseEvents(undefined)).toEqual([]);
    expect(parseEvents({ seq: 1 })).toEqual([]);
  });

  it("turn: non-integer / negative → null", () => {
    expect(parseEvents([ev({ turn: null })])[0].turn).toBeNull();
    expect(parseEvents([ev({ turn: "3" })])[0].turn).toBeNull();
    expect(parseEvents([ev({ turn: 2 })])[0].turn).toBe(2);
  });
});

describe("capEventPayload", () => {
  it("passes small payloads through unchanged", () => {
    expect(capEventPayload({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" });
  });

  it("shortens long strings with a visible marker so the event stays under the cap", () => {
    const big = "y".repeat(20_000);
    const r = capEventPayload({ output: { text: big }, ok: true });
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_EVENT_PAYLOAD_CHARS);
    expect(r.ok).toBe(true);
    const text = (r.output as any).text as string;
    expect(text.startsWith("yyyy")).toBe(true);
    expect(text).toMatch(/…\[truncated \d+ chars\]$/);
  });

  it("collapses to a preview when many medium strings still exceed the cap", () => {
    const arr = Array.from({ length: 200 }, (_, i) => `line ${i} ${"z".repeat(300)}`);
    const r = capEventPayload({ lines: arr });
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_EVENT_PAYLOAD_CHARS);
    expect(r._truncated).toBe(true);
    expect(typeof r.preview).toBe("string");
  });

  it("never throws on a circular payload", () => {
    const c: any = { a: 1 };
    c.self = c;
    expect(capEventPayload(c)).toEqual({ _unserializable: true });
  });
});

describe("parseEventsBody", () => {
  it("requires callSid + restaurantId + an events array", () => {
    expect(parseEventsBody({ callSid: "CA1", events: [] }).ok).toBe(false);
    expect(parseEventsBody({ ...base }).ok).toBe(false);
    const r = parseEventsBody({ ...base, events: [ev({})] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.events).toHaveLength(1);
  });
});

describe("parseVersions + end-body versions/events", () => {
  it("maps the four stored version fields and ignores the rest", () => {
    expect(
      parseVersions({ agentVersion: "fly-abc", promptVersion: "p7", toolsVersion: "t3", menuSnapshotHash: "8baa73198470c7bb", model: "claude", modelConfig: {} }),
    ).toEqual({ agentVersion: "fly-abc", promptVersion: "p7", toolsVersion: "t3", menuSnapshotHash: "8baa73198470c7bb" });
    expect(parseVersions(null)).toBeNull();
    expect(parseVersions({})).toBeNull();
    expect(parseVersions("v1")).toBeNull();
  });

  it("end body carries versions, menuSnapshotHash and the event tail", () => {
    const r = parseEndBody({
      ...base,
      outcome: "order_placed",
      versions: { agentVersion: "a1", promptVersion: "p1", toolsVersion: "t1", menuSnapshotHash: "h1" },
      menuSnapshotHash: "h1",
      events: [ev({ seq: 9, type: "call_end", outcome: "order_placed", latency: {}, usage: {}, costCents: 3 })],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.versions?.agentVersion).toBe("a1");
      expect(r.data.menuSnapshotHash).toBe("h1");
      expect(r.data.events).toHaveLength(1);
      expect(r.data.events[0].type).toBe("call_end");
    }
  });

  it("an un-upgraded voice service (no versions/events) still parses", () => {
    const r = parseEndBody({ ...base, outcome: "abandoned" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.versions).toBeNull();
      expect(r.data.menuSnapshotHash).toBeNull();
      expect(r.data.events).toEqual([]);
    }
  });

  it("falls back to versions.menuSnapshotHash when the top-level one is missing", () => {
    const r = parseEndBody({ ...base, versions: { menuSnapshotHash: "hh" } });
    expect(r.ok && r.data.menuSnapshotHash).toBe("hh");
  });
});

describe("parseMenuSnapshotBody", () => {
  it("accepts a hash + object payload", () => {
    const r = parseMenuSnapshotBody({ restaurantId: "r1", hash: "8baa73198470c7bb", payload: { items: [1, 2] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.payload).toEqual({ items: [1, 2] });
  });
  it("rejects a missing/odd hash or payload", () => {
    expect(parseMenuSnapshotBody({ restaurantId: "r1", payload: {} }).ok).toBe(false);
    expect(parseMenuSnapshotBody({ restaurantId: "r1", hash: "x y", payload: {} }).ok).toBe(false);
    expect(parseMenuSnapshotBody({ restaurantId: "r1", hash: "8baa73198470c7bb" }).ok).toBe(false);
    expect(parseMenuSnapshotBody({ hash: "8baa73198470c7bb", payload: {} }).ok).toBe(false);
  });
});
