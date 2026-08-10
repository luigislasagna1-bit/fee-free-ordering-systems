import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  bucketByDayKey,
  buildIntervalsByDow,
  computeVoiceAnalytics,
  conversionPct,
  countBy,
  dayKeysInRange,
  dowHistogram,
  hourHistogram,
  isAfterHours,
  isWithinIntervals,
  localDayKey,
  staffHoursReclaimed,
  type AnalyticsCall,
} from "./analytics";
import type { OpeningHoursRow } from "@/lib/restaurant-hours";

// ── After-hours logic ─────────────────────────────────────────────────

const day = (dayOfWeek: number, openTime: string, closeTime: string, extra: Partial<OpeningHoursRow> = {}): OpeningHoursRow => ({
  dayOfWeek,
  isOpen: true,
  openTime,
  closeTime,
  ...extra,
});

describe("isWithinIntervals / isAfterHours", () => {
  const weekday = buildIntervalsByDow([day(1, "09:00", "17:00")]); // Monday 9–5 only

  it("regular hours: inside vs boundary vs outside", () => {
    expect(isAfterHours(1, "08:59", weekday)).toBe(true);
    expect(isAfterHours(1, "09:00", weekday)).toBe(false);
    expect(isAfterHours(1, "16:59", weekday)).toBe(false);
    // close is exclusive — a 17:00 call is after-hours
    expect(isAfterHours(1, "17:00", weekday)).toBe(true);
  });

  it("closed days count everything as after-hours", () => {
    expect(isAfterHours(2, "12:00", weekday)).toBe(true);
    expect(isAfterHours(0, "12:00", weekday)).toBe(true);
  });

  it("overnight window spills into the next local day", () => {
    // Friday 22:00 → Saturday 02:00
    const byDay = buildIntervalsByDow([day(5, "22:00", "02:00", { closesNextDay: true })]);
    expect(isAfterHours(5, "23:30", byDay)).toBe(false); // Friday night
    expect(isAfterHours(6, "01:30", byDay)).toBe(false); // Saturday small hours
    expect(isAfterHours(6, "02:00", byDay)).toBe(true); // at close
    expect(isAfterHours(5, "21:00", byDay)).toBe(true); // before open
    expect(isAfterHours(6, "12:00", byDay)).toBe(true); // Saturday day (no row)
  });

  it("split hours: both windows open, the gap is after-hours", () => {
    const byDay = buildIntervalsByDow([
      day(3, "11:00", "23:00", {
        intervals: [
          { open: "11:00", close: "14:00" },
          { open: "18:00", close: "23:00" },
        ],
      }),
    ]);
    expect(isAfterHours(3, "12:00", byDay)).toBe(false);
    expect(isAfterHours(3, "15:30", byDay)).toBe(true); // between services
    expect(isAfterHours(3, "19:00", byDay)).toBe(false);
  });

  it("isOpen=false rows contribute no windows", () => {
    const byDay = buildIntervalsByDow([day(1, "09:00", "17:00", { isOpen: false })]);
    expect(isWithinIntervals("12:00", byDay[1], byDay[0])).toBe(false);
  });
});

// ── Series bucketing ──────────────────────────────────────────────────

describe("day-key series", () => {
  it("addDaysToKey crosses month boundaries", () => {
    expect(addDaysToKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysToKey("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("dayKeysInRange is inclusive and ordered", () => {
    expect(dayKeysInRange("2026-08-08", "2026-08-10")).toEqual([
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
    expect(dayKeysInRange("2026-08-10", "2026-08-10")).toEqual(["2026-08-10"]);
    expect(dayKeysInRange("2026-08-10", "2026-08-09")).toEqual([]);
  });

  it("bucketByDayKey zero-fills missing days and ignores out-of-range keys", () => {
    const keys = dayKeysInRange("2026-08-08", "2026-08-10");
    const series = bucketByDayKey(keys, ["2026-08-08", "2026-08-08", "2026-08-10", "2026-07-01"]);
    expect(series).toEqual([
      { key: "2026-08-08", count: 2 },
      { key: "2026-08-09", count: 0 },
      { key: "2026-08-10", count: 1 },
    ]);
  });

  it("localDayKey resolves in the given timezone", () => {
    // 2026-08-10T02:30Z is still Aug 9 in Toronto (UTC-4 in August)
    const d = new Date("2026-08-10T02:30:00Z");
    expect(localDayKey(d, "UTC")).toBe("2026-08-10");
    expect(localDayKey(d, "America/Toronto")).toBe("2026-08-09");
  });
});

describe("histograms + counters", () => {
  it("hourHistogram buckets 0..23 and drops garbage", () => {
    const h = hourHistogram([0, 0, 13, 23, 24, -1, NaN]);
    expect(h).toHaveLength(24);
    expect(h[0]).toBe(2);
    expect(h[13]).toBe(1);
    expect(h[23]).toBe(1);
    expect(h.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("dowHistogram buckets 0..6", () => {
    const h = dowHistogram([0, 6, 6, 7]);
    expect(h[0]).toBe(1);
    expect(h[6]).toBe(2);
    expect(h.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("countBy skips null/empty", () => {
    expect(countBy(["en", "en", "it", null, undefined, ""])).toEqual({ en: 2, it: 1 });
  });
});

describe("conversion + staff hours", () => {
  it("conversionPct never divides by zero", () => {
    expect(conversionPct(0, 0)).toBe(0);
    expect(conversionPct(5, 0)).toBe(0);
    expect(conversionPct(5, 20)).toBe(25);
    expect(conversionPct(1, 3)).toBe(33.3);
  });

  it("staffHoursReclaimed rounds to 1dp and floors bad input", () => {
    expect(staffHoursReclaimed(3300)).toBe(0.9);
    expect(staffHoursReclaimed(3600)).toBe(1);
    expect(staffHoursReclaimed(0)).toBe(0);
    expect(staffHoursReclaimed(-5)).toBe(0);
    expect(staffHoursReclaimed(NaN)).toBe(0);
  });
});

// ── End-to-end compositor ─────────────────────────────────────────────

describe("computeVoiceAnalytics", () => {
  const call = (over: Partial<AnalyticsCall>): AnalyticsCall => ({
    id: "c1",
    startedAt: new Date("2026-08-10T12:00:00Z"),
    durationSeconds: 60,
    outcome: null,
    language: null,
    sentiment: null,
    orderNumber: null,
    fromNumber: "+15550000001",
    customerId: null,
    upsellCents: null,
    transferReason: null,
    ...over,
  });

  it("aggregates a small fixture (UTC so the test is machine-independent)", () => {
    const range = {
      from: new Date("2026-08-09T00:00:00Z"),
      to: new Date("2026-08-10T23:59:59Z"),
    };
    const result = computeVoiceAnalytics({
      timezone: "UTC",
      range,
      // Open 09:00–17:00 every day of the fixture window (Sun=0, Mon=1)
      hoursRows: [day(0, "09:00", "17:00"), day(1, "09:00", "17:00")],
      calls: [
        call({ id: "a", startedAt: new Date("2026-08-10T12:00:00Z"), outcome: "order_placed", orderNumber: "ORD-1", durationSeconds: 90, language: "en", sentiment: "positive", upsellCents: 250 }),
        call({ id: "b", startedAt: new Date("2026-08-10T20:00:00Z"), outcome: "error", durationSeconds: 30, language: "it", sentiment: "negative" }),
        call({ id: "c", startedAt: new Date("2026-08-09T10:00:00Z"), outcome: "order_placed", orderNumber: "ORD-2", durationSeconds: 60, language: "en" }),
      ],
      orders: [
        { orderNumber: "ORD-1", total: 20, creditApplied: 5 },
        { orderNumber: "ORD-2", total: 10, creditApplied: 0 },
      ],
    });

    expect(result.calls).toBe(3);
    expect(result.durationSeconds).toBe(180);
    expect(result.staffHours).toBe(0.1); // 180s = 0.05h → 0.1 at 1dp
    expect(result.outcomes).toEqual({ order_placed: 2, error: 1 });
    expect(result.needsAttention).toBe(1);
    expect(result.afterHours).toBe(1); // only the 20:00 call
    expect(result.perDay).toEqual([
      { key: "2026-08-09", count: 1 },
      { key: "2026-08-10", count: 2 },
    ]);
    expect(result.perHour[12]).toBe(1);
    expect(result.perHour[20]).toBe(1);
    expect(result.perHour[10]).toBe(1);
    // 2026-08-09 is a Sunday, 2026-08-10 a Monday
    expect(result.perDow[0]).toBe(1);
    expect(result.perDow[1]).toBe(2);
    expect(result.languages).toEqual({ en: 2, it: 1 });
    expect(result.sentiments).toEqual({ positive: 1, negative: 1 });
    expect(result.ordersLinked).toBe(2);
    expect(result.revenue).toBe(25); // (20−5) + 10 — credit is a tender, not income
    expect(result.avgOrderValue).toBe(12.5);
    expect(result.upsellCents).toBe(250);
  });

  it("upsell revenue obeys the order-status filter (rejected order pays nothing)", () => {
    // The fetcher applies REPORT_ORDER_STATUS_WHERE, so a rejected/cancelled/
    // TEST- order simply never reaches `orders`. VoiceCall.upsellCents is
    // stamped once at hangup and never revisited, so the KPI must drop it too
    // — otherwise Overview shows Revenue $0 next to Upsell revenue $6.
    const result = computeVoiceAnalytics({
      timezone: "UTC",
      range: { from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-08-10T23:59:59Z") },
      hoursRows: [day(1, "09:00", "17:00")],
      calls: [
        call({ id: "live", orderNumber: "ORD-1", outcome: "order_placed", upsellCents: 250 }),
        // Kitchen rejected this one after the intelligence pass ran.
        call({ id: "dead", orderNumber: "ORD-DEAD", outcome: "order_placed", upsellCents: 600 }),
        // Defensive: a stamp with no linked order at all.
        call({ id: "orphan", orderNumber: null, upsellCents: 900 }),
      ],
      orders: [{ orderNumber: "ORD-1", total: 20, creditApplied: 0 }],
    });

    expect(result.upsellCents).toBe(250);
    expect(result.ordersLinked).toBe(1);
    expect(result.revenue).toBe(20);
    expect(result.calls).toBe(3); // the dead call still counts as a CALL
  });

  it("empty range → all zeros, no NaN", () => {
    const result = computeVoiceAnalytics({
      timezone: "UTC",
      range: { from: new Date("2026-08-10T00:00:00Z"), to: new Date("2026-08-10T23:59:59Z") },
      hoursRows: [],
      calls: [],
      orders: [],
    });
    expect(result.calls).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.avgOrderValue).toBe(0);
    expect(result.staffHours).toBe(0);
    expect(result.perDay).toEqual([{ key: "2026-08-10", count: 0 }]);
  });
});
