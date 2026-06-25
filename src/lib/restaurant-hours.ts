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

import { holidayEffectForDay } from "./holiday-rules";

/** One open window. `closesNextDay` means `close` falls on the FOLLOWING
 *  calendar day (overnight), e.g. { open:"22:00", close:"02:00", closesNextDay:true }.
 *  This is the unit of SPLIT HOURS — a day is an ARRAY of these. */
export interface HoursInterval {
  open: string;
  close: string;
  closesNextDay?: boolean;
}

export interface OpeningHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  // Nullable to tolerate the schema's loose typing — older rows or
  // partially-saved drafts may have null times. The helper functions
  // short-circuit to "closed" when either time is missing.
  openTime: string | null;
  closeTime: string | null;
  closesNextDay?: boolean;
  /** Per-service override scope (null = default kitchen hours).
   *  Added 2026-05-31 when per-service hours shipped. The day-status
   *  helpers below pick the default row over any service-scoped row
   *  for "is the kitchen open" answers — service-scoped rows are for
   *  the slot pickers in the corresponding flows (pickup / delivery /
   *  reservation), not for the global "open now" badge. */
  service?: string | null;
  /** Split hours (2026-06-24): when present + valid this REPLACES openTime/
   *  closeTime. Prisma `Json?` — may arrive as a parsed array OR a string.
   *  ALWAYS read it through rowIntervals(), never directly. */
  intervals?: unknown;
}

/**
 * Pick the row that authoritatively represents "is the kitchen open
 * for this day?" Prefers the default (service=null) row when one
 * exists, falls back to the first service-scoped row otherwise. Used
 * by both day-level and live status helpers so they don't accidentally
 * read a reservation- or delivery-scoped row as the global state.
 *
 * Luigi 2026-06-01: checkout was saying "We're closed" at 1:53 PM on
 * a day the kitchen was open because openingHours contained multiple
 * rows for the same day (default + reservation) and Array.find picked
 * a service row marked closed. This helper makes the choice explicit.
 */
function pickDayRow(
  rows: OpeningHoursRow[] | undefined | null,
  dow: number,
): OpeningHoursRow | undefined {
  const dayRows = (rows ?? []).filter((h) => h.dayOfWeek === dow);
  if (dayRows.length === 0) return undefined;
  // 1. Prefer the explicit default-scope row — it's the owner's
  //    answer for "is the kitchen open?"
  const defaultRow = dayRows.find((h) => h.service == null || h.service === "");
  if (defaultRow) return normalizeRow(defaultRow);
  // 2. No default exists (uncommon — usually means the owner only
  //    configured per-service hours and skipped the global default).
  //    In that case, the kitchen should be considered open if ANY
  //    service is open. Prefer an open service row over a closed one
  //    so a single reservation-closed Monday doesn't make the global
  //    status read "closed" while pickup is open. Luigi 2026-06-01.
  const openServiceRow = dayRows.find((h) => h.isOpen);
  if (openServiceRow) return normalizeRow(openServiceRow);
  // 3. Every service row says closed → return whichever; they agree.
  return normalizeRow(dayRows[0]);
}

/**
 * Defensive midnight-wrap auto-fix at READ time. If a row says
 * close <= open AND closesNextDay is false, the window is
 * mathematically impossible (close would happen 11+ hours BEFORE
 * open the same day). Owners typing "11 AM – 12 AM" in the picker
 * almost always mean "11 AM until midnight at the END of the day"
 * but the picker stored 12 AM as 00:00 (midnight at the START of
 * the day). We treat the row as if closesNextDay=true so the
 * window reads correctly — without forcing the owner to find the
 * checkbox and re-save.
 *
 * Same logic as src/lib/service-hours.ts pickHoursForService and
 * the /api/restaurants/hours auto-fix on write. This applies the
 * same correction to the global "are we open now" status path
 * which previously read the bad shape literally and concluded
 * "closed all day". Luigi 2026-06-01.
 */
function normalizeRow(row: OpeningHoursRow): OpeningHoursRow {
  if (!row.isOpen || !row.openTime || !row.closeTime) return row;
  if (row.closesNextDay) return row;
  if (row.closeTime <= row.openTime) {
    return { ...row, closesNextDay: true };
  }
  return row;
}

const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse a raw `intervals` value (Prisma Json — array or stringified array) into
 * validated, sorted HoursInterval[]. Read-time, fail-SAFE: garbage entries are
 * dropped, never crash. A window with close <= open is treated as overnight
 * (closesNextDay), matching the legacy normalizeRow auto-fix. Overlaps are NOT
 * rejected here (the SAVE endpoint does that) — at read time an overlap just
 * widens availability, which is the safe direction. Mirrors parseHolidayRules.
 */
export function parseIntervals(raw: unknown): HoursInterval[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try { arr = JSON.parse(t); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: HoursInterval[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const open = String((item as Record<string, unknown>).open ?? "");
    const close = String((item as Record<string, unknown>).close ?? "");
    if (!HHMM_RE.test(open) || !HHMM_RE.test(close) || open === close) continue;
    const closesNextDay = Boolean((item as Record<string, unknown>).closesNextDay) || close < open;
    out.push({ open, close, closesNextDay });
  }
  out.sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
  return out;
}

/**
 * The ONE seam that makes split hours back-compatible. Returns the day's open
 * windows as an array: the new `intervals` JSON when present + valid, else the
 * legacy single (openTime, closeTime) window synthesised into a one-element
 * array (with the same overnight auto-fix). Returns [] when the row is closed
 * or has no usable times. EVERY hours reader should go through this.
 */
export function rowIntervals(row: OpeningHoursRow | undefined | null): HoursInterval[] {
  if (!row || !row.isOpen) return [];
  const parsed = parseIntervals(row.intervals);
  if (parsed.length > 0) return parsed;
  if (!row.openTime || !row.closeTime) return [];
  const closesNextDay = Boolean(row.closesNextDay) || row.closeTime < row.openTime;
  return [{ open: row.openTime, close: row.closeTime, closesNextDay }];
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
  const row = pickDayRow(hours, dow);
  const ivs = rowIntervals(row);
  if (ivs.length === 0) return { isOpen: false, openRange: "" };
  // Split hours render as a comma list: "12:00 – 15:00, 18:00 – 23:00".
  return {
    isOpen: true,
    openRange: ivs
      .map((iv) => `${formatHour(iv.open, format)} – ${formatHour(iv.close, format)}${iv.closesNextDay ? " (next day)" : ""}`)
      .join(", "),
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

/**
 * The shared open/closed decision over a day's intervals (SPLIT HOURS aware).
 * Mirrors the single-window logic exactly when there's one interval, so legacy
 * behaviour is bit-for-bit preserved. Check order matches the old code:
 * yesterday's overnight window first, then today's intervals, then "opens later".
 */
function liveStatusFromIntervals(
  todayIvs: HoursInterval[],
  yestIvs: HoursInterval[],
  nowHHMM: string,
  format: "12h" | "24h",
): LiveOpenStatus {
  // (1) Still inside yesterday's overnight window? (e.g. 1:30am Sat, Fri 17:00→02:00)
  for (const iv of yestIvs) {
    if (iv.closesNextDay && nowHHMM < iv.close) {
      return { kind: "open", closesAt: formatHour(iv.close, format), spansMidnight: true };
    }
  }
  // (2) Inside one of today's windows? (intervals are pre-sorted by open)
  for (const iv of todayIvs) {
    if (iv.closesNextDay) {
      // Overnight window: open once past its open time; the after-midnight
      // portion is covered by branch (1) on the NEXT day.
      if (nowHHMM >= iv.open) {
        return { kind: "open", closesAt: formatHour(iv.close, format), spansMidnight: true };
      }
    } else if (nowHHMM >= iv.open && nowHHMM < iv.close) {
      return { kind: "open", closesAt: formatHour(iv.close, format), spansMidnight: false };
    }
  }
  // (3) Not open now — does a window open LATER today? (the next interval whose
  //     open is still ahead — naturally skips the lunch/dinner gap.)
  const upcoming = todayIvs.find((iv) => nowHHMM < iv.open);
  if (upcoming) return { kind: "opens_at", opensAt: formatHour(upcoming.open, format) };
  return { kind: "closed_today" };
}

export function liveOpenStatus(
  hours: OpeningHoursRow[] | undefined | null,
  now: Date = new Date(),
  format: "12h" | "24h" = "24h",
  todayIsHoliday?: { name?: string; intervals?: Array<{ open: string; close: string }> },
  timezone?: string,
): LiveOpenStatus {
  if (todayIsHoliday) {
    // Special day with CUSTOM hours (Gloriafood parity, Luigi 2026-06-11):
    // the holiday's intervals replace the weekly schedule for today. Inside
    // an interval → open; before a later interval → opens_at; past them all
    // → closed for the rest of the day. No intervals = classic full closure.
    const intervals = todayIsHoliday.intervals;
    if (intervals && intervals.length > 0) {
      const { hhmm } = localDowAndHHMM(now, timezone);
      const sorted = [...intervals].sort((a, b) => (a.open < b.open ? -1 : 1));
      for (const iv of sorted) {
        if (hhmm >= iv.open && hhmm < iv.close) {
          return { kind: "open", closesAt: formatHour(iv.close, format), spansMidnight: false };
        }
      }
      const upcoming = sorted.find((iv) => hhmm < iv.open);
      if (upcoming) return { kind: "opens_at", opensAt: formatHour(upcoming.open, format) };
      return { kind: "closed_today" };
    }
    return { kind: "holiday", name: todayIsHoliday.name };
  }
  // Day-of-week and HH:MM must be computed in the RESTAURANT's local
  // timezone. The server runs in UTC on Vercel; without this projection,
  // a Friday-overnight-into-Saturday-2am window misfires at 12:55 AM
  // EST because UTC sees 04:55 and concludes the overnight closed at 2.
  // Luigi bug 2026-05-30: "Opens at 11:00 AM" shown at 12:55 AM EST
  // while still inside the previous day's open window.
  const { dow, hhmm: nowHHMM } = localDowAndHHMM(now, timezone);
  const yesterdayDow = (dow + 6) % 7;
  const today = pickDayRow(hours, dow);
  const yesterday = pickDayRow(hours, yesterdayDow);
  // SPLIT HOURS: a day is an ARRAY of intervals (one element for legacy
  // single-window rows). rowIntervals() applies the overnight auto-fix and
  // returns [] for closed days, so the shared decision covers every case —
  // including a lunch/dinner gap reading "opens_at" the dinner window.
  return liveStatusFromIntervals(rowIntervals(today), rowIntervals(yesterday), nowHHMM, format);
}

/**
 * Resolve the NEXT moment the restaurant will be open from `now`. Used
 * by the customer ordering page (to default the schedule picker when
 * the restaurant is closed) and by the order-create endpoint (to set
 * `Order.alertAt` for closed-placed orders so the kitchen alert fires
 * when the restaurant actually opens, not when the order was created).
 *
 * Walks forward day-by-day (max 14 days) looking for the first weekly
 * row with `isOpen` and an `openTime`. Returns a real Date in UTC that
 * corresponds to that local opening moment in the restaurant's
 * timezone. Returns null if no opening row exists within 14 days
 * (restaurant is effectively closed indefinitely).
 *
 * Conservative: if the restaurant is currently open RIGHT NOW, returns
 * now — the caller can disambiguate via `liveOpenStatus`.
 */
export function nextOpenAt(
  hours: OpeningHoursRow[] | undefined | null,
  now: Date = new Date(),
  timezone?: string,
  /** Optional holiday/special-day rows. When provided, days that a
   *  holiday rule closes are SKIPPED, and custom-hours days use the
   *  holiday's own intervals instead of the weekly row — so "order for
   *  later" minimums never land on a day the server would reject.
   *  (Holiday gap found during Luigi's live test of cmpxds2d2.) */
  holidays?: Parameters<typeof holidayEffectForDay>[0],
): Date | null {
  const holEff = (dayKey: string) =>
    holidays && holidays.length > 0 ? holidayEffectForDay(holidays, dayKey, null) : null;

  // If currently open RIGHT NOW (weekly hours + today's holiday rules
  // agreeing), the answer is "now."
  const todayKey = timezone ? dateKeyInTimezone(now, timezone) : now.toISOString().slice(0, 10);
  const todayEff = holEff(todayKey);
  const todayHol =
    todayEff?.kind === "closed" ? {}
    : todayEff?.kind === "custom_hours" ? { intervals: todayEff.intervals }
    : undefined;
  const status = liveOpenStatus(hours, now, "24h", todayHol, timezone);
  if (status.kind === "open") return now;

  if (!hours || hours.length === 0) return null;
  const { dow } = localDowAndHHMM(now, timezone);
  // Today's row first — could open later today. Then walk forward up
  // to 14 days. (More than 14 days suggests the restaurant has no
  // viable schedule; bail null so the caller picks a sane fallback.)
  for (let offset = 0; offset < 14; offset++) {
    const targetDow = (dow + offset) % 7;
    // Build the YYYY-MM-DD for `offset` days from `now` in the
    // restaurant's local timezone.
    const target = new Date(now.getTime() + offset * 24 * 3600 * 1000);
    const dateKey = timezone ? dateKeyInTimezone(target, timezone) : target.toISOString().slice(0, 10);

    // Holiday rules first: a closed day is skipped entirely; a
    // custom-hours day opens at ITS intervals, not the weekly row's.
    const eff = holEff(dateKey);
    if (eff?.kind === "closed") continue;
    let openTimes: string[];
    if (eff?.kind === "custom_hours" && eff.intervals.length > 0) {
      openTimes = [...eff.intervals].sort((a, b) => (a.open < b.open ? -1 : 1)).map((iv) => iv.open);
    } else {
      // Prefer the default (service=null) row — service-scoped rows
      // (pickup / delivery / reservation) are for slot pickers, not for
      // "is the kitchen open at all". Same fix as liveOpenStatus above.
      // SPLIT HOURS: a day may open more than once (lunch + dinner) — feed
      // every interval's open time (sorted) into the candidate loop below, so
      // "next open" can land on TODAY's dinner reopening, not just tomorrow.
      const row = pickDayRow(hours, targetDow);
      const ivs = rowIntervals(row);
      if (ivs.length === 0) continue;
      openTimes = ivs.map((iv) => iv.open);
    }

    for (const openTime of openTimes) {
      const [hh, mm] = openTime.split(":").map((s) => parseInt(s, 10));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

      // Construct the moment that corresponds to `dateKey` at `hh:mm`
      // in the restaurant's local timezone. We do this by hand-rolling
      // an ISO string and asking JS to parse it; for timezone-correctness
      // we use a known offset trick: render the string in the tz,
      // re-interpret, and let Date math close the loop.
      const candidate = parseLocalDateTimeInTz(dateKey, hh, mm, timezone);
      if (candidate <= now) continue; // this opening already passed
      return candidate;
    }
  }
  return null;
}

/** Parse "YYYY-MM-DD" + hh:mm AS IF IT WERE LOCAL TIME in `timezone`,
 *  returning the real UTC Date that represents that local moment.
 *  Without an IANA timezone, the input is interpreted as the server's
 *  local time (fine for development; on Vercel that's UTC). */
export function parseLocalDateTimeInTz(
  dateKey: string,
  hh: number,
  mm: number,
  timezone?: string,
): Date {
  // No tz → trust the wall clock.
  if (!timezone) {
    const [y, mo, d] = dateKey.split("-").map((s) => parseInt(s, 10));
    return new Date(y, (mo ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  }
  // We need the UTC instant whose representation in `timezone` is
  // (dateKey, hh:mm). Use a fixed reference UTC date for that
  // calendar+hh:mm in UTC, then ask Intl what hour:minute it reports
  // in the target tz. The delta is the timezone offset for that
  // moment (handles DST transitions). Adjust by the delta to land on
  // the right UTC instant.
  const [y, mo, d] = dateKey.split("-").map((s) => parseInt(s, 10));
  const utcGuess = Date.UTC(y, (mo ?? 1) - 1, d ?? 1, hh, mm, 0, 0);
  const probe = new Date(utcGuess);
  const tzLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(probe);
  const tzY = parseInt(tzLocal.find(p => p.type === "year")?.value ?? "0", 10);
  const tzMo = parseInt(tzLocal.find(p => p.type === "month")?.value ?? "0", 10);
  const tzD = parseInt(tzLocal.find(p => p.type === "day")?.value ?? "0", 10);
  let tzH = parseInt(tzLocal.find(p => p.type === "hour")?.value ?? "0", 10);
  if (tzH === 24) tzH = 0;
  const tzM = parseInt(tzLocal.find(p => p.type === "minute")?.value ?? "0", 10);
  const observedUtc = Date.UTC(tzY, tzMo - 1, tzD, tzH, tzM, 0, 0);
  const deltaMs = utcGuess - observedUtc;
  return new Date(utcGuess + deltaMs);
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

/**
 * Returns the holiday/closure name if TODAY (in the restaurant's timezone)
 * matches a configured one-off closure (RestaurantHoliday), else null. Pass
 * the result as `liveOpenStatus(..., todayIsHoliday)` to force "closed today".
 * RestaurantHoliday.date is @db.Date (midnight UTC = a calendar date), so we
 * compare its UTC date-key to today's date-key in the restaurant zone.
 */
export function holidayNameForToday(
  holidays: Array<{ date: Date | string; name?: string | null }> | null | undefined,
  timezone: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!holidays || holidays.length === 0) return null;
  const tz = timezone || "UTC";
  const todayKey = dateKeyInTimezone(now, tz);
  for (const h of holidays) {
    const d = typeof h.date === "string" ? new Date(h.date) : h.date;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (dateKeyInTimezone(d, "UTC") === todayKey) return h.name || "Holiday";
  }
  return null;
}
