// Shared reservation validator — runs identically on client (instant feedback)
// and server (authoritative enforcement). Pure function, no DB access.

import { parseLocalDateTimeInTz } from "./restaurant-hours";

export interface ReservationSettingsLike {
  minNoticeHours: number;
  /** Newer, finer-grained notice rule (preferred). Stored on the
   *  ReservationSettings row alongside minNoticeHours. Schema-level
   *  field; the validator and the customer-side picker now prefer
   *  this when present. Falls back to minNoticeHours * 60 for legacy
   *  rows. Luigi audit 2026-06-01 — picker needs minutes-granular
   *  cutoff to hide past slots without lopping off an extra hour. */
  minNoticeMinutes?: number;
  maxAdvanceDays: number;
  slotLengthMinutes: number;
  maxPerSlot: number;
  minGuests: number;
  maxGuests: number;
  autoConfirm: boolean;
  allowPreOrder: boolean;
  holdMinutes: number;
  requireDeposit: boolean;
  depositAmount: number;
  cancellationPolicy?: string;
  reservationHours: string;       // JSON: { "0": { open: "10:00", close: "22:00", enabled: true }, … }
  blackoutDates: string;          // JSON: ["YYYY-MM-DD", …]
}

export interface BookingProposal {
  date: string;       // "YYYY-MM-DD"
  time: string;       // "HH:MM"
  partySize: number;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function validateBooking(
  s: ReservationSettingsLike,
  proposal: BookingProposal,
  now: Date,
  /** Restaurant's IANA timezone. When provided, the proposal's
   *  date+time string is interpreted as wall-clock time IN THE
   *  RESTAURANT'S TIMEZONE, not the server's. Without this, the
   *  server (running in UTC on Vercel) interprets the input as
   *  UTC — so a customer booking at 6 PM Toronto time (= 22 UTC)
   *  has their proposal parsed as 18 UTC = 14 EST, which then
   *  fails the "minimum N hours notice" rule incorrectly.
   *  Luigi bug 2026-06-01: "trying to book and its more than 2
   *  hours in advance but still not working". */
  timezone?: string,
): ValidationResult {
  const { date, time, partySize } = proposal;

  // 1. Party size
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, reason: "Please choose a party size." };
  }
  if (partySize < s.minGuests) {
    return { ok: false, reason: `Minimum party size is ${s.minGuests}.` };
  }
  if (partySize > s.maxGuests) {
    return { ok: false, reason: `Maximum party size is ${s.maxGuests}. For larger groups, please call us.` };
  }

  // 2. Date / time well-formed
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: "Please pick a valid date." };
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, reason: "Please pick a valid time." };
  }

  // Build the real-world UTC instant that corresponds to (date, time)
  // in the restaurant's local timezone. parseLocalDateTimeInTz does the
  // DST-aware projection. Without a timezone we fall back to the legacy
  // "trust the server's wall clock" path — fine for local dev where
  // server tz == restaurant tz, broken on Vercel UTC.
  const [hh, mm] = time.split(":").map(Number);
  const reservationAt = parseLocalDateTimeInTz(date, hh ?? 0, mm ?? 0, timezone);
  if (Number.isNaN(reservationAt.getTime())) {
    return { ok: false, reason: "Please pick a valid date and time." };
  }

  // 3. Minimum notice. Prefer minNoticeMinutes when present; fall back
  //    to minNoticeHours * 60 for legacy rows. Same precedence the
  //    customer-side picker uses to filter past slots.
  const minNoticeMinutes =
    typeof s.minNoticeMinutes === "number"
      ? s.minNoticeMinutes
      : (s.minNoticeHours ?? 0) * 60;
  const minutesAhead = (reservationAt.getTime() - now.getTime()) / 60000;
  if (minutesAhead < minNoticeMinutes) {
    const friendlyHours = Math.ceil(minNoticeMinutes / 60);
    const noticeLabel =
      minNoticeMinutes < 60
        ? `${minNoticeMinutes} minute${minNoticeMinutes === 1 ? "" : "s"}`
        : `${friendlyHours} hour${friendlyHours === 1 ? "" : "s"}`;
    return { ok: false, reason: `Please book at least ${noticeLabel} in advance.` };
  }

  // 4. Maximum advance
  const daysAhead = minutesAhead / 60 / 24;
  if (daysAhead > s.maxAdvanceDays) {
    return { ok: false, reason: `We only accept reservations up to ${s.maxAdvanceDays} days ahead.` };
  }

  // 5. Blackout dates
  let blackouts: string[] = [];
  try { blackouts = JSON.parse(s.blackoutDates || "[]"); } catch { blackouts = []; }
  if (blackouts.includes(date)) {
    return { ok: false, reason: "We're not accepting reservations on this date." };
  }

  // 6. Reservation hours for this day of week
  let hoursMap: Record<string, { open: string; close: string; enabled: boolean }> = {};
  try { hoursMap = JSON.parse(s.reservationHours || "{}"); } catch { hoursMap = {}; }
  // Day-of-week of the restaurant-local calendar date. Derive it from the
  // `date` string (a plain calendar date) via noon-UTC so it's timezone-
  // independent. Previously this used reservationAt.getDay(), which reads
  // the SERVER's (UTC) day-of-week — a Friday 11 PM Toronto booking is
  // Saturday 04:00 UTC, so it was validated against Saturday's hours.
  // (Phase 2 timezone sweep.)
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sun
  const day = hoursMap[String(dayOfWeek)];
  if (day && day.enabled === false) {
    return { ok: false, reason: "We don't take reservations on this day." };
  }
  if (day && day.open && day.close) {
    const openMin = parseTimeToMinutes(day.open);
    const closeMin = parseTimeToMinutes(day.close);
    const reqMin = parseTimeToMinutes(time);
    if (reqMin < openMin || reqMin > closeMin) {
      return { ok: false, reason: `On this day we take reservations between ${day.open} and ${day.close}.` };
    }
  }

  return { ok: true };
}
