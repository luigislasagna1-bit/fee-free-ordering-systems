/**
 * Time-of-day formatter that honours the restaurant's chosen display
 * format (`Restaurant.hoursFormat`). Stored as HH:MM 24-hour in the DB
 * regardless — this only controls RENDERING.
 *
 *   formatTime("14:30", "12h")   → "2:30 PM"
 *   formatTime("14:30", "24h")   → "14:30"
 *   formatTime("00:00", "12h")   → "12:00 AM"
 *   formatTime("12:00", "12h")   → "12:00 PM"
 *
 * Falls back to 24h on any garbage input. Empty / null → empty string.
 *
 * Used everywhere we show a time-of-day to the customer:
 *   - Header "Open: 11:00 AM – 2:00 AM"
 *   - Restaurant Info hours table
 *   - Promo "Usable hours" badge + summary panel
 *   - Schedule-for-later picker
 */

export type HoursFormat = "12h" | "24h";

/**
 * Locale-format a date, capitalising the WEEKDAY and MONTH words.
 *
 * Italian (and Spanish/French/German-adjacent locales) render these lowercase —
 * "mercoledì 15 lug, 15:00" — which reads like a typo on a kitchen ticket.
 * Fabrizio 2026-07-15: "Capitalize the first letter of the day of the week, and
 * do the same for the month."
 *
 * Uses Intl.formatToParts so we only touch the weekday/month parts and never
 * mangle separators, digits or AM/PM. Scripts without case (zh/ja/ko/ar/he/th)
 * are unaffected — toUpperCase() on those characters is a no-op — so this is
 * safe across all 38 locales.
 */
export function formatDateCapitalized(
  date: Date | number | string,
  locale: string | undefined,
  opts: Intl.DateTimeFormatOptions,
): string {
  const d = date instanceof Date ? date : new Date(date);
  try {
    return new Intl.DateTimeFormat(locale || undefined, opts)
      .formatToParts(d)
      .map((p) =>
        p.type === "weekday" || p.type === "month"
          ? p.value.charAt(0).toUpperCase() + p.value.slice(1)
          : p.value,
      )
      .join("");
  } catch {
    // Bad locale/options → never throw at render time.
    return d.toLocaleString(locale || undefined, opts);
  }
}

export function formatTime(
  hhmm: string | null | undefined,
  format: HoursFormat = "24h",
): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  if (format === "24h") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Format a "time until due" duration UNAMBIGUOUSLY for the kitchen display so
 * staff never misread hours as minutes:
 *   - ≥ 1 hour  → "2h 05m"   (explicit unit suffixes, no colon)
 *   - < 1 hour  → "14:31"    (MM:SS — the colon ONLY ever means minutes:seconds)
 *   - past due  → "00:00"
 */
export function formatDueCountdown(diffMs: number): { text: string; unit: "hours" | "minutes" | "due" } {
  if (diffMs <= 0) return { text: "00:00", unit: "due" };
  const totalSec = Math.floor(diffMs / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  if (hh > 0) return { text: `${hh}h ${String(mm).padStart(2, "0")}m`, unit: "hours" };
  // Under an hour: always carry an explicit unit so the value can never be
  // misread as hours (Fabrizio cmq07rc9l — "no H or M, minutes/hours confused").
  if (mm > 0) return { text: `${mm}m ${String(ss).padStart(2, "0")}s`, unit: "minutes" };
  return { text: `${ss}s`, unit: "minutes" };
}

/**
 * Due-time label that caps the countdown at 24h: anything further out shows the
 * WEEKDAY NAME the order is due (e.g. "Thursday") instead of an unwieldy
 * multi-day hours value like "158h 33m". ≤ 24h → the hours/minutes countdown.
 * `kind` lets callers colour day/hours rows distinctly from minute timers.
 */
export function formatDueLabel(dueTs: number, nowMs: number, locale?: string): { text: string; kind: "day" | "hours" | "minutes" | "due" } {
  const diffMs = dueTs - nowMs;
  if (diffMs > 24 * 60 * 60 * 1000) {
    // Render the weekday in the CALLER's locale (the kitchen's selected
    // language), not the browser default — otherwise switching the panel to
    // English still showed Italian day names. Fabrizio 2026-06-16. Falls back
    // to the browser locale when no locale is passed.
    return { text: new Date(dueTs).toLocaleDateString(locale || undefined, { weekday: "long" }), kind: "day" };
  }
  const c = formatDueCountdown(diffMs);
  return { text: c.text, kind: c.unit };
}

/** Format a minutes-since-midnight number (0..1440). Used by promo
 *  usable-hours windows which store minutes, not HH:MM strings. */
export function formatMinutes(min: number | null | undefined, format: HoursFormat = "24h"): string {
  if (typeof min !== "number" || !Number.isFinite(min)) return "";
  const clamped = Math.max(0, Math.min(1440, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return formatTime(`${h}:${String(m).padStart(2, "0")}`, format);
}
