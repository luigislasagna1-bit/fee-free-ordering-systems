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
  MAX_TRANSCRIPT_TURNS,
  MAX_TURN_TEXT_CHARS,
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
});
