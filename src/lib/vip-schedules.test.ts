import { describe, it, expect } from "vitest";
import { computeNextRun, periodKeyFor, parseSendHour, type ScheduleShape } from "@/lib/vip-schedules";

const TZ = "UTC";
const at = (iso: string) => new Date(iso);

describe("vip-schedules — parseSendHour", () => {
  it("parses HH:mm, defaults + clamps", () => {
    expect(parseSendHour("09:30")).toEqual([9, 30]);
    expect(parseSendHour("")).toEqual([9, 0]);
    expect(parseSendHour(null)).toEqual([9, 0]);
    expect(parseSendHour("99:99")).toEqual([23, 59]);
  });
});

describe("vip-schedules — computeNextRun", () => {
  it("once: future start fires; past start is null", () => {
    const s: ScheduleShape = { cadence: "once", sendHour: "09:00", startDate: "2026-07-01" };
    expect(computeNextRun(s, at("2026-06-27T00:00:00Z"), TZ)?.toISOString()).toBe("2026-07-01T09:00:00.000Z");
    const past: ScheduleShape = { cadence: "once", sendHour: "09:00", startDate: "2026-06-01" };
    expect(computeNextRun(past, at("2026-06-27T00:00:00Z"), TZ)).toBeNull();
  });

  it("daily: same-day if time still ahead, else next day", () => {
    const s: ScheduleShape = { cadence: "daily", sendHour: "09:00", startDate: "2026-06-01" };
    expect(computeNextRun(s, at("2026-06-27T08:00:00Z"), TZ)?.toISOString()).toBe("2026-06-27T09:00:00.000Z");
    expect(computeNextRun(s, at("2026-06-27T10:00:00Z"), TZ)?.toISOString()).toBe("2026-06-28T09:00:00.000Z");
  });

  it("daily: a future startDate skips earlier days", () => {
    const s: ScheduleShape = { cadence: "daily", sendHour: "09:00", startDate: "2026-07-10" };
    expect(computeNextRun(s, at("2026-06-27T00:00:00Z"), TZ)?.toISOString()).toBe("2026-07-10T09:00:00.000Z");
  });

  it("weekly: lands on the right weekday, strictly after", () => {
    const s: ScheduleShape = { cadence: "weekly", dayOfWeek: 1 /* Mon */, sendHour: "09:00", startDate: "2026-06-01" };
    const next = computeNextRun(s, at("2026-06-27T00:00:00Z"), TZ)!; // Sat 27th
    expect(next.getUTCDay()).toBe(1);
    expect(next.getTime()).toBeGreaterThan(at("2026-06-27T00:00:00Z").getTime());
    expect(next.getTime() - at("2026-06-27T00:00:00Z").getTime()).toBeLessThanOrEqual(8 * 86400000);
    expect(next.toISOString()).toBe("2026-06-29T09:00:00.000Z");
  });

  it("monthly: normal day-of-month", () => {
    const s: ScheduleShape = { cadence: "monthly", dayOfMonth: 15, sendHour: "09:00", startDate: "2026-06-01" };
    expect(computeNextRun(s, at("2026-06-27T00:00:00Z"), TZ)?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("monthly: clamps day 31 to the month length (Feb)", () => {
    const s: ScheduleShape = { cadence: "monthly", dayOfMonth: 31, sendHour: "09:00", startDate: "2026-01-01" };
    // 2026 is not a leap year → Feb has 28 days.
    expect(computeNextRun(s, at("2026-02-01T00:00:00Z"), TZ)?.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("respects the restaurant timezone (09:00 local, not UTC)", () => {
    const s: ScheduleShape = { cadence: "daily", sendHour: "09:00", startDate: "2026-06-01" };
    // Toronto is UTC-4 in June (EDT) → 09:00 local = 13:00 UTC.
    const next = computeNextRun(s, at("2026-06-27T00:00:00Z"), "America/Toronto")!;
    expect(next.toISOString()).toBe("2026-06-27T13:00:00.000Z");
  });
});

describe("vip-schedules — periodKeyFor", () => {
  it("buckets by cadence", () => {
    const d = at("2026-07-15T09:00:00Z");
    expect(periodKeyFor("once", d, TZ)).toBe("once");
    expect(periodKeyFor("daily", d, TZ)).toBe("2026-07-15");
    expect(periodKeyFor("weekly", d, TZ)).toBe("2026-07-15");
    expect(periodKeyFor("monthly", d, TZ)).toBe("2026-07");
  });
});
