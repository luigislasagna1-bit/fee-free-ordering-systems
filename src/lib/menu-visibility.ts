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
import { normaliseWindow, windowMatches, type FulfilWindow } from "@/lib/menu-fulfilment";

export type VisibilityFields = {
  isHidden?: boolean | null;
  visibilityMode?: string | null;
  visibleUntil?: Date | string | null;
  visibleStartDate?: Date | string | null;
  visibleEndDate?: Date | string | null;
  visibleDays?: string | null; // JSON [0..6]
  visibleFrom?: string | null; // "HH:MM"
  visibleTo?: string | null;
  /** MULTI-WINDOW show_only_from list (Fabrizio cmr803ovq c, 2026-07-05):
   *  JSON array of { days: number[]|null, from, to } — visible when ANY window
   *  matches. Same shape + matching rules as fulfilment windows. When absent,
   *  the legacy visibleDays/From/To triple acts as a one-window list. */
  visibleWindows?: unknown;
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

/** The entity's effective show_only_from window LIST: the multi-window JSON
 *  when present, else the legacy triple as a one-element list, else []
 *  (day/time-unrestricted). ANY matching window makes the entity visible. */
export function visibleWindowsOf(e: VisibilityFields): FulfilWindow[] {
  const raw = e.visibleWindows;
  let arr: any[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim()) { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p; } catch { /* ignore */ } }
  if (arr) {
    const windows = arr.map(normaliseWindow).filter((w): w is FulfilWindow => !!w);
    if (windows.length > 0) return windows;
  }
  const days = parseDays(e.visibleDays);
  const both = e.visibleFrom && e.visibleTo ? { from: e.visibleFrom, to: e.visibleTo } : { from: null, to: null };
  if (!days && !both.from) return [];
  return [{ days, ...both }];
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
      // Multi-window aware: visible when ANY window covers the local moment
      // (same day + overnight-spill matching the single-window code always
      // had — a one-window list is behaviourally identical to the old logic).
      const windows = visibleWindowsOf(e);
      if (windows.length === 0) return true; // mode set but no restriction
      const { dow, hhmm } = localDowAndHHMM(now, timezone);
      return windows.some((w) => windowMatches(w, dow, hhmm));
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
  /** EXTRA show_only_from windows beyond the primary days/from/to above
   *  (Fabrizio cmr803ovq c). The primary + extras form one list; window[0]
   *  of the normalised list mirrors into the legacy columns. */
  extraWindows?: { days?: number[] | null; from?: string | null; to?: string | null }[] | null;
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
    // FulfilWindow[] | null — routes convert null → Prisma.DbNull (Json column).
    visibleWindows: null,
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
  // Explicitly-empty day set = the admin deselected every day — error (as the
  // single-window code always did) instead of silently meaning "every day".
  if (Array.isArray(v.days) && !v.days.some((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6))
    return { ok: false, error: "Pick at least one day." };
  // Primary window (the historic days/from/to) + any extraWindows form ONE
  // list (Fabrizio cmr803ovq c). Each is normalised identically; window[0] of
  // the normalised list mirrors into the legacy columns so anything still
  // reading them sees the first window; the FULL list persists in
  // visibleWindows only when 2+ windows carry a real restriction.
  const rawList = [
    { days: v.days ?? null, from: v.from ?? null, to: v.to ?? null },
    ...(Array.isArray(v.extraWindows) ? v.extraWindows : []),
  ];
  const norm = rawList.map((w) => normaliseWindow(w)).filter((w): w is FulfilWindow => !!w);
  if (norm.length === 0) return { ok: false, error: "Choose the days and/or times this is shown." };
  const first = norm[0];
  return {
    ok: true,
    data: {
      ...base,
      visibilityMode: v.mode,
      visibleDays: first.days ? JSON.stringify(first.days) : null,
      visibleFrom: first.from,
      visibleTo: first.to,
      visibleWindows: norm.length > 1 ? norm : null,
    },
  };
}
