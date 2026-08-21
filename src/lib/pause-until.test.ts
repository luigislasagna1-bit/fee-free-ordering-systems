/**
 * resolvePauseUntil — the shared pause-services body resolver (Temporary
 * Closure quick-picks). All calendar math in the RESTAURANT's timezone.
 * Fixed `now` values; Toronto is UTC-4 (EDT) in August, UTC-5 (EST) after
 * DST ends on Sunday 2026-11-01.
 */
import { describe, expect, it } from "vitest";
import { resolvePauseUntil } from "./pause-until";

const TZ = "America/Toronto";
// Thursday 2026-08-20 16:00 in Toronto.
const NOW = new Date("2026-08-20T20:00:00.000Z");

function until(body: Parameters<typeof resolvePauseUntil>[0], now = NOW, tz = TZ) {
  const r = resolvePauseUntil(body, tz, now);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.until;
}

describe("resolvePauseUntil", () => {
  it("resume / untilIso:null clear the pause", () => {
    expect(until({ resume: true })).toBeNull();
    expect(until({ untilIso: null })).toBeNull();
  });

  it("untilIso passes through; invalid → error", () => {
    expect(until({ untilIso: "2026-08-21T00:00:00.000Z" })!.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    const bad = resolvePauseUntil({ untilIso: "not-a-date" }, TZ, NOW);
    expect(bad.ok).toBe(false);
  });

  it("durationMinutes counts from now", () => {
    expect(until({ durationMinutes: 90 })!.toISOString()).toBe("2026-08-20T21:30:00.000Z");
  });

  it("restOfDay = 23:59 tonight in the restaurant's timezone", () => {
    // 23:59 Toronto (EDT, UTC-4) = 03:59Z next day.
    expect(until({ restOfDay: true })!.toISOString()).toBe("2026-08-21T03:59:00.000Z");
  });

  it("untilStartOfDay tomorrow = local midnight tonight", () => {
    // Fri 2026-08-21 00:00 Toronto = 04:00Z.
    expect(until({ untilStartOfDay: "tomorrow" })!.toISOString()).toBe("2026-08-21T04:00:00.000Z");
  });

  it("untilStartOfDay monday = the next local Monday at 00:00", () => {
    // Thu Aug 20 → Mon Aug 24 00:00 Toronto = 04:00Z.
    expect(until({ untilStartOfDay: "monday" })!.toISOString()).toBe("2026-08-24T04:00:00.000Z");
  });

  it("a Monday click ON a Monday means NEXT Monday, not resume-now", () => {
    // Monday 2026-08-24 16:00 Toronto.
    const monNoon = new Date("2026-08-24T20:00:00.000Z");
    expect(until({ untilStartOfDay: "monday" }, monNoon)!.toISOString()).toBe("2026-08-31T04:00:00.000Z");
  });

  it("monday across the DST fall-back stays a local midnight", () => {
    // Friday 2026-10-30 12:00 Toronto (EDT). DST ends Sun Nov 1 → Mon Nov 2
    // 00:00 Toronto is EST (UTC-5) = 05:00Z.
    const oct = new Date("2026-10-30T16:00:00.000Z");
    expect(until({ untilStartOfDay: "monday" }, oct)!.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("untilLocal resolves the wall-clock in the restaurant's timezone", () => {
    // 15:30 Toronto on Dec 24 (EST, UTC-5) = 20:30Z.
    expect(until({ untilLocal: { date: "2026-12-24", time: "15:30" } })!.toISOString()).toBe("2026-12-24T20:30:00.000Z");
  });

  it("untilLocal rejects bad shapes and past times", () => {
    for (const body of [
      { untilLocal: { date: "24-12-2026", time: "15:30" } },
      { untilLocal: { date: "2026-12-24", time: "25:00" } },
      { untilLocal: { date: "2026-12-24", time: "3pm" } },
      { untilLocal: { date: "2026-08-01", time: "12:00" } }, // in the past
    ]) {
      const r = resolvePauseUntil(body, TZ, NOW);
      expect(r.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("no recognized shape → error naming the options", () => {
    const r = resolvePauseUntil({}, TZ, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("untilStartOfDay");
  });
});
