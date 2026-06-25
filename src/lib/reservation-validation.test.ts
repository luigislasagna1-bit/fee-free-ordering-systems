import { describe, it, expect } from "vitest";
import { validateBooking, resolveDayHours, resolveReservationIntervals } from "@/lib/reservation-validation";
import { pickHoursForService } from "@/lib/service-hours";
import { rowIntervals } from "@/lib/restaurant-hours";

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

describe("resolveReservationIntervals (split reservation hours)", () => {
  const date = "2026-06-18";
  const dow = dowOf(date);
  it("returns 2+ windows from the reservation OpeningHours row", () => {
    const oh = [{ dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: "reservation",
      intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] }];
    expect(resolveReservationIntervals(oh, date)).toEqual([
      { open: "12:00", close: "15:00", closesNextDay: false },
      { open: "18:00", close: "23:00", closesNextDay: false },
    ]);
  });
  it("returns [] for a single-window reservation row (legacy path handles it)", () => {
    expect(resolveReservationIntervals([{ dayOfWeek: dow, isOpen: true, openTime: "10:00", closeTime: "22:00", service: "reservation" }], date)).toEqual([]);
  });
  it("does NOT use a general-row split — reservations need an explicit reservation row", () => {
    const oh = [{ dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: null,
      intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] }];
    expect(resolveReservationIntervals(oh, date)).toEqual([]);
  });
  it("a reservation-scoped single window overrides a general split (no split enforced)", () => {
    const oh = [
      { dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: null, intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] },
      { dayOfWeek: dow, isOpen: true, openTime: "17:00", closeTime: "23:00", service: "reservation" },
    ];
    expect(resolveReservationIntervals(oh, date)).toEqual([]);
  });
});

// Client/server parity: the customer slot picker (ReservationModal) and the
// server validator must resolve the day's SPLIT windows from the SAME source, or
// the picker offers/hides slots the server doesn't enforce. The fix makes the
// picker call resolveReservationIntervals directly (the exact function the route
// feeds to validateBooking). `legacyPickerSplit` reproduces the OLD picker
// derivation — pickHoursForService(..., "reservation"), which FALLS BACK to the
// default (service=null) row — to pin exactly where the two used to diverge.
describe("split reservation hours — picker source agrees with the server validator", () => {
  const date = "2026-06-18";
  const dow = dowOf(date);
  const legacyPickerSplit = (oh: Parameters<typeof resolveReservationIntervals>[0]) => {
    const row = pickHoursForService(oh as never, dow, "reservation");
    const ivs = rowIntervals(row as never);
    return ivs.length > 1 ? ivs : [];
  };

  it("(1) reservation-row split: picker and server agree on both windows", () => {
    const oh = [{ dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: "reservation",
      intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] }];
    expect(resolveReservationIntervals(oh, date)).toHaveLength(2);
    expect(legacyPickerSplit(oh)).toEqual(resolveReservationIntervals(oh, date));
  });

  it("(2) general-row split + NO reservation row: agree on [] — the divergence the fix removes", () => {
    const oh = [{ dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: null,
      intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] }];
    // Server — and the FIXED picker, which now calls it — enforce no split.
    expect(resolveReservationIntervals(oh, date)).toEqual([]);
    // OLD picker gated on the general lunch/dinner split the server never
    // enforced: the exact client/server mismatch this change eliminates.
    expect(legacyPickerSplit(oh)).toHaveLength(2);
    expect(legacyPickerSplit(oh)).not.toEqual(resolveReservationIntervals(oh, date));
  });

  it("(3) reservation-row single + general split: both ignore the general split", () => {
    const oh = [
      { dayOfWeek: dow, isOpen: true, openTime: "12:00", closeTime: "23:00", service: null, intervals: [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }] },
      { dayOfWeek: dow, isOpen: true, openTime: "17:00", closeTime: "23:00", service: "reservation" },
    ];
    expect(resolveReservationIntervals(oh, date)).toEqual([]);
    expect(legacyPickerSplit(oh)).toEqual(resolveReservationIntervals(oh, date));
  });
});

describe("validateBooking — split reservation hours", () => {
  const now = new Date("2026-06-16T12:00:00Z");
  const date = "2026-06-18";
  const dow = dowOf(date);
  const split = [{ open: "12:00", close: "15:00" }, { open: "18:00", close: "23:00" }];
  // settingsForDay sets legacy reservationHours = 10:00–22:00, which would accept
  // 16:00 — proving split overrides the legacy window.
  const s = settingsForDay(dow);
  it("accepts a time inside the lunch window", () => {
    expect(validateBooking(s, { date, time: "13:00", partySize: 4 }, now, "UTC", null, split).ok).toBe(true);
  });
  it("accepts a time inside the dinner window", () => {
    expect(validateBooking(s, { date, time: "19:00", partySize: 4 }, now, "UTC", null, split).ok).toBe(true);
  });
  it("REJECTS a time in the lunch/dinner gap — even though legacy hours would allow it", () => {
    expect(validateBooking(s, { date, time: "16:00", partySize: 4 }, now, "UTC", null, split).ok).toBe(false);
  });
  it("rejects a time before the first window", () => {
    expect(validateBooking(s, { date, time: "11:00", partySize: 4 }, now, "UTC", null, split).ok).toBe(false);
  });
  it("single-window behaviour is unchanged when no split intervals are passed", () => {
    expect(validateBooking(s, { date, time: "16:00", partySize: 4 }, now, "UTC").ok).toBe(true);
  });
});
