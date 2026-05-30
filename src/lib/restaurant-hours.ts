/**
 * Shared helpers for "Open: 9:00 PM – 2:00 AM" / "Closed today" labels.
 *
 * Both the customer ordering header and the restaurant info page render
 * this same status — centralising the label here makes the translated
 * "Open"/"Closed" text consistent across surfaces.
 *
 * Overnight hours: a row with closesNextDay=true is interpreted as
 * "open from openTime today through closeTime TOMORROW". E.g.
 *   { dayOfWeek: 5, openTime: "17:00", closeTime: "02:00", closesNextDay: true }
 * means "Friday 5pm through Saturday 2am". The "open now" check looks
 * BOTH at today's row (am I past today's open time and before midnight,
 * with closesNextDay set?) AND at yesterday's row (was yesterday a
 * closesNextDay row and is the current time before yesterday's closeTime?).
 *
 * Holidays: caller passes in a Set of "YYYY-MM-DD" date strings (in the
 * restaurant's local timezone). If today matches, we short-circuit to
 * closed regardless of the weekly schedule.
 */

export interface OpeningHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  // Nullable to tolerate the schema's loose typing — older rows or
  // partially-saved drafts may have null times. The helper functions
  // short-circuit to "closed" when either time is missing.
  openTime: string | null;
  closeTime: string | null;
  closesNextDay?: boolean;
}

export interface HoursStatus {
  isOpen: boolean;
  /** "9:00 PM – 2:00 AM" when open, empty string when closed. */
  openRange: string;
  /** Optional reason for being closed today (e.g. "Christmas Day"). */
  holidayName?: string;
}

/**
 * Format an HH:MM string in the chosen 12h/24h convention. Stored data
 * is always 24h ("17:00"); this is purely a render-time transform.
 *
 * Robust to garbage input — returns the original string unchanged if
 * it doesn't match HH:MM. That way bad data never crashes the page.
 */
export function formatHour(hhmm: string | null | undefined, format: "12h" | "24h" = "24h"): string {
  if (!hhmm) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const mins = m[2];
  if (Number.isNaN(h) || h < 0 || h > 23) return hhmm;
  if (format === "24h") {
    return `${String(h).padStart(2, "0")}:${mins}`;
  }
  // 12h
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mins} ${suffix}`;
}

/**
 * Project a Date into a specific IANA timezone, returning the local
 * day-of-week (0=Sun) and HH:MM string. Both `liveOpenStatus` and
 * `statusForToday` need to compare "now" against HH:MM open/close
 * times that are stored in the restaurant's LOCAL time — using the
 * server's UTC wall clock breaks any restaurant whose timezone
 * differs from the server. Vercel runs in UTC; a restaurant in
 * EST (UTC-5) at 12:55 AM local sees the server compute 04:55 and
 * mis-flag an overnight window as closed.
 *
 * Falls back to the server's wall-clock values when timezone is
 * undefined or invalid (preserves pre-existing behavior).
 */
export function localDowAndHHMM(
  now: Date,
  timezone?: string,
): { dow: number; hhmm: string } {
  if (!timezone) {
    return {
      dow: now.getDay(),
      hhmm: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    };
  }
  try {
    // weekday=short maps to "Sun"|"Mon"|...|"Sat"; we translate to 0..6
    // so the rest of the file stays integer-keyed like Date.getDay().
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).formatToParts(now);
    const hr = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mn = parts.find((p) => p.type === "minute")?.value ?? "00";
    const wk = parts.find((p) => p.type === "weekday")?.value ?? "";
    const dowMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    // Intl can emit "24" for midnight in hour: "2-digit" hour12:false —
    // normalise to "00" so HH:MM comparisons work.
    const normHr = hr === "24" ? "00" : hr;
    return {
      dow: dowMap[wk] ?? now.getDay(),
      hhmm: `${normHr}:${mn}`,
    };
  } catch {
    return {
      dow: now.getDay(),
      hhmm: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    };
  }
}

/**
 * Get today's status. Used by the order page header.
 *
 * @param hours          full weekly schedule (7 rows max, may be partial)
 * @param now            optional override for the "current" time
 * @param format         "12h" or "24h" — affects how the openRange string renders
 * @param todayIsHoliday optional flag — if true, force closed with the supplied name
 * @param timezone       IANA tz of the restaurant (e.g. "America/Toronto").
 *                       When provided, dow + HH:MM are computed in that
 *                       zone instead of the server's UTC wall clock.
 */
export function statusForToday(
  hours: OpeningHoursRow[] | undefined | null,
  now: Date = new Date(),
  format: "12h" | "24h" = "24h",
  todayIsHoliday?: { name?: string },
  timezone?: string,
): HoursStatus {
  if (todayIsHoliday) {
    return { isOpen: false, openRange: "", holidayName: todayIsHoliday.name };
  }
  const { dow } = localDowAndHHMM(now, timezone);
  const row = (hours ?? []).find((h) => h.dayOfWeek === dow);
  if (!row || !row.isOpen) return { isOpen: false, openRange: "" };
  return {
    isOpen: true,
    openRange: `${formatHour(row.openTime, format)} – ${formatHour(row.closeTime, format)}${row.closesNextDay ? " (next day)" : ""}`,
  };
}

/**
 * Same data, finer-grained answer: is the restaurant LITERALLY open
 * right this second? Handles overnight rows by also consulting
 * yesterday's row to see if its closesNextDay window still covers now.
 *
 * Used by the hosted-site "Open now" badge and the order-page
 * "currently accepting orders" gate.
 *
 * Returns a tagged union so callers can render different copy for
 * "open" vs. "opens later today" vs. "closed today".
 */
export type LiveOpenStatus =
  | { kind: "open"; closesAt: string; spansMidnight: boolean }
  | { kind: "opens_at"; opensAt: string }
  | { kind: "closed_today" }
  | { kind: "holiday"; name?: string };

export function liveOpenStatus(
  hours: OpeningHoursRow[] | undefined | null,
  now: Date = new Date(),
  format: "12h" | "24h" = "24h",
  todayIsHoliday?: { name?: string },
  timezone?: string,
): LiveOpenStatus {
  if (todayIsHoliday) return { kind: "holiday", name: todayIsHoliday.name };
  // Day-of-week and HH:MM must be computed in the RESTAURANT's local
  // timezone. The server runs in UTC on Vercel; without this projection,
  // a Friday-overnight-into-Saturday-2am window misfires at 12:55 AM
  // EST because UTC sees 04:55 and concludes the overnight closed at 2.
  // Luigi bug 2026-05-30: "Opens at 11:00 AM" shown at 12:55 AM EST
  // while still inside the previous day's open window.
  const { dow, hhmm: nowHHMM } = localDowAndHHMM(now, timezone);
  const yesterdayDow = (dow + 6) % 7;
  const today = (hours ?? []).find((h) => h.dayOfWeek === dow);
  const yesterday = (hours ?? []).find((h) => h.dayOfWeek === yesterdayDow);

  // (1) Are we still inside yesterday's overnight window? E.g. it's now
  //     1:30am Saturday and Friday's row was open 5pm → 2am.
  if (
    yesterday &&
    yesterday.isOpen &&
    yesterday.closesNextDay &&
    yesterday.closeTime &&
    nowHHMM < yesterday.closeTime
  ) {
    return {
      kind: "open",
      closesAt: formatHour(yesterday.closeTime, format),
      spansMidnight: true,
    };
  }
  // (2) Normal in-day window. Open if now ∈ [openTime, closeTime). For
  //     overnight rows where closeTime < openTime, treat as open from
  //     openTime through midnight (the next-morning portion was handled
  //     in branch 1 via yesterday's row).
  if (today && today.isOpen && today.openTime && today.closeTime) {
    if (today.closesNextDay) {
      // Overnight row. Open if past openTime.
      if (nowHHMM >= today.openTime) {
        return {
          kind: "open",
          closesAt: formatHour(today.closeTime, format),
          spansMidnight: true,
        };
      }
      // Not yet at today's open time — restaurant opens LATER today.
      return { kind: "opens_at", opensAt: formatHour(today.openTime, format) };
    }
    // Same-day row.
    if (nowHHMM >= today.openTime && nowHHMM < today.closeTime) {
      return { kind: "open", closesAt: formatHour(today.closeTime, format), spansMidnight: false };
    }
    if (nowHHMM < today.openTime) {
      return { kind: "opens_at", opensAt: formatHour(today.openTime, format) };
    }
  }
  return { kind: "closed_today" };
}

/**
 * Convert a Date to a "YYYY-MM-DD" string in a specific IANA timezone.
 * Used to match a real-world calendar date to RestaurantHoliday rows
 * (which store dates as @db.Date — no timezone — and we resolve the
 * "today" date in the restaurant's local timezone before matching).
 *
 * en-CA locale produces ISO-style output by happy accident. We use
 * Intl.DateTimeFormat instead of Date.toLocaleDateString directly so
 * the timezone parameter is honored uniformly across runtimes.
 */
export function dateKeyInTimezone(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    // Fallback: pretend the input is already in the right zone.
    return date.toISOString().slice(0, 10);
  }
}
