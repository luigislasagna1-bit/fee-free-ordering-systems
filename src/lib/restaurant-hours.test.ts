import { describe, it, expect } from "vitest";
import {
  formatHour,
  localDowAndHHMM,
  statusForToday,
  liveOpenStatus,
  parseLocalDateTimeInTz,
  dateKeyInTimezone,
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
