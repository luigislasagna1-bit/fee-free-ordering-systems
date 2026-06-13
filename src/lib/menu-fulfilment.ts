/**
 * Per-item "Fulfilment Time" (Luigi 2026-06-12, Phase 2). An item can be
 * VISIBLE every day but only ORDERABLE FOR specific days/times — e.g. a Tuesday
 * special that shows all week, greys out for ASAP, and is orderable only when
 * the order's fulfilment slot lands on a Tuesday. The customer schedules the
 * order for a valid slot (same forced-scheduling flow as catering); the server
 * rejects an order whose effective fulfilment time is outside an item's window.
 *
 * Independent of visibility (show/hide) and of the legacy availableDays.
 */
import { localDowAndHHMM } from "@/lib/restaurant-hours";

export type FulfilFields = {
  fulfilDays?: string | null; // JSON [0..6]
  fulfilFrom?: string | null; // "HH:MM"
  fulfilTo?: string | null;
};

/** Admin → API payload for the Fulfilment Time editor. */
export type FulfilInput = {
  days?: number[] | null;
  from?: string | null;
  to?: string | null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate + normalise an admin Fulfilment payload into the three DB columns.
 *  Returns the columns to persist (all three are always set, so clearing the
 *  restriction writes nulls). Days that cover all 7 (or none) collapse to null
 *  = "any day"; a partial day set is stored as sorted JSON. A time window needs
 *  BOTH ends — a half-set window is dropped. Centralised so the customer page,
 *  server enforcement, POST and PATCH all agree (Luigi standing rule). */
export function buildFulfilData(input: FulfilInput | null | undefined): {
  ok: true; data: { fulfilDays: string | null; fulfilFrom: string | null; fulfilTo: string | null };
} | { ok: false; error: string } {
  if (!input) return { ok: true, data: { fulfilDays: null, fulfilFrom: null, fulfilTo: null } };
  let fulfilDays: string | null = null;
  if (Array.isArray(input.days)) {
    const days = [...new Set(input.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
    if (days.length > 0 && days.length < 7) fulfilDays = JSON.stringify(days);
  }
  const from = input.from && HHMM.test(input.from) ? input.from : null;
  const to = input.to && HHMM.test(input.to) ? input.to : null;
  // A window needs both ends; otherwise drop it (a lone "from" is meaningless).
  const bothTimes = from && to;
  return {
    ok: true,
    data: { fulfilDays, fulfilFrom: bothTimes ? from : null, fulfilTo: bothTimes ? to : null },
  };
}

function parseDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a) && a.length > 0) return a.map(Number).filter((n) => n >= 0 && n <= 6);
  } catch { /* ignore */ }
  return null;
}

/** Does this item carry any fulfilment restriction at all? */
export function hasFulfilWindow(item: FulfilFields): boolean {
  return !!(parseDays(item.fulfilDays) || (item.fulfilFrom && item.fulfilTo));
}

function inTimeWindow(hhmm: string, from: string, to: string): boolean {
  if (from === to) return true;
  if (from < to) return hhmm >= from && hhmm < to;
  return hhmm >= from || hhmm < to; // overnight
}

/** Can this item be ordered for the moment `when` (restaurant tz)? Items with no
 *  fulfilment restriction are always orderable. */
export function isFulfilableAt(item: FulfilFields, when: Date, timezone?: string): boolean {
  const days = parseDays(item.fulfilDays);
  const hasTime = !!(item.fulfilFrom && item.fulfilTo);
  if (!days && !hasTime) return true;
  const { dow, hhmm } = localDowAndHHMM(when, timezone);
  if (days && !days.includes(dow)) {
    // overnight window may spill from the previous day
    if (hasTime && item.fulfilFrom! > item.fulfilTo!) {
      const prev = (dow + 6) % 7;
      if (days.includes(prev) && hhmm < item.fulfilTo!) return true;
    }
    return false;
  }
  if (hasTime) return inTimeWindow(hhmm, item.fulfilFrom!, item.fulfilTo!);
  return true;
}

/** Human-readable window ("Tue, Wed · 12:00 – 15:00" / "Tue, Wed" / "12:00 – 15:00"),
 *  or "" when unrestricted. dayName/formatTime are injected so callers control locale. */
export function fulfilWindowLabel(
  item: FulfilFields,
  dayName: (dow: number) => string,
  formatTime: (hhmm: string) => string,
): string {
  const parts: string[] = [];
  const days = parseDays(item.fulfilDays);
  if (days && days.length < 7) parts.push([...days].sort((a, b) => a - b).map(dayName).join(", "));
  if (item.fulfilFrom && item.fulfilTo) parts.push(`${formatTime(item.fulfilFrom)} – ${formatTime(item.fulfilTo)}`);
  return parts.join(" · ");
}

/** Earliest absolute moment from `now` at which the item is orderable, rounded UP
 *  to the next 15-min boundary. null = unrestricted (orderable now). Scans up to
 *  14 days; returns null if it somehow never opens. */
export function earliestFulfilSlot(item: FulfilFields, now: Date = new Date(), timezone?: string): Date | null {
  if (!hasFulfilWindow(item)) return null;
  if (isFulfilableAt(item, now, timezone)) return null;
  const q = 15 * 60 * 1000;
  let t = Math.ceil(now.getTime() / q) * q;
  const limit = now.getTime() + 14 * 24 * 3600 * 1000;
  // Step in 15-min increments to the first fulfilable slot (bounded; windows are
  // coarse so this is at most ~1344 iterations).
  while (t <= limit) {
    const d = new Date(t);
    if (isFulfilableAt(item, d, timezone)) return d;
    t += q;
  }
  return null;
}
