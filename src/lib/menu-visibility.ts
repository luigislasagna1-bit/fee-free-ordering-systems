/**
 * GloriaFood-style scheduled visibility for menu items + categories (Luigi
 * 2026-06-12). Decides whether an item/category should APPEAR on the customer
 * menu right now. This is purely about showing/hiding — NOT about whether an
 * item can be ordered (that's availability/fulfilment, a separate system).
 *
 * Model (visibilityMode):
 *   null               → always visible (falls back to legacy isHidden)
 *   "hide_from_menu"   → never shown
 *   "hide_until"       → hidden until visibleUntil, then shows
 *   "show_only_from"   → shown ONLY on visibleDays during visibleFrom–visibleTo
 *                        (recurring weekly; overnight windows supported)
 *   "show_from_until"  → shown ONLY between visibleStartDate and visibleEndDate
 *
 * All day/time math is in the restaurant's timezone.
 */
import { localDowAndHHMM } from "@/lib/restaurant-hours";

export type VisibilityFields = {
  isHidden?: boolean | null;
  visibilityMode?: string | null;
  visibleUntil?: Date | string | null;
  visibleStartDate?: Date | string | null;
  visibleEndDate?: Date | string | null;
  visibleDays?: string | null; // JSON [0..6]
  visibleFrom?: string | null; // "HH:MM"
  visibleTo?: string | null;
};

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a) && a.length > 0) return a.map(Number).filter((n) => n >= 0 && n <= 6);
  } catch { /* ignore */ }
  return null;
}

/** Is `hhmm` (e.g. "13:05") inside [from,to)? Handles overnight (from > to). */
function inTimeWindow(hhmm: string, from: string, to: string): boolean {
  if (from === to) return true; // 24h
  if (from < to) return hhmm >= from && hhmm < to;
  return hhmm >= from || hhmm < to; // overnight spill
}

/**
 * Whether this entity should be shown on the customer menu at `now`.
 * Defaults to visible; only an explicit rule hides it.
 */
export function isVisibleNow(e: VisibilityFields, now: Date = new Date(), timezone?: string): boolean {
  const mode = e.visibilityMode;
  if (!mode) return !e.isHidden; // legacy fallback

  switch (mode) {
    case "hide_from_menu":
      return false;
    case "hide_until": {
      const until = asDate(e.visibleUntil);
      return until ? now >= until : true; // no date set → already un-hidden
    }
    case "show_only_from": {
      const { dow, hhmm } = localDowAndHHMM(now, timezone);
      const days = parseDays(e.visibleDays);
      if (days && !days.includes(dow)) {
        // Could still be inside an overnight window that started yesterday.
        if (e.visibleFrom && e.visibleTo && e.visibleFrom > e.visibleTo) {
          const prev = (dow + 6) % 7;
          if (days.includes(prev) && hhmm < e.visibleTo) return true;
        }
        return false;
      }
      if (e.visibleFrom && e.visibleTo) return inTimeWindow(hhmm, e.visibleFrom, e.visibleTo);
      return true; // day matches, no time restriction
    }
    case "show_from_until": {
      const start = asDate(e.visibleStartDate);
      const end = asDate(e.visibleEndDate);
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;
    }
    default:
      return !e.isHidden;
  }
}

/** True when the rule is time/date-based (so the customer page must re-evaluate
 *  per request rather than treat the menu as static). Informational helper. */
export function isScheduledVisibility(e: VisibilityFields): boolean {
  return e.visibilityMode === "hide_until" || e.visibilityMode === "show_only_from" || e.visibilityMode === "show_from_until";
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODES = ["hide_from_menu", "hide_until", "show_only_from", "show_from_until"];

export type VisibilityInput = {
  mode?: string | null;
  until?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days?: number[] | null;
  from?: string | null;
  to?: string | null;
};

/**
 * Validate a client `visibility` payload into a Prisma update object (or an
 * error). Keeps the legacy `isHidden` flag in sync with "hide_from_menu" so
 * any code still reading it stays correct. Clears all sub-fields not relevant
 * to the chosen mode, so switching modes never leaves stale data.
 */
export function buildVisibilityData(
  v: VisibilityInput | null | undefined,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const base: Record<string, unknown> = {
    visibilityMode: null, visibleUntil: null, visibleStartDate: null,
    visibleEndDate: null, visibleDays: null, visibleFrom: null, visibleTo: null,
    isHidden: false,
  };
  if (!v || v.mode == null) return { ok: true, data: base }; // "always visible"
  if (!MODES.includes(v.mode)) return { ok: false, error: "Invalid visibility mode." };

  if (v.mode === "hide_from_menu") {
    return { ok: true, data: { ...base, visibilityMode: v.mode, isHidden: true } };
  }
  if (v.mode === "hide_until") {
    const d = v.until ? new Date(v.until) : null;
    if (!d || Number.isNaN(d.getTime())) return { ok: false, error: "Pick the date/time to hide until." };
    return { ok: true, data: { ...base, visibilityMode: v.mode, visibleUntil: d } };
  }
  if (v.mode === "show_from_until") {
    const s = v.startDate ? new Date(v.startDate) : null;
    const e = v.endDate ? new Date(v.endDate) : null;
    if (!s || Number.isNaN(s.getTime()) || !e || Number.isNaN(e.getTime()))
      return { ok: false, error: "Pick both a start and end date/time." };
    if (e <= s) return { ok: false, error: "The end must be after the start." };
    return { ok: true, data: { ...base, visibilityMode: v.mode, visibleStartDate: s, visibleEndDate: e } };
  }
  // show_only_from
  if (v.from != null && !HHMM.test(v.from)) return { ok: false, error: "Invalid start time." };
  if (v.to != null && !HHMM.test(v.to)) return { ok: false, error: "Invalid end time." };
  if ((v.from == null) !== (v.to == null)) return { ok: false, error: "Set both a start and end time, or neither." };
  let days: number[] | null = null;
  if (Array.isArray(v.days)) {
    // Drop junk (null/strings) BEFORE coercion — Number(null) is 0 (Sunday).
    days = [...new Set(v.days.filter((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b);
    if (days.length === 0) return { ok: false, error: "Pick at least one day." };
    if (days.length === 7) days = null;
  }
  if (!days && v.from == null) return { ok: false, error: "Choose the days and/or times this is shown." };
  return {
    ok: true,
    data: { ...base, visibilityMode: v.mode, visibleDays: days ? JSON.stringify(days) : null, visibleFrom: v.from ?? null, visibleTo: v.to ?? null },
  };
}
