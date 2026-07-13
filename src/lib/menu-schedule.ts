/**
 * Recurring daily-window menu scheduling (Luigi 2026-06-12, report cmpxdzr9y
 * follow-up). A restaurant can give each menu a day/time window so the live
 * menu auto-switches by time of day (e.g. Lunch 10:00–14:00, Dinner 14:00–
 * 02:00). A menu with NO window is the all-hours default.
 *
 * Two responsibilities:
 *   1. resolveScheduledMenuId — pick the menu that is live RIGHT NOW (restaurant
 *      tz): a windowed menu whose window contains now wins; else the no-window
 *      default. Used by the customer ordering page.
 *   2. findCoverageGaps — given the restaurant's open hours + every menu's
 *      window, return the open stretches NOT covered by any active menu. The
 *      menu API rejects a save that would leave a gap, so customers always have
 *      a menu during open hours (Luigi's rule: no gaps — fix the windows or
 *      mark those hours closed).
 *
 * All minute math is timezone-projected by the caller (localDowAndHHMM); the
 * pure helpers here work in "restaurant local" dow + minutes.
 */
import prisma from "@/lib/db";
import { localDowAndHHMM, rowIntervals } from "@/lib/restaurant-hours";

export type MenuWindow = {
  id: string;
  name: string;
  /** Parsed day list (0=Sun..6=Sat); null = every day. */
  days: number[] | null;
  /** "HH:MM" or null. from+to both null = no window (all-hours default menu). */
  from: string | null;
  to: string | null;
};

export type OpenInterval = { dow: number; start: number; end: number }; // minutes [start,end)

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function parseDays(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6);
  } catch { /* fall through */ }
  return null;
}

/** Map a raw Menu row to a MenuWindow (single legacy window). */
export function toMenuWindow(m: { id: string; name: string; availableDays: string | null; availableFrom: string | null; availableTo: string | null }): MenuWindow {
  return { id: m.id, name: m.name, days: parseDays(m.availableDays), from: m.availableFrom, to: m.availableTo };
}

/** One window's shape as stored in Menu.availableWindows. */
export type StoredMenuWindow = { from: string; to: string; days: number[] | null };

/** Parse Menu.availableWindows JSON → validated window list. Empty / invalid → [].
 *  Days are normalised to a sorted 0..6 subset (or null = every day). Windows
 *  with a bad time or from===to are dropped. */
export function parseMenuWindows(raw: string | null | undefined): StoredMenuWindow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((w) => {
        let days: number[] | null = null;
        if (Array.isArray(w?.days)) {
          const nums = (w.days as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
          const uniq = [...new Set(nums)].sort((a, b) => a - b);
          days = uniq.length > 0 && uniq.length < 7 ? uniq : null;
        }
        return {
          from: typeof w?.from === "string" ? w.from : "",
          to: typeof w?.to === "string" ? w.to : "",
          days,
        };
      })
      .filter((w) => /^\d\d:\d\d$/.test(w.from) && /^\d\d:\d\d$/.test(w.to) && w.from !== w.to);
  } catch { return []; }
}

type RawMenu = { id: string; name: string; availableWindows?: string | null; availableDays: string | null; availableFrom: string | null; availableTo: string | null };

/** Expand one menu into its MenuWindow list (for pickMenuAt / findCoverageGaps):
 *  availableWindows (non-empty) → one MenuWindow per window; else the legacy
 *  single window; a menu with neither yields a single all-hours "default"
 *  window (from/to null). Multiple entries share the menu's id — the pure
 *  helpers already handle repeated ids, so multi-window "just works". */
export function expandMenuWindows(m: RawMenu, isActive = false): Array<MenuWindow & { isActive: boolean }> {
  const multi = parseMenuWindows(m.availableWindows);
  if (multi.length > 0) {
    return multi.map((w) => ({ id: m.id, name: m.name, days: w.days, from: w.from, to: w.to, isActive }));
  }
  return [{ ...toMenuWindow(m), isActive }];
}

/** True when ANY menu in the set uses a daily window (single OR multi). */
export function anyMenuWindowed(menus: RawMenu[]): boolean {
  return menus.some((m) => (!!m.availableFrom && !!m.availableTo) || parseMenuWindows(m.availableWindows).length > 0);
}

function inDays(days: number[] | null, dow: number): boolean {
  return !days || days.includes(dow);
}

/** Does this window cover `minute` (0..1439) on `dow`? A windowless menu
 *  covers every minute. Overnight windows (from > to) spill into the next day. */
export function windowCoversMinute(w: MenuWindow, dow: number, minute: number): boolean {
  if (!w.from || !w.to) return true; // no window = all hours, every day
  const from = toMinutes(w.from);
  const to = toMinutes(w.to);
  if (from === to) return inDays(w.days, dow); // treat equal as 24h on its days
  if (from < to) return inDays(w.days, dow) && minute >= from && minute < to;
  // Overnight: covers [from,1440) on its day, and [0,to) as spill from the previous day.
  const prev = (dow + 6) % 7;
  if (inDays(w.days, dow) && minute >= from) return true;
  if (inDays(w.days, prev) && minute < to) return true;
  return false;
}

/** Minutes since this window's start at (dow, minute) — smaller = started more
 *  recently. Used to break ties when overlapping windows both match. */
function minutesSinceStart(w: MenuWindow, dow: number, minute: number): number {
  if (!w.from) return 1e9;
  const from = toMinutes(w.from);
  const abs = dow * 1440 + minute;
  // Search back up to 7 days for the most recent matching start.
  for (let back = 0; back < 7 * 1440; back++) {
    const t = ((abs - back) % (7 * 1440) + 7 * 1440) % (7 * 1440);
    const d = Math.floor(t / 1440);
    const mm = t % 1440;
    if (mm === from && inDays(w.days, d)) return back;
  }
  return 1e9;
}

/** Pick the menu live at (dow, minute): windowed match (most-recently-started
 *  on tie) else the no-window default (active preferred). Returns null if no
 *  menu at all. */
export function pickMenuAt(
  menus: Array<MenuWindow & { isActive: boolean }>,
  dow: number,
  minute: number,
): string | null {
  const windowed = menus.filter((m) => m.from && m.to && windowCoversMinute(m, dow, minute));
  if (windowed.length > 0) {
    windowed.sort((a, b) => minutesSinceStart(a, dow, minute) - minutesSinceStart(b, dow, minute));
    return windowed[0].id;
  }
  const def =
    menus.find((m) => m.isActive && !m.from) ??
    menus.find((m) => !m.from) ??
    menus.find((m) => m.isActive);
  return def?.id ?? null;
}

/** Convert default (service=null) opening-hours rows into per-dow open
 *  minute-intervals, splitting overnight closes onto the next day. */
export function openIntervalsFromHours(
  hours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null; closesNextDay?: boolean | null; service?: string | null }>,
): OpenInterval[] {
  const out: OpenInterval[] = [];
  for (const r of hours) {
    if (r.service != null) continue; // only the general kitchen hours drive menu coverage
    if (!r.isOpen) continue;
    // SPLIT HOURS: a day can have multiple open windows (lunch + dinner). Expand
    // each via rowIntervals (legacy single-window rows yield one element); an
    // overnight window spills onto the next day, as before.
    for (const iv of rowIntervals(r as any)) {
      const from = toMinutes(iv.open);
      const to = toMinutes(iv.close);
      if (iv.closesNextDay || to <= from) {
        out.push({ dow: r.dayOfWeek, start: from, end: 1440 });
        if (to > 0) out.push({ dow: (r.dayOfWeek + 1) % 7, start: 0, end: to });
      } else {
        out.push({ dow: r.dayOfWeek, start: from, end: to });
      }
    }
  }
  return out;
}

export type CoverageGap = { dow: number; dayLabel: string; from: string; to: string };

/** Open stretches NOT covered by any menu window. Empty = fully covered (and a
 *  no-window default menu makes coverage trivially complete). */
export function findCoverageGaps(open: OpenInterval[], windows: MenuWindow[]): CoverageGap[] {
  if (windows.length === 0) return []; // no menus at all — nothing to validate here
  if (windows.some((w) => !w.from || !w.to)) return []; // a default menu covers everything
  const gaps: CoverageGap[] = [];
  for (const iv of open) {
    let gapStart: number | null = null;
    for (let t = iv.start; t < iv.end; t++) {
      const covered = windows.some((w) => windowCoversMinute(w, iv.dow, t));
      if (!covered && gapStart === null) gapStart = t;
      if (covered && gapStart !== null) {
        gaps.push({ dow: iv.dow, dayLabel: DOW_LABELS[iv.dow], from: fromMinutes(gapStart), to: fromMinutes(t) });
        gapStart = null;
      }
    }
    if (gapStart !== null) {
      gaps.push({ dow: iv.dow, dayLabel: DOW_LABELS[iv.dow], from: fromMinutes(gapStart), to: fromMinutes(iv.end) });
    }
  }
  return gaps;
}

/**
 * Resolve the menu a customer should see right now, honouring daily windows.
 * Falls back to the all-hours default; returns null only if the restaurant has
 * no usable menu (caller then does a restaurant-wide category query).
 */
export async function resolveScheduledMenuId(restaurantId: string, now: Date = new Date()): Promise<string | null> {
  const [rest, menus] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } }),
    prisma.menu.findMany({
      where: { restaurantId, isArchived: false },
      select: { id: true, name: true, isActive: true, availableDays: true, availableFrom: true, availableTo: true, availableWindows: true },
    }),
  ]);
  if (menus.length === 0) return null;
  // Fast path: nobody uses windows → the existing single-active behaviour.
  if (!anyMenuWindowed(menus)) {
    return (menus.find((m) => m.isActive) ?? null)?.id ?? null;
  }
  const { dow, hhmm } = localDowAndHHMM(now, rest?.timezone ?? undefined);
  return pickMenuAt(
    menus.flatMap((m) => expandMenuWindows(m, m.isActive)),
    dow,
    toMinutes(hhmm),
  );
}
