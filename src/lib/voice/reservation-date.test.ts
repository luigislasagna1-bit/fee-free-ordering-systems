/**
 * A6 / C15 — reservation date normalisation (services/nabil-voice/src/reservation-date.ts).
 * Calls cmt30v6di + cmt3n6ou8: `date:"today"` threw; 2025-01-01 was accepted.
 */
import { describe, expect, it } from "vitest";
import { normalizeReservationDate } from "../../../services/nabil-voice/src/reservation-date";

const TODAY = "2026-08-22"; // a Saturday

describe("normalizeReservationDate", () => {
  it("passes a valid future/today ISO date through", () => {
    expect(normalizeReservationDate("2026-08-22", TODAY)).toEqual({ ok: true, date: "2026-08-22" });
    expect(normalizeReservationDate("2026-09-01", TODAY)).toEqual({ ok: true, date: "2026-09-01" });
  });
  it("refuses a PAST date and echoes today", () => {
    expect(normalizeReservationDate("2025-01-01", TODAY)).toEqual({ ok: false, code: "date_in_past", today: TODAY });
    expect(normalizeReservationDate("2026-08-21", TODAY)).toEqual({ ok: false, code: "date_in_past", today: TODAY });
  });
  it("resolves relative words against the restaurant's local date", () => {
    expect(normalizeReservationDate("today", TODAY)).toEqual({ ok: true, date: "2026-08-22" });
    expect(normalizeReservationDate("Tonight", TODAY)).toEqual({ ok: true, date: "2026-08-22" });
    expect(normalizeReservationDate("tomorrow", TODAY)).toEqual({ ok: true, date: "2026-08-23" });
    expect(normalizeReservationDate("tomorrow evening", TODAY)).toEqual({ ok: true, date: "2026-08-23" });
    expect(normalizeReservationDate("day after tomorrow", TODAY)).toEqual({ ok: true, date: "2026-08-24" });
  });
  it("weekdays: the next occurrence (today counts; 'next' skips a same-day match)", () => {
    expect(normalizeReservationDate("friday", TODAY)).toEqual({ ok: true, date: "2026-08-28" });
    expect(normalizeReservationDate("saturday", TODAY)).toEqual({ ok: true, date: "2026-08-22" });
    expect(normalizeReservationDate("next saturday", TODAY)).toEqual({ ok: true, date: "2026-08-29" });
    expect(normalizeReservationDate("this sunday night", TODAY)).toEqual({ ok: true, date: "2026-08-23" });
  });
  it("month rollover is calendar-correct", () => {
    expect(normalizeReservationDate("tomorrow", "2026-08-31")).toEqual({ ok: true, date: "2026-09-01" });
    expect(normalizeReservationDate("tomorrow", "2026-12-31")).toEqual({ ok: true, date: "2027-01-01" });
  });
  it("garbage / impossible dates are unparseable (never thrown, never booked)", () => {
    expect(normalizeReservationDate("", TODAY)).toEqual({ ok: false, code: "date_unparseable", today: TODAY });
    expect(normalizeReservationDate("2026-02-30", TODAY)).toEqual({ ok: false, code: "date_unparseable", today: TODAY });
    expect(normalizeReservationDate("sometime", TODAY)).toEqual({ ok: false, code: "date_unparseable", today: TODAY });
    expect(normalizeReservationDate(undefined, TODAY)).toEqual({ ok: false, code: "date_unparseable", today: TODAY });
  });
  it("without a local date only ISO is accepted and nothing is judged past", () => {
    expect(normalizeReservationDate("today", null)).toEqual({ ok: false, code: "date_unparseable", today: null });
    expect(normalizeReservationDate("2020-01-01", null)).toEqual({ ok: true, date: "2020-01-01" });
  });
});
