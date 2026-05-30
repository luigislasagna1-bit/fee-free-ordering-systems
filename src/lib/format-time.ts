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

/** Format a minutes-since-midnight number (0..1440). Used by promo
 *  usable-hours windows which store minutes, not HH:MM strings. */
export function formatMinutes(min: number | null | undefined, format: HoursFormat = "24h"): string {
  if (typeof min !== "number" || !Number.isFinite(min)) return "";
  const clamped = Math.max(0, Math.min(1440, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return formatTime(`${h}:${String(m).padStart(2, "0")}`, format);
}
