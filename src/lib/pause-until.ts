/**
 * Resolve a pause-services request body to the `*PausedUntil` instant.
 *
 * Extracted from /api/admin/pause-services so the Nabil dashboard's Temporary
 * Closure card could gain "until Monday" / custom local date-time quick-picks
 * without every route growing its own timezone arithmetic (Luigi 2026-08-20).
 * Behavior-identical to the old inline code for the pre-existing shapes
 * (resume / untilIso / durationMinutes / restOfDay); the kitchen twin keeps its
 * own copy of those three on purpose (untouched hot path).
 *
 * All calendar math is done in the RESTAURANT's timezone, server-side — the
 * owner's browser timezone is never trusted (they may pause from anywhere).
 */
import { dateKeyInTimezone, parseLocalDateTimeInTz, localDowAndHHMM } from "@/lib/restaurant-hours";

export type PauseUntilBody = {
  untilIso?: string | null;
  durationMinutes?: number;
  restOfDay?: boolean;
  /** Local 00:00 of that day. "monday" = the NEXT Monday (today-is-Monday ⇒ a week out). */
  untilStartOfDay?: "tomorrow" | "monday";
  /** Custom picker — local wall-clock in the restaurant's timezone. */
  untilLocal?: { date: string; time: string };
  resume?: boolean;
};

export type PauseUntilResult = { ok: true; until: Date | null } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Local date key of `now + days×24h` — near-DST a 24h step still lands on the
 *  next calendar day at any wall-clock except exactly midnight (same reasoning
 *  as describeNextOpen in context-payload.ts). */
function dateKeyDaysAhead(now: Date, days: number, tz: string): string {
  return dateKeyInTimezone(new Date(now.getTime() + days * 24 * 3600 * 1000), tz);
}

export function resolvePauseUntil(body: PauseUntilBody, tz: string, now: Date = new Date()): PauseUntilResult {
  if (body.resume === true || body.untilIso === null) {
    return { ok: true, until: null };
  }
  if (typeof body.untilIso === "string" && body.untilIso) {
    const d = new Date(body.untilIso);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid untilIso" };
    return { ok: true, until: d };
  }
  if (typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
    return { ok: true, until: new Date(now.getTime() + body.durationMinutes * 60_000) };
  }
  if (body.restOfDay) {
    // 23:59 TODAY in the restaurant's local timezone (DST-aware), not the
    // server clock — matches the kitchen route.
    const localDate = dateKeyInTimezone(now, tz);
    return { ok: true, until: parseLocalDateTimeInTz(localDate, 23, 59, tz) };
  }
  if (body.untilStartOfDay === "tomorrow" || body.untilStartOfDay === "monday") {
    let key: string | null = null;
    if (body.untilStartOfDay === "tomorrow") {
      key = dateKeyDaysAhead(now, 1, tz);
    } else {
      // First upcoming local Monday, starting from tomorrow — a Monday click on
      // a Monday means "closed for the week", not "resume now".
      for (let i = 1; i <= 7; i++) {
        const candidate = new Date(now.getTime() + i * 24 * 3600 * 1000);
        if (localDowAndHHMM(candidate, tz).dow === 1) {
          key = dateKeyInTimezone(candidate, tz);
          break;
        }
      }
    }
    if (!key) return { ok: false, error: "Could not resolve untilStartOfDay" };
    return { ok: true, until: parseLocalDateTimeInTz(key, 0, 0, tz) };
  }
  if (body.untilLocal && typeof body.untilLocal === "object") {
    const { date, time } = body.untilLocal;
    if (typeof date !== "string" || !DATE_RE.test(date) || typeof time !== "string" || !TIME_RE.test(time)) {
      return { ok: false, error: "untilLocal needs date YYYY-MM-DD and time HH:MM" };
    }
    const [hh, mm] = time.split(":").map((s) => parseInt(s, 10));
    const until = parseLocalDateTimeInTz(date, hh, mm, tz);
    if (Number.isNaN(until.getTime())) return { ok: false, error: "Invalid untilLocal" };
    if (until.getTime() <= now.getTime()) return { ok: false, error: "untilLocal must be in the future" };
    return { ok: true, until };
  }
  return { ok: false, error: "Must provide untilIso, durationMinutes, restOfDay, untilStartOfDay, untilLocal, or resume: true" };
}
