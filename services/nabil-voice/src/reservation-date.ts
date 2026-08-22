/**
 * Reservation date normalisation (A6 / C15, 2026-08-22).
 *
 * Calls cmt30v6di + cmt3n6ou8: `date: "today"` threw a tool exception and a
 * past date (2025-01-01) was accepted silently, after which the agent asked
 * the CALLER what today's date was. The prompt now carries today's date in
 * the restaurant's timezone (`localDate`); this makes the tools honour it —
 * relative words resolve here, a past date is refused with today echoed back.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ReservationDate = { ok: true; date: string } | { ok: false; code: "date_unparseable" | "date_in_past"; today: string | null };

function isValidIso(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function addDays(iso: string, days: number): string {
  const m = ISO.exec(iso)!;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const m = ISO.exec(iso)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
}

export function normalizeReservationDate(raw: unknown, localDate: string | null | undefined): ReservationDate {
  const today = typeof localDate === "string" && isValidIso(localDate) ? localDate : null;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return { ok: false, code: "date_unparseable", today };

  let date: string | null = null;
  if (isValidIso(s)) date = s;
  else if (today) {
    if (/^(today|tonight|this (evening|afternoon|morning))$/.test(s)) date = today;
    else if (/^tomorrow( (night|evening|afternoon|morning))?$/.test(s)) date = addDays(today, 1);
    else if (/^day after tomorrow$/.test(s)) date = addDays(today, 2);
    else {
      const m = /^(?:(this|next) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)( (night|evening|afternoon|morning))?$/.exec(s);
      if (m) {
        const target = WEEKDAYS.indexOf(m[2]);
        let delta = (target - weekdayOf(today) + 7) % 7;
        if (m[1] === "next" && delta === 0) delta = 7;
        date = addDays(today, delta);
      }
    }
  }
  if (!date) return { ok: false, code: "date_unparseable", today };
  if (today && date < today) return { ok: false, code: "date_in_past", today };
  return { ok: true, date };
}
