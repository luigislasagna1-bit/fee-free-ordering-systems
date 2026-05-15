/**
 * Shared helper for "Open: 11:00 – 22:00" / "Closed today" labels.
 *
 * Both the customer ordering header and the restaurant info page render
 * this same status — centralising the label here makes the translated
 * "Open"/"Closed" text consistent across surfaces.
 */
export interface OpeningHoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface HoursStatus {
  isOpen: boolean;
  /** "11:00 – 22:00" when open, empty string when closed */
  openRange: string;
}

export function statusForToday(hours: OpeningHoursRow[] | undefined | null, now = new Date()): HoursStatus {
  const dow = now.getDay();
  const row = (hours ?? []).find((h) => h.dayOfWeek === dow);
  if (!row || !row.isOpen) return { isOpen: false, openRange: "" };
  return { isOpen: true, openRange: `${row.openTime} – ${row.closeTime}` };
}
