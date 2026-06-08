/**
 * promo-window — client-safe primitives for "is this promo usable at time T?"
 *
 * Shared single source of truth for the Happy-Hour day-of-week + hour-of-day
 * window math. Both the server promo engine (promo-engine.ts isScheduledNow)
 * and the customer ordering page (banner greying / claim gating / nudge) import
 * from here so the two never drift. Pure — no server-only deps — so it tree-
 * shakes cleanly into the client bundle without dragging the whole engine in.
 */

/** Resolve weekday (0=Sun..6=Sat) + minute-of-day for `now` in an IANA tz.
 *  Falls back to the host clock when tz is missing or invalid. */
export function localDateParts(now: Date, tz?: string): { weekday: number; minuteOfDay: number } {
  if (!tz) {
    return { weekday: now.getDay(), minuteOfDay: now.getHours() * 60 + now.getMinutes() };
  }
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    let hour = parseInt(get("hour"), 10);
    if (!Number.isFinite(hour)) hour = 0;
    if (hour === 24) hour = 0; // Intl sometimes emits "24" for midnight
    const minute = parseInt(get("minute"), 10) || 0;
    const wd = get("weekday");
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return { weekday: weekday >= 0 ? weekday : now.getDay(), minuteOfDay: hour * 60 + minute };
  } catch {
    return { weekday: now.getDay(), minuteOfDay: now.getHours() * 60 + now.getMinutes() };
  }
}

function parseDayList(s: string | null | undefined): number[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n)) : null;
  } catch {
    return null;
  }
}

export type PromoWindowFields = {
  daysOfWeek?: string | null;
  usableHourStart?: number | null;
  usableHourEnd?: number | null;
};

/** Does the promo's day-of-week + hour-of-day window contain (weekday, minute)?
 *  Empty/missing daysOfWeek = every day. Null bounds = always. The hour window
 *  WRAPS past midnight when start > end (e.g. 23:00–04:00). */
export function isWithinUsableWindow(p: PromoWindowFields, weekday: number, minuteOfDay: number): boolean {
  const days = parseDayList(p.daysOfWeek ?? null);
  // [] means "no day restriction", NOT "never" — see the engine's note.
  if (days && days.length > 0 && !days.includes(weekday)) return false;
  const startMin = typeof p.usableHourStart === "number" ? p.usableHourStart : null;
  const endMin = typeof p.usableHourEnd === "number" ? p.usableHourEnd : null;
  if (startMin != null || endMin != null) {
    const s = startMin ?? 0;
    const e = endMin ?? 1440;
    const inWindow = s <= e ? minuteOfDay >= s && minuteOfDay < e : minuteOfDay >= s || minuteOfDay < e;
    if (!inWindow) return false;
  }
  return true;
}

/** Is the promo usable at the customer's EFFECTIVE order time? For a scheduled
 *  ("order for later") cart the wall-clock of `scheduledFor` is already in the
 *  restaurant's local time (the picker shows restaurant-local), so we read its
 *  weekday/minute directly. ASAP carts evaluate `now` in the restaurant tz.
 *  Mirrors what /api/public/apply-promos feeds the engine, so the banner/claim
 *  agrees with whether the discount will actually apply. */
export function promoUsableNow(
  promo: PromoWindowFields,
  opts: { scheduledFor?: string | null; tz?: string | null; now?: Date },
): boolean {
  const { scheduledFor, tz, now = new Date() } = opts;
  const m = scheduledFor ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor)) : null;
  let weekday: number;
  let minuteOfDay: number;
  if (m) {
    weekday = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    minuteOfDay = +m[4] * 60 + +m[5];
  } else {
    const parts = localDateParts(now, tz ?? undefined);
    weekday = parts.weekday;
    minuteOfDay = parts.minuteOfDay;
  }
  return isWithinUsableWindow(promo, weekday, minuteOfDay);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Restaurant-local calendar date (Y/M/D) for `now`. */
function localYMD(now: Date, tz?: string | null): { y: number; mo: number; d: number } {
  if (!tz) return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
  try {
    const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const [y, mo, d] = s.split("-").map((x) => parseInt(x, 10));
    return { y, mo, d };
  } catch {
    return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
  }
}

/** The next datetime-local string (restaurant wall-clock, "YYYY-MM-DDTHH:MM")
 *  at which the promo's window OPENS — for the "order for later" CTA when a
 *  time-restricted promo can't be redeemed for an ASAP order right now. Returns
 *  null when the promo has no hour window (nothing to schedule around). Looks
 *  ahead up to 8 days to satisfy any day-of-week restriction. */
export function nextUsableSlot(
  promo: PromoWindowFields,
  tz: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const startMin = typeof promo.usableHourStart === "number" ? promo.usableHourStart : null;
  if (startMin == null) return null;
  const days = parseDayList(promo.daysOfWeek ?? null);
  const { weekday, minuteOfDay } = localDateParts(now, tz ?? undefined);
  const base = localYMD(now, tz);
  for (let offset = 0; offset < 8; offset++) {
    const dayWeekday = (weekday + offset) % 7;
    if (days && days.length > 0 && !days.includes(dayWeekday)) continue;
    // Today only counts if the window hasn't already opened earlier today.
    if (offset === 0 && minuteOfDay >= startMin) continue;
    const dt = new Date(Date.UTC(base.y, base.mo - 1, base.d));
    dt.setUTCDate(dt.getUTCDate() + offset);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}T${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)}`;
  }
  return null;
}
