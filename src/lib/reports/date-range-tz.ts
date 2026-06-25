import "server-only";
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";
import { toISODate, type DateRange, type Preset } from "@/lib/reports/date-range";

/**
 * TIMEZONE-AWARE date-range resolution for the Reports system.
 *
 * `date-range.ts` is client-safe (the picker imports it) and resolves ranges in
 * SERVER-local time. That's wrong for a restaurant in another timezone: at 9pm
 * PST the server's UTC clock has already rolled to tomorrow, so "today" / "Last
 * 7 days" captured the wrong window and the Dashboard disagreed with the
 * End-of-Day report (which is tz-correct via `digests.ts`).
 *
 * This server-only module reuses the SAME tz math as `digests.ts`
 * (`parseLocalDateTimeInTz` / `dateKeyInTimezone` from `restaurant-hours.ts`) so
 * a report's "today" is the restaurant's local day — matching the kitchen and
 * the EOD email exactly. Every report PAGE should call `parseDateRangeInTz(sp,
 * restaurant.timezone)` instead of `parseDateRange(sp)`.
 */

/** Shift a YYYY-MM-DD key by N days (noon-UTC anchor dodges DST edges). */
function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** End of a local day = 1ms before the NEXT local midnight (DST-safe). */
function endOfLocalDay(dayKey: string, tz?: string): Date {
  const nextMidnight = parseLocalDateTimeInTz(addDaysToKey(dayKey, 1), 0, 0, tz);
  return new Date(nextMidnight.getTime() - 1);
}

const PRESET_DAYS: Record<string, number> = { last_7: 7, last_14: 14, last_28: 28 };

/**
 * Resolve a named preset to a concrete range with day boundaries in `tz`.
 * "Last N days" = today + the N-1 prior local days inclusive (GloriaFood
 * semantics). `today` / `yesterday` resolve to a single local day.
 */
export function resolvePresetInTz(
  preset: Exclude<Preset, "custom">,
  tz?: string,
  now: Date = new Date(),
): DateRange {
  const todayKey = tz ? dateKeyInTimezone(now, tz) : toISODate(now);
  let fromKey: string;
  let toKey: string;
  if (preset === "yesterday") {
    toKey = addDaysToKey(todayKey, -1);
    fromKey = toKey;
  } else if (preset === "today") {
    fromKey = todayKey;
    toKey = todayKey;
  } else {
    toKey = todayKey;
    fromKey = addDaysToKey(todayKey, -((PRESET_DAYS[preset] ?? 7) - 1));
  }
  return {
    from: parseLocalDateTimeInTz(fromKey, 0, 0, tz),
    to: endOfLocalDay(toKey, tz),
    preset,
  };
}

/**
 * Timezone-aware twin of `parseDateRange`. Reads `?preset` / `?from` / `?to`
 * and resolves them against the restaurant's timezone. Falls back to
 * server-local (tz undefined) for dev / restaurants with no tz set.
 */
export function parseDateRangeInTz(
  searchParams: Record<string, string | string[] | undefined>,
  tz?: string,
): DateRange {
  const presetParam = pickFirst(searchParams.preset);
  const fromParam = pickFirst(searchParams.from);
  const toParam = pickFirst(searchParams.to);

  if (presetParam === "custom" && fromParam && toParam) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      return {
        from: parseLocalDateTimeInTz(fromParam, 0, 0, tz),
        to: endOfLocalDay(toParam, tz),
        preset: "custom",
      };
    }
  }
  if (presetParam === "today") return resolvePresetInTz("today", tz);
  if (presetParam === "yesterday") return resolvePresetInTz("yesterday", tz);
  if (presetParam === "last_14") return resolvePresetInTz("last_14", tz);
  if (presetParam === "last_28") return resolvePresetInTz("last_28", tz);
  return resolvePresetInTz("last_7", tz);
}

/**
 * The previous period of the same length, with boundaries kept in `tz`. Used by
 * the comparison overlays (the dashed "previous period" line / the vs-prev
 * delta columns). Aligns by duration, like the client-safe `previousPeriod`.
 */
export function previousPeriodInTz(range: DateRange): { from: Date; to: Date } {
  const durationMs = range.to.getTime() - range.from.getTime();
  const prevTo = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

/**
 * The list of local day-keys (YYYY-MM-DD, restaurant tz) spanning a range —
 * for zero-filling tz-correct daily buckets so Wednesday still renders even
 * with zero orders, and so a bucket key matches `dateKeyInTimezone(order, tz)`.
 */
export function eachDayKeyInTz(range: { from: Date; to: Date }, tz?: string): string[] {
  const keys: string[] = [];
  let key = tz ? dateKeyInTimezone(range.from, tz) : toISODate(range.from);
  const endKey = tz ? dateKeyInTimezone(range.to, tz) : toISODate(range.to);
  // Guard against a runaway loop (≈3 years of days is plenty for any report).
  for (let i = 0; i < 1200 && key <= endKey; i++) {
    keys.push(key);
    key = addDaysToKey(key, 1);
  }
  return keys;
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Render a range as a human label in the restaurant's TIMEZONE — e.g.
 * "Jun 25, 2026" for a single day or "Jun 19, 2026 - Jun 25, 2026" for a span.
 * The client-safe `formatRangeLabel` formats `range.to` (the local end-of-day
 * instant) in SERVER-local time, which on a UTC server pushes an America/* end
 * boundary into the NEXT calendar day ("Jun 25 - Jun 26"). This renders the
 * actual local day keys instead, and collapses a single day to one date.
 */
export function formatRangeLabelInTz(range: { from: Date; to: Date }, tz?: string): string {
  const fromKey = tz ? dateKeyInTimezone(range.from, tz) : toISODate(range.from);
  const toKey = tz ? dateKeyInTimezone(range.to, tz) : toISODate(range.to);
  const fmt = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return fromKey === toKey ? fmt(fromKey) : `${fmt(fromKey)} - ${fmt(toKey)}`;
}
