import { describe, it, expect } from "vitest";
import { isWithinUsableWindow, promoUsableNow, nextUsableSlot } from "@/lib/promo-window";

describe("isWithinUsableWindow — happy-hour day + hour math", () => {
  it("treats no restriction as always usable", () => {
    expect(isWithinUsableWindow({}, 2, 600)).toBe(true);
  });
  it("honours the day-of-week list", () => {
    expect(isWithinUsableWindow({ daysOfWeek: "[2,4]" }, 2, 600)).toBe(true);
    expect(isWithinUsableWindow({ daysOfWeek: "[2,4]" }, 3, 600)).toBe(false);
  });
  it("treats an empty day list as EVERY day, not never", () => {
    expect(isWithinUsableWindow({ daysOfWeek: "[]" }, 3, 600)).toBe(true);
  });
  it("honours an hour window (minutes of day)", () => {
    const w = { usableHourStart: 540, usableHourEnd: 660 }; // 09:00–11:00
    expect(isWithinUsableWindow(w, 2, 600)).toBe(true); // 10:00
    expect(isWithinUsableWindow(w, 2, 700)).toBe(false); // 11:40
  });
  it("wraps an overnight window past midnight", () => {
    const w = { usableHourStart: 1380, usableHourEnd: 240 }; // 23:00–04:00
    expect(isWithinUsableWindow(w, 2, 1400)).toBe(true); // 23:20
    expect(isWithinUsableWindow(w, 2, 120)).toBe(true); // 02:00
    expect(isWithinUsableWindow(w, 2, 720)).toBe(false); // noon
  });
});

describe("promoUsableNow — reads the scheduled wall-clock directly", () => {
  it("matches the scheduled day + time against the window", () => {
    const dow = new Date(Date.UTC(2026, 5, 16)).getUTCDay();
    const promo = { daysOfWeek: JSON.stringify([dow]), usableHourStart: 600, usableHourEnd: 720 }; // 10:00–12:00
    expect(promoUsableNow(promo, { scheduledFor: "2026-06-16T10:30" })).toBe(true);
    expect(promoUsableNow(promo, { scheduledFor: "2026-06-16T13:00" })).toBe(false); // outside hours
    const otherDay = { daysOfWeek: JSON.stringify([(dow + 1) % 7]), usableHourStart: 600, usableHourEnd: 720 };
    expect(promoUsableNow(otherDay, { scheduledFor: "2026-06-16T10:30" })).toBe(false); // wrong day
  });
});

describe("nextUsableSlot — schedule-for-later target", () => {
  it("returns null when there's no hour window to schedule around", () => {
    expect(nextUsableSlot({ daysOfWeek: "[2]" }, "UTC")).toBe(null);
  });
  it("returns the window-opening wall-clock when not usable yet", () => {
    const now = new Date("2026-06-16T08:00:00Z"); // 08:00 UTC, window opens 10:00
    expect(nextUsableSlot({ usableHourStart: 600 }, "UTC", now)).toBe("2026-06-16T10:00");
  });
});
