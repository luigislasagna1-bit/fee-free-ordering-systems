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
  /** MULTI-WINDOW list (Fabrizio cmr803ovq c, 2026-07-05): JSON array of
   *  { days: number[]|null, from: "HH:MM"|null, to: "HH:MM"|null }. An item is
   *  fulfilable when ANY window matches (e.g. Mon–Thu 10–15 + Fri–Sun 15–20).
   *  When present it supersedes the single legacy triple above; when absent
   *  the legacy triple acts as a one-window list — full back-compat. */
  fulfilWindows?: unknown;
};

/** Admin → API payload for the Fulfilment Time editor. */
export type FulfilInput = {
  days?: number[] | null;
  from?: string | null;
  to?: string | null;
};

/** One normalised window: null days = every day; times both-or-none. */
export type FulfilWindow = { days: number[] | null; from: string | null; to: string | null };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate + normalise an admin Fulfilment payload into the three DB columns.
 *  Returns the columns to persist (all three are always set, so clearing the
 *  restriction writes nulls). Days that cover all 7 (or none) collapse to null
 *  = "any day"; a partial day set is stored as sorted JSON. A time window needs
 *  BOTH ends — a half-set window is dropped. Centralised so the customer page,
 *  server enforcement, POST and PATCH all agree (Luigi standing rule). */
export function buildFulfilData(
  input: (FulfilInput & { windows?: FulfilInput[] | null }) | null | undefined,
): {
  ok: true;
  data: { fulfilDays: string | null; fulfilFrom: string | null; fulfilTo: string | null; fulfilWindows: FulfilWindow[] | null };
} | { ok: false; error: string } {
  const empty = { fulfilDays: null, fulfilFrom: null, fulfilTo: null, fulfilWindows: null };
  if (!input) return { ok: true, data: empty };

  const one = (w: FulfilInput): { fulfilDays: string | null; fulfilFrom: string | null; fulfilTo: string | null } => {
    let fulfilDays: string | null = null;
    if (Array.isArray(w.days)) {
      const days = [...new Set(w.days.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b);
      if (days.length > 0 && days.length < 7) fulfilDays = JSON.stringify(days);
    }
    const from = w.from && HHMM.test(w.from) ? w.from : null;
    const to = w.to && HHMM.test(w.to) ? w.to : null;
    // A window needs both ends; otherwise drop it (a lone "from" is meaningless).
    const bothTimes = from && to;
    return { fulfilDays, fulfilFrom: bothTimes ? from : null, fulfilTo: bothTimes ? to : null };
  };

  // Multi-window payload (Fabrizio cmr803ovq c): windows[0] mirrors into the
  // legacy triple (anything still reading the old columns sees the first
  // window); the FULL list persists in fulfilWindows only when 2+ windows
  // carry a real restriction — a single window stays bit-identical to the
  // historic rows.
  if (Array.isArray(input.windows)) {
    const norm = input.windows
      .map((w) => normaliseWindow(w))
      .filter((w): w is FulfilWindow => !!w);
    if (norm.length === 0) return { ok: true, data: empty };
    const first = norm[0];
    const legacy = {
      fulfilDays: first.days ? JSON.stringify(first.days) : null,
      fulfilFrom: first.from,
      fulfilTo: first.to,
    };
    return { ok: true, data: { ...legacy, fulfilWindows: norm.length > 1 ? norm : null } };
  }

  return { ok: true, data: { ...one(input), fulfilWindows: null } };
}

/** Normalise ONE raw window object; null when it carries no restriction.
 *  Shared with menu-visibility.ts (same {days,from,to} window shape). */
export function normaliseWindow(w: any): FulfilWindow | null {
  if (!w || typeof w !== "object") return null;
  let days: number[] | null = null;
  if (Array.isArray(w.days)) {
    const valid = (w.days as unknown[]).filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6);
    const d = [...new Set(valid)].sort((a, b) => a - b);
    if (d.length > 0 && d.length < 7) days = d;
  }
  const from = typeof w.from === "string" && HHMM.test(w.from) ? w.from : null;
  const to = typeof w.to === "string" && HHMM.test(w.to) ? w.to : null;
  const both = from && to ? { from, to } : { from: null, to: null };
  if (!days && !both.from) return null; // no restriction at all
  return { days, ...both };
}

/** The item's effective window LIST: the multi-window JSON when present,
 *  else the legacy single triple as a one-element list, else [] (unrestricted).
 *  Every check below iterates this — ANY matching window makes the moment valid. */
export function fulfilWindowsOf(item: FulfilFields): FulfilWindow[] {
  const raw = item.fulfilWindows;
  let arr: any[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string" && raw.trim()) { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p; } catch { /* ignore */ } }
  if (arr) {
    const windows = arr.map(normaliseWindow).filter((w): w is FulfilWindow => !!w);
    if (windows.length > 0) return windows;
  }
  // Legacy single window.
  const days = parseDays(item.fulfilDays);
  const both = item.fulfilFrom && item.fulfilTo ? { from: item.fulfilFrom, to: item.fulfilTo } : { from: null, to: null };
  if (!days && !both.from) return [];
  return [{ days, ...both }];
}

function parseDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a)) {
      // Drop junk (null/strings) BEFORE coercion — Number(null) is 0, which would
      // silently turn a corrupt "[2,null]" into "Sun + Tue".
      const d = a.filter((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 6);
      if (d.length > 0) return d;
    }
  } catch { /* ignore */ }
  return null;
}

/** Does this item carry any fulfilment restriction at all? */
export function hasFulfilWindow(item: FulfilFields): boolean {
  return fulfilWindowsOf(item).length > 0;
}

function inTimeWindow(hhmm: string, from: string, to: string): boolean {
  if (from === to) return true;
  if (from < to) return hhmm >= from && hhmm < to;
  return hhmm >= from || hhmm < to; // overnight
}

/** Does ONE window cover the local (dow, hhmm)? Same day + overnight-spill
 *  semantics the single-window implementation always had. Shared with
 *  menu-visibility.ts (identical matching rules for show_only_from). */
export function windowMatches(w: FulfilWindow, dow: number, hhmm: string): boolean {
  const hasTime = !!(w.from && w.to);
  if (w.days && !w.days.includes(dow)) {
    // overnight window may spill from the previous day
    if (hasTime && w.from! > w.to!) {
      const prev = (dow + 6) % 7;
      if (w.days.includes(prev) && hhmm < w.to!) return true;
    }
    return false;
  }
  if (hasTime) return inTimeWindow(hhmm, w.from!, w.to!);
  return true;
}

/** Can this item be ordered for the moment `when` (restaurant tz)? Items with no
 *  fulfilment restriction are always orderable; with windows, ANY match wins. */
export function isFulfilableAt(item: FulfilFields, when: Date, timezone?: string): boolean {
  const windows = fulfilWindowsOf(item);
  if (windows.length === 0) return true;
  const { dow, hhmm } = localDowAndHHMM(when, timezone);
  return windows.some((w) => windowMatches(w, dow, hhmm));
}

/** Human-readable window ("Tue, Wed · 12:00 – 15:00" / "Tue, Wed" / "12:00 – 15:00"),
 *  or "" when unrestricted. dayName/formatTime are injected so callers control locale. */
export function fulfilWindowLabel(
  item: FulfilFields,
  dayName: (dow: number) => string,
  formatTime: (hhmm: string) => string,
): string {
  const windows = fulfilWindowsOf(item);
  return windows
    .map((w) => {
      const parts: string[] = [];
      if (w.days && w.days.length < 7) parts.push(w.days.map(dayName).join(", "));
      if (w.from && w.to) parts.push(`${formatTime(w.from)} – ${formatTime(w.to)}`);
      return parts.join(" · ");
    })
    .filter(Boolean)
    .join(" / ");
}

/** Combined order-window constraint across all fulfilment items in a cart, so the
 *  checkout picker can offer ONLY valid days/times. days = intersection of each
 *  item's allowed days (an item with no day rule allows all 7); null ⇒ any day.
 *  from/to = the tightest common time window (latest start, earliest end) among
 *  items that set one; null ⇒ no time limit. An empty `days` array means the cart
 *  items can never be ordered together (disjoint days) — the caller should treat
 *  that as "no valid slot". */
export function combinedFulfilConstraint(
  items: FulfilFields[],
): { days: number[] | null; from: string | null; to: string | null } {
  const restricted = items.filter(hasFulfilWindow);
  if (restricted.length === 0) return { days: null, from: null, to: null };
  let days: Set<number> | null = null;
  for (const it of restricted) {
    // Per item, its allowed days = the UNION across its windows (any window
    // makes the day orderable); across items we still intersect.
    const windows = fulfilWindowsOf(it);
    const set = new Set<number>();
    for (const w of windows) for (const d of w.days ?? [0, 1, 2, 3, 4, 5, 6]) set.add(d);
    if (days === null) {
      days = set;
    } else {
      const next = new Set<number>();
      for (const x of days) if (set.has(x)) next.add(x);
      days = next;
    }
  }
  const dayArr: number[] | null = days ? Array.from(days).sort((a, b) => a - b) : null;
  // Time tightening stays a SINGLE [from,to] band, so it only applies while
  // every restricted item has exactly one timed window (the historic case).
  // A multi-window item can't be represented by one band — skip tightening
  // and let the server's per-item isFulfilableAt guard reject an off-window
  // slot with the localized reschedule message (defence unchanged).
  let from: string | null = null;
  let to: string | null = null;
  const allSingleTimed = restricted.every((it) => {
    const ws = fulfilWindowsOf(it);
    return ws.length === 1 || ws.every((w) => !w.from);
  });
  if (allSingleTimed) {
    for (const it of restricted) {
      const w = fulfilWindowsOf(it)[0];
      if (w?.from && w?.to) {
        if (from === null || w.from > from) from = w.from;
        if (to === null || w.to < to) to = w.to;
      }
    }
  }
  return { days: dayArr && dayArr.length < 7 ? dayArr : null, from, to };
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
