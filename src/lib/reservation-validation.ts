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

/**
 * Resolve a day's EFFECTIVE reservation open/close — the same fallback chain the
 * customer-side slot picker uses: an explicit reservationHours row for the day,
 * otherwise the restaurant's opening hours (preferring a "reservation"-scoped
 * row, else the default row). Returns null when nothing is configured. Pass the
 * result to validateBooking's effectiveDayHours so a cross-midnight close
 * (e.g. 04:00) is honoured even with empty reservationHours. Luigi 2026-06-08.
 */
export function resolveDayHours(
  reservationHoursJson: string | null | undefined,
  openingHours: Array<{ dayOfWeek: number; openTime?: string | null; closeTime?: string | null; service?: string | null }>,
  date: string,
): { open: string; close: string } | null {
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  let map: Record<string, { open?: string; close?: string }> = {};
  try { map = JSON.parse(reservationHoursJson || "{}"); } catch { map = {}; }
  const explicit = map[String(dayOfWeek)];
  if (explicit && explicit.open && explicit.close) {
    return { open: explicit.open, close: explicit.close };
  }
  const resRow = openingHours.find((h) => h.dayOfWeek === dayOfWeek && h.service === "reservation");
  const defRow = openingHours.find((h) => h.dayOfWeek === dayOfWeek && (h.service == null || h.service === ""));
  const row = resRow ?? defRow;
  if (row && row.openTime && row.closeTime) {
    return { open: row.openTime, close: row.closeTime };
  }
  return null;
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
  /** The day's EFFECTIVE open/close ("HH:MM"), used only when this restaurant
   *  has no reservation-specific hours row for the day and instead relies on
   *  its regular opening hours (the same fallback the slot picker uses). Lets
   *  the cross-midnight detection below recognise a 1 AM slot as a post-
   *  midnight (next-day) booking even with empty reservationHours. Pass null /
   *  omit when there's no fallback. Luigi 2026-06-08. */
  effectiveDayHours?: { open: string; close: string } | null,
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

  // Reservation hours for this day of week — loaded up-front because we need
  // the day's open/close to detect a cross-midnight service window (below).
  // Day-of-week from the calendar `date` via noon-UTC so it's timezone-
  // independent. Previously a reservationAt.getDay() here read the SERVER's
  // (UTC) day-of-week. (Phase 2 timezone sweep.) 0 = Sun.
  let hoursMap: Record<string, { open: string; close: string; enabled: boolean }> = {};
  try { hoursMap = JSON.parse(s.reservationHours || "{}"); } catch { hoursMap = {}; }
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const day = hoursMap[String(dayOfWeek)];

  // Cross-midnight service. When a day's window closes at/after midnight
  // (close <= open, e.g. 11:00 → 04:00), a requested time in the post-midnight
  // portion (BEFORE open, like 00:30) belongs to that SAME service day but
  // lands on the next CALENDAR day. The picker generates those slots under the
  // chosen ("service") date, so the real-world instant is one day later.
  // Without this, a 12:30 AM booking made at 10 PM looked ~22 h in the PAST and
  // was rejected as "book at least 2 hours in advance" — and the picker showed
  // no late-night slots at all. Luigi 2026-06-08 (restaurant open until 4 AM).
  // Effective open/close for the cross-midnight check: an explicit
  // reservationHours row wins; otherwise the caller's fallback (the restaurant's
  // opening hours for that day — the SAME source the slot picker uses). This is
  // what lets the validator know a restaurant "closes at 04:00" when it has no
  // reservation-specific hours, so a 1 AM slot isn't mistaken for the PAST.
  // (The in-hours window check in step 6 stays gated on the reservationHours
  // row only, so this never adds a new out-of-hours rejection.) Luigi 2026-06-08.
  const effOpen = day && day.open ? day.open : (effectiveDayHours?.open ?? null);
  const effClose = day && day.close ? day.close : (effectiveDayHours?.close ?? null);
  const reqMin = parseTimeToMinutes(time);
  const openMin = effOpen !== null ? parseTimeToMinutes(effOpen) : null;
  const closeMin = effClose !== null ? parseTimeToMinutes(effClose) : null;
  const crossesMidnight = openMin !== null && closeMin !== null && closeMin <= openMin;
  const wrapsToNextDay = crossesMidnight && openMin !== null && reqMin < openMin;

  // Build the real-world UTC instant that corresponds to (date, time) in the
  // restaurant's local timezone. parseLocalDateTimeInTz does the DST-aware
  // projection. Without a timezone we fall back to the server wall clock —
  // fine for local dev (server tz == restaurant tz), broken on Vercel UTC.
  const [hh, mm] = time.split(":").map(Number);
  let reservationAt = parseLocalDateTimeInTz(date, hh ?? 0, mm ?? 0, timezone);
  if (Number.isNaN(reservationAt.getTime())) {
    return { ok: false, reason: "Please pick a valid date and time." };
  }
  if (wrapsToNextDay) {
    reservationAt = new Date(reservationAt.getTime() + 24 * 60 * 60 * 1000);
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

  // 6. Within the day's reservation window (cross-midnight aware).
  if (day && day.enabled === false) {
    return { ok: false, reason: "We don't take reservations on this day." };
  }
  if (day && openMin !== null && closeMin !== null) {
    const withinWindow = crossesMidnight
      ? (reqMin >= openMin || reqMin <= closeMin)   // 11:00 → 04:00 wraps midnight
      : (reqMin >= openMin && reqMin <= closeMin);  // same-day window
    if (!withinWindow) {
      return { ok: false, reason: `On this day we take reservations between ${day.open} and ${day.close}.` };
    }
  }

  return { ok: true };
}
