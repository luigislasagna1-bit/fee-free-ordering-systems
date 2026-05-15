// Shared reservation validator — runs identically on client (instant feedback)
// and server (authoritative enforcement). Pure function, no DB access.

export interface ReservationSettingsLike {
  minNoticeHours: number;
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

  const reservationAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(reservationAt.getTime())) {
    return { ok: false, reason: "Please pick a valid date and time." };
  }

  // 3. Minimum notice
  const minutesAhead = (reservationAt.getTime() - now.getTime()) / 60000;
  if (minutesAhead < s.minNoticeHours * 60) {
    return { ok: false, reason: `Please book at least ${s.minNoticeHours} hour${s.minNoticeHours === 1 ? "" : "s"} in advance.` };
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
  const dayOfWeek = reservationAt.getDay(); // 0 = Sun
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
