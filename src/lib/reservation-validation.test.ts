import { describe, it, expect } from "vitest";
import { validateBooking, resolveDayHours } from "@/lib/reservation-validation";

// Day-of-week for a calendar date (noon-UTC, timezone-independent) so the test
// configures reservation hours for the right weekday.
const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function settingsForDay(dow: number, overrides: Record<string, unknown> = {}) {
  return {
    minNoticeHours: 2,
    maxAdvanceDays: 30,
    slotLengthMinutes: 60,
    maxPerSlot: 10,
    minGuests: 1,
    maxGuests: 8,
    autoConfirm: true,
    allowPreOrder: false,
    holdMinutes: 15,
    requireDeposit: false,
    depositAmount: 0,
    reservationHours: JSON.stringify({ [String(dow)]: { open: "10:00", close: "22:00", enabled: true } }),
    blackoutDates: "[]",
    ...overrides,
  } as Parameters<typeof validateBooking>[0];
}

describe("validateBooking", () => {
  const now = new Date("2026-06-16T12:00:00Z");
  const date = "2026-06-18"; // 2 days ahead
  const dow = dowOf(date);

  it("accepts a valid booking, well in advance and in hours", () => {
    expect(validateBooking(settingsForDay(dow), { date, time: "18:00", partySize: 4 }, now, "UTC").ok).toBe(true);
  });
  it("rejects party sizes below min / above max", () => {
    expect(validateBooking(settingsForDay(dow, { minGuests: 2 }), { date, time: "18:00", partySize: 1 }, now, "UTC").ok).toBe(false);
    expect(validateBooking(settingsForDay(dow), { date, time: "18:00", partySize: 20 }, now, "UTC").ok).toBe(false);
  });
  it("rejects malformed date or time", () => {
    expect(validateBooking(settingsForDay(dow), { date: "not-a-date", time: "18:00", partySize: 4 }, now, "UTC").ok).toBe(false);
    expect(validateBooking(settingsForDay(dow), { date, time: "9pm", partySize: 4 }, now, "UTC").ok).toBe(false);
  });
  it("enforces minimum notice using the restaurant timezone (the 2h bug)", () => {
    const soon = new Date("2026-06-16T17:30:00Z"); // only 30 min before an 18:00 booking
    const d = "2026-06-16";
    expect(validateBooking(settingsForDay(dowOf(d)), { date: d, time: "18:00", partySize: 4 }, soon, "UTC").ok).toBe(false);
  });
  it("rejects beyond the max-advance window", () => {
    expect(validateBooking(settingsForDay(dow, { maxAdvanceDays: 1 }), { date, time: "18:00", partySize: 4 }, now, "UTC").ok).toBe(false);
  });
  it("rejects a blackout date", () => {
    expect(validateBooking(settingsForDay(dow, { blackoutDates: JSON.stringify([date]) }), { date, time: "18:00", partySize: 4 }, now, "UTC").ok).toBe(false);
  });
  it("rejects a time outside the day's reservation window", () => {
    expect(validateBooking(settingsForDay(dow), { date, time: "23:30", partySize: 4 }, now, "UTC").ok).toBe(false);
  });
});

describe("resolveDayHours", () => {
  const date = "2026-06-18";
  const dow = dowOf(date);
  it("prefers an explicit reservationHours row", () => {
    expect(resolveDayHours(JSON.stringify({ [String(dow)]: { open: "11:00", close: "23:00" } }), [], date))
      .toEqual({ open: "11:00", close: "23:00" });
  });
  it("falls back to opening hours, preferring a reservation-scoped row", () => {
    const oh = [
      { dayOfWeek: dow, openTime: "09:00", closeTime: "21:00", service: null },
      { dayOfWeek: dow, openTime: "10:00", closeTime: "22:00", service: "reservation" },
    ];
    expect(resolveDayHours("{}", oh, date)).toEqual({ open: "10:00", close: "22:00" });
  });
  it("returns null when nothing is configured", () => {
    expect(resolveDayHours("{}", [], date)).toBe(null);
  });
});
