import { describe, it, expect } from "vitest";
import {
  formatHour,
  localDowAndHHMM,
  statusForToday,
  liveOpenStatus,
  parseLocalDateTimeInTz,
  dateKeyInTimezone,
  rowIntervals,
  parseIntervals,
  nextOpenAt,
} from "@/lib/restaurant-hours";

describe("formatHour", () => {
  it("renders 24h and 12h, robust to garbage", () => {
    expect(formatHour("17:00", "24h")).toBe("17:00");
    expect(formatHour("17:00", "12h")).toBe("5:00 PM");
    expect(formatHour("00:30", "12h")).toBe("12:30 AM");
    expect(formatHour("", "12h")).toBe("");
    expect(formatHour("garbage", "12h")).toBe("garbage");
  });
});

describe("parseLocalDateTimeInTz + dateKeyInTimezone", () => {
  it("computes the UTC instant for a wall-clock time", () => {
    expect(parseLocalDateTimeInTz("2026-06-18", 14, 30, "UTC").toISOString()).toBe("2026-06-18T14:30:00.000Z");
  });
  it("derives the local calendar date in a timezone", () => {
    expect(dateKeyInTimezone(new Date("2026-06-18T02:00:00Z"), "America/New_York")).toBe("2026-06-17");
    expect(dateKeyInTimezone(new Date("2026-06-18T12:00:00Z"), "UTC")).toBe("2026-06-18");
  });
});

describe("liveOpenStatus — the open/closed engine", () => {
  const todayRow = (now: Date, openTime: string, closeTime: string, closesNextDay = false) => [
    { dayOfWeek: localDowAndHHMM(now, "UTC").dow, isOpen: true, openTime, closeTime, closesNextDay, service: null },
  ];

  it("is open inside a same-day window", () => {
    const now = new Date("2026-06-18T15:00:00Z");
    expect(liveOpenStatus(todayRow(now, "10:00", "22:00"), now, "24h", undefined, "UTC").kind).toBe("open");
  });
  it("reports opens_at before the window and closed_today after", () => {
    const early = new Date("2026-06-18T08:00:00Z");
    const late = new Date("2026-06-18T23:00:00Z");
    expect(liveOpenStatus(todayRow(early, "10:00", "22:00"), early, "24h", undefined, "UTC").kind).toBe("opens_at");
    expect(liveOpenStatus(todayRow(late, "10:00", "22:00"), late, "24h", undefined, "UTC").kind).toBe("closed_today");
  });
  it("stays open after midnight inside yesterday's overnight window (the EST bug)", () => {
    const now = new Date("2026-06-18T01:30:00Z");
    const yesterdayDow = (localDowAndHHMM(now, "UTC").dow + 6) % 7;
    const sched = [{ dayOfWeek: yesterdayDow, isOpen: true, openTime: "17:00", closeTime: "02:00", closesNextDay: true, service: null }];
    const r = liveOpenStatus(sched, now, "24h", undefined, "UTC");
    expect(r.kind).toBe("open");
    if (r.kind === "open") expect(r.spansMidnight).toBe(true);
  });
  it("short-circuits to holiday when closed for a special day", () => {
    expect(liveOpenStatus([], new Date("2026-06-18T15:00:00Z"), "24h", { name: "Christmas" }, "UTC").kind).toBe("holiday");
  });
});

describe("statusForToday", () => {
  it("renders an open range on an open day", () => {
    const now = new Date("2026-06-18T15:00:00Z");
    const dow = localDowAndHHMM(now, "UTC").dow;
    const r = statusForToday([{ dayOfWeek: dow, isOpen: true, openTime: "10:00", closeTime: "22:00", service: null }], now, "24h", undefined, "UTC");
    expect(r.isOpen).toBe(true);
    expect(r.openRange).toBe("10:00 – 22:00");
  });
  it("is closed on a holiday", () => {
    const r = statusForToday([], new Date(), "24h", { name: "Christmas" }, "UTC");
    expect(r.isOpen).toBe(false);
    expect(r.holidayName).toBe("Christmas");
  });
});

describe("split hours (multiple intervals per day)", () => {
  // 2026-06-18 is a Thursday in UTC.
  const thuDow = localDowAndHHMM(new Date("2026-06-18T12:00:00Z"), "UTC").dow;
  const thu = (intervals: unknown, extra: Record<string, unknown> = {}) => [
    { dayOfWeek: thuDow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: null, intervals, ...extra },
  ];

  describe("rowIntervals — the back-compat shim", () => {
    it("legacy single window → one interval", () => {
      expect(rowIntervals({ dayOfWeek: 0, isOpen: true, openTime: "10:00", closeTime: "22:00" }))
        .toEqual([{ open: "10:00", close: "22:00", closesNextDay: false }]);
    });
    it("closed row → []", () => {
      expect(rowIntervals({ dayOfWeek: 0, isOpen: false, openTime: "10:00", closeTime: "22:00" })).toEqual([]);
    });
    it("legacy overnight auto-fixes closesNextDay", () => {
      expect(rowIntervals({ dayOfWeek: 0, isOpen: true, openTime: "17:00", closeTime: "02:00" }))
        .toEqual([{ open: "17:00", close: "02:00", closesNextDay: true }]);
    });
    it("intervals JSON replaces the legacy window, sorted, garbage dropped", () => {
      expect(rowIntervals({
        dayOfWeek: 0, isOpen: true, openTime: "12:00", closeTime: "23:00",
        intervals: [{ open: "18:00", close: "23:00" }, { open: "12:00", close: "15:00" }, { open: "x", close: "y" }],
      })).toEqual([
        { open: "12:00", close: "15:00", closesNextDay: false },
        { open: "18:00", close: "23:00", closesNextDay: false },
      ]);
    });
    it("parseIntervals accepts a JSON string and fails safe", () => {
      expect(parseIntervals('[{"open":"09:00","close":"13:00"}]')).toEqual([{ open: "09:00", close: "13:00", closesNextDay: false }]);
      expect(parseIntervals("not json")).toEqual([]);
      expect(parseIntervals(null)).toEqual([]);
    });
  });

  const lunchDinner = thu([{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }]);

  it("open during lunch, closes at 15:00", () => {
    const r = liveOpenStatus(lunchDinner, new Date("2026-06-18T13:00:00Z"), "24h", undefined, "UTC");
    expect(r.kind).toBe("open");
    if (r.kind === "open") expect(r.closesAt).toBe("15:00");
  });
  it("closed during the lunch/dinner gap → opens_at the dinner window (the whole point)", () => {
    const r = liveOpenStatus(lunchDinner, new Date("2026-06-18T16:00:00Z"), "24h", undefined, "UTC");
    expect(r.kind).toBe("opens_at");
    if (r.kind === "opens_at") expect(r.opensAt).toBe("18:00");
  });
  it("open during dinner", () => {
    expect(liveOpenStatus(lunchDinner, new Date("2026-06-18T19:00:00Z"), "24h", undefined, "UTC").kind).toBe("open");
  });
  it("closed_today after the last window", () => {
    expect(liveOpenStatus(lunchDinner, new Date("2026-06-18T23:30:00Z"), "24h", undefined, "UTC").kind).toBe("closed_today");
  });
  it("opens_at the lunch window before noon", () => {
    const r = liveOpenStatus(lunchDinner, new Date("2026-06-18T09:00:00Z"), "24h", undefined, "UTC");
    expect(r.kind).toBe("opens_at");
    if (r.kind === "opens_at") expect(r.opensAt).toBe("12:00");
  });
  it("statusForToday renders both ranges as a comma list", () => {
    expect(statusForToday(lunchDinner, new Date("2026-06-18T13:00:00Z"), "24h", undefined, "UTC").openRange)
      .toBe("12:00 – 15:00, 18:00 – 23:00");
  });
  it("nextOpenAt in the gap returns TODAY's dinner reopening, not tomorrow", () => {
    expect(nextOpenAt(lunchDinner, new Date("2026-06-18T16:00:00Z"), "UTC")?.toISOString())
      .toBe("2026-06-18T18:00:00.000Z");
  });
  it("split + overnight dinner: open at 23:00 (spans midnight) and at 01:00 via yesterday", () => {
    const sched = thu([{ open: "12:00", close: "15:00" }, { open: "22:00", close: "02:00", closesNextDay: true }], { closeTime: "02:00" });
    const r23 = liveOpenStatus(sched, new Date("2026-06-18T23:00:00Z"), "24h", undefined, "UTC");
    expect(r23.kind).toBe("open");
    if (r23.kind === "open") expect(r23.spansMidnight).toBe(true);
    // 01:00 Friday is covered by Thursday's overnight interval.
    expect(liveOpenStatus(sched, new Date("2026-06-19T01:00:00Z"), "24h", undefined, "UTC").kind).toBe("open");
  });
});
