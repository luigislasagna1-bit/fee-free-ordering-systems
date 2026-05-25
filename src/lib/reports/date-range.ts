/**
 * Date-range helpers for the Reports system.
 *
 * Every report page reads its date range from the URL query
 * (?from=YYYY-MM-DD&to=YYYY-MM-DD&preset=last_7) so the picker state
 * survives refresh / share-link / browser-back. This module is the
 * single source of truth for:
 *   - Parsing those query params into Date objects.
 *   - Resolving named presets (last_7 / last_14 / last_28 / custom)
 *     into concrete from/to dates.
 *   - Computing the "previous period" range for comparison overlays
 *     (the dashed line in the GloriaFood Sales Trend chart).
 *
 * All dates are interpreted as **server local time** for now. When we
 * ship per-restaurant timezones (Restaurant.timezone is on the schema
 * but we don't honor it yet), update `now()` here and every report
 * will pick it up.
 */

export type Preset = "last_7" | "last_14" | "last_28" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  preset: Preset;
}

/**
 * Parse `?from`, `?to`, `?preset` URL params into a normalized range.
 * Falls back to "last 7 days" when no params are present — same default
 * GloriaFood uses on every report page on first load.
 *
 * Custom range hierarchy:
 *   - If `preset=custom`, parse `from`/`to` (both required).
 *   - If `preset` is a known shorthand, ignore `from`/`to` and recompute.
 *   - If both are missing, default to last_7.
 */
export function parseDateRange(searchParams: Record<string, string | string[] | undefined>): DateRange {
  const presetParam = pickFirst(searchParams.preset);
  const fromParam = pickFirst(searchParams.from);
  const toParam = pickFirst(searchParams.to);

  if (presetParam === "custom" && fromParam && toParam) {
    const from = parseISODate(fromParam);
    const to = parseISODate(toParam);
    if (from && to) {
      return { from: startOfDay(from), to: endOfDay(to), preset: "custom" };
    }
  }

  if (presetParam === "last_14") return resolvePreset("last_14");
  if (presetParam === "last_28") return resolvePreset("last_28");
  return resolvePreset("last_7");
}

/** Convert a named preset to a concrete date range. "Last N days"
 *  means "today and the N-1 previous days inclusive" — matches the
 *  GloriaFood semantics (Last 7 = Mon-Sun including today). */
export function resolvePreset(preset: Exclude<Preset, "custom">): DateRange {
  const days = preset === "last_14" ? 14 : preset === "last_28" ? 28 : 7;
  const to = endOfDay(new Date());
  const from = startOfDay(addDays(new Date(), -(days - 1)));
  return { from, to, preset };
}

/**
 * Compute the immediately-prior period of the same length, used to
 * power the "Show previous period" comparison overlay. For Last 7
 * (Mon May 19 – Sun May 25), prior is Mon May 12 – Sun May 18.
 */
export function previousPeriod(range: DateRange): { from: Date; to: Date } {
  const durationMs = range.to.getTime() - range.from.getTime();
  const prevTo = new Date(range.from.getTime() - 1); // one ms before current range start
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

/**
 * Iterate a date range day-by-day, yielding the midnight-aligned
 * start of each day. Useful for zero-filling daily aggregations so
 * the chart still renders Wednesday's bar even with zero orders.
 */
export function eachDay(range: { from: Date; to: Date }): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(new Date(range.from));
  const end = startOfDay(new Date(range.to));
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Round-trippable ISO date string (just the date part, no TZ). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Render a date for chart x-axis: "Mon, May 19". */
export function formatChartDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Render a date range for header copy: "May 19, 2026 - May 25, 2026". */
export function formatRangeLabel(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${range.from.toLocaleDateString("en-US", opts)} - ${range.to.toLocaleDateString("en-US", opts)}`;
}

// ── Internal helpers ────────────────────────────────────────────────

function pickFirst(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseISODate(s: string): Date | null {
  // Strict YYYY-MM-DD only — anything else is malformed and we ignore
  // it (falling back to default range) rather than risk timezone drift.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
