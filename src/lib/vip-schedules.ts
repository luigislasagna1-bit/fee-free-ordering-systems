/**
 * Pure scheduling math for the VIP recurring scheduler (Program 2, 2026-06-27).
 *
 * No prisma here — just timezone-aware date arithmetic — so it's unit-testable in
 * isolation. The cron (src/app/api/cron/vip-schedules/route.ts) owns the DB.
 *
 * `computeNextRun` returns the next fire instant (a UTC Date) STRICTLY AFTER the
 * given `after` instant, honouring the cadence + the restaurant's local timezone
 * (so 09:00 means 09:00 where the restaurant is, across DST). `periodKeyFor`
 * returns the dedup bucket a fire belongs to (the backbone of the once-per-period
 * idempotency guard).
 */
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";

export type Cadence = "once" | "daily" | "weekly" | "monthly";

export interface ScheduleShape {
  cadence: Cadence;
  dayOfWeek?: number | null; // 0=Sun … 6=Sat (weekly)
  dayOfMonth?: number | null; // 1–31 (monthly; clamped to month length)
  sendHour?: string | null; // "HH:mm" in the restaurant's tz
  startDate: string; // "YYYY-MM-DD" in the restaurant's tz
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse "HH:mm" → [hh, mm], defaulting to 09:00 on anything malformed. */
export function parseSendHour(sendHour?: string | null): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((sendHour ?? "").trim());
  if (!m) return [9, 0];
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return [hh, mm];
}

/** Calendar-only date math (no tz) — safe because YYYY-MM-DD is a pure calendar
 *  date; the tz is applied later when we turn a date+time into an instant. */
function addDaysToKey(key: string, n: number): string {
  const [y, mo, d] = key.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function dowOfKey(key: string): number {
  const [y, mo, d] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
function daysInMonthOfKey(key: string): number {
  const [y, mo] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function domOfKey(key: string): number {
  return parseInt(key.split("-")[2], 10);
}

/** Does the local date `key` match this schedule's cadence-day rule? */
function dateMatches(s: ScheduleShape, key: string): boolean {
  switch (s.cadence) {
    case "daily":
      return true;
    case "weekly":
      return dowOfKey(key) === (s.dayOfWeek ?? 0);
    case "monthly": {
      // Clamp the requested day-of-month to the month's length so "31" still
      // fires on the 30th/28th in shorter months. Luigi 2026-06-27.
      const want = Math.min(Math.max(1, s.dayOfMonth ?? 1), daysInMonthOfKey(key));
      return domOfKey(key) === want;
    }
    default:
      return false;
  }
}

/**
 * The next fire instant strictly after `after`, or null if there is none
 * (a "once" schedule whose single fire is already in the past). Timezone-aware.
 */
export function computeNextRun(s: ScheduleShape, after: Date, timezone?: string): Date | null {
  const [hh, mm] = parseSendHour(s.sendHour);
  const tz = timezone || undefined;

  if (s.cadence === "once") {
    const inst = parseLocalDateTimeInTz(s.startDate, hh, mm, tz);
    return inst.getTime() > after.getTime() ? inst : null;
  }

  // Recurring: walk candidate local dates from max(startDate, today-in-tz)
  // forward until we hit one that matches the cadence AND whose fire instant is
  // strictly after `after`. Bounded so a misconfiguration can never loop forever.
  const afterKey = tz ? dateKeyInTimezone(after, tz) : isoKeyLocal(after);
  let key = s.startDate > afterKey ? s.startDate : afterKey;
  for (let i = 0; i < 800; i++) {
    if (dateMatches(s, key)) {
      const inst = parseLocalDateTimeInTz(key, hh, mm, tz);
      if (inst.getTime() > after.getTime()) return inst;
    }
    key = addDaysToKey(key, 1);
  }
  return null;
}

/** Fallback date-key when no tz is configured (wall-clock). */
function isoKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The dedup bucket a fire at instant `at` belongs to. One grant per
 * (schedule, periodKey, recipient) — so two cron ticks in the same bucket never
 * double-grant. Monthly buckets by "YYYY-MM"; daily/weekly by the local date;
 * "once" is a single bucket.
 */
export function periodKeyFor(cadence: Cadence, at: Date, timezone?: string): string {
  if (cadence === "once") return "once";
  const key = timezone ? dateKeyInTimezone(at, timezone) : isoKeyLocal(at);
  if (cadence === "monthly") return key.slice(0, 7); // YYYY-MM
  return key; // YYYY-MM-DD (daily, weekly)
}
