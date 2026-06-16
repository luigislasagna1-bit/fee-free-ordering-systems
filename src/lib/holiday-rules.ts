/**
 * Gloriafood-parity special-day / holiday resolution (Luigi 2026-06-11,
 * reseller report cmpxds2d2).
 *
 * A RestaurantHoliday row is one "special day" entry:
 *   - date..endDate (inclusive calendar range; endDate null = single day)
 *   - rules: per-service rules — closed, or OPEN with custom hour intervals
 *     that override the weekly schedule for that day
 *   - message: optional customer-facing note for the banner
 *
 * Legacy rows (rules null) mean what they always did: fully closed, all
 * services, single day. Every helper here treats that as the default so
 * pre-existing holidays behave identically.
 *
 * Resolution rules (matching Gloriafood's semantics):
 *   - a rule that NAMES the service beats an "all services" rule
 *   - at equal specificity, "closed" beats "open"
 *   - service=null asks for the GENERAL (page-level) status → only
 *     all-services rules (and legacy rows) apply
 */
import { dateKeyInTimezone } from "@/lib/restaurant-hours";

export type HolidayInterval = { open: string; close: string };

export type HolidayRule = {
  /** null/empty = all services. Canonical keys: pickup, delivery, dine_in,
   *  take_out, catering, reservation. */
  services: string[] | null;
  mode: "closed" | "open";
  /** Only meaningful when mode === "open". */
  intervals?: HolidayInterval[];
};

export type HolidayRow = {
  id?: string;
  date: Date | string;
  endDate?: Date | string | null;
  name?: string | null;
  rules?: string | null;
  message?: string | null;
};

export type HolidayEffect =
  | { kind: "closed"; name: string | null; message: string | null }
  | { kind: "custom_hours"; name: string | null; message: string | null; intervals: HolidayInterval[] }
  | null;

const CANONICAL_SERVICES = new Set([
  "pickup",
  "delivery",
  "dine_in",
  "take_out",
  "catering",
  "reservation",
]);

/** Map an Order.type / UI service label to a canonical holiday-service key. */
export function canonicalHolidayService(orderType: string | null | undefined): string {
  const t = (orderType ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (t === "dinein" || t === "dine_in") return "dine_in";
  if (t === "takeout" || t === "take_out" || t === "take_bake" || t === "take_&_bake") return "take_out";
  if (t === "reservations" || t === "reservation") return "reservation";
  if (CANONICAL_SERVICES.has(t)) return t;
  return "pickup"; // unknown/empty types behave like the pickup channel
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parse + sanitise a rules JSON string. Bad JSON / shapes → null (legacy). */
export function parseHolidayRules(raw: string | null | undefined): HolidayRule[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const out: HolidayRule[] = [];
    for (const r of arr) {
      if (!r || typeof r !== "object") continue;
      const mode = r.mode === "open" ? "open" : "closed";
      let services: string[] | null = null;
      if (Array.isArray(r.services)) {
        const cleaned = r.services
          .map((s: unknown) => canonicalHolidayService(String(s)))
          .filter((s: string) => CANONICAL_SERVICES.has(s));
        services = cleaned.length > 0 ? Array.from(new Set(cleaned)) : null;
      }
      let intervals: HolidayInterval[] | undefined;
      if (mode === "open" && Array.isArray(r.intervals)) {
        intervals = r.intervals
          .filter(
            (iv: any) =>
              iv && HHMM_RE.test(String(iv.open ?? "")) && HHMM_RE.test(String(iv.close ?? "")) &&
              String(iv.open) < String(iv.close),
          )
          .map((iv: any) => ({ open: String(iv.open), close: String(iv.close) }));
      }
      // An "open" rule with no valid intervals is meaningless — treat as
      // closed so a half-filled admin form fails safe (closed), not open.
      if (mode === "open" && (!intervals || intervals.length === 0)) {
        out.push({ services, mode: "closed" });
      } else {
        out.push({ services, mode, intervals });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" key for a stored @db.Date value (UTC-midnight semantics). */
function storedDateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return dateKeyInTimezone(d, "UTC");
}

/**
 * The holiday effect (closed / custom hours / none) for one service on one
 * calendar day. `dayKey` is "YYYY-MM-DD" in the RESTAURANT's timezone —
 * callers use dateKeyInTimezone(now, tz) for "today" or the scheduled date's
 * key for future orders. `service` null = general/page-level status.
 */
export function holidayEffectForDay(
  holidays: HolidayRow[] | null | undefined,
  dayKey: string,
  service: string | null,
): HolidayEffect {
  if (!holidays || holidays.length === 0) return null;

  // Best match so far: 0 = none, 1 = all-services open, 2 = all-services
  // closed, 3 = specific-service open, 4 = specific-service closed.
  let best: { score: number; effect: NonNullable<HolidayEffect> } | null = null;

  for (const h of holidays) {
    const startKey = storedDateKey(h.date);
    const endKey = h.endDate ? storedDateKey(h.endDate) : startKey;
    if (dayKey < startKey || dayKey > endKey) continue;

    const name = h.name ?? null;
    const message = h.message ?? null;
    const rules = parseHolidayRules(h.rules);

    if (!rules) {
      // Legacy row: closed, all services.
      const score = 2;
      if (!best || score > best.score) best = { score, effect: { kind: "closed", name, message } };
      continue;
    }

    for (const rule of rules) {
      const isAll = !rule.services || rule.services.length === 0;
      if (service === null) {
        // General status only honours all-services rules.
        if (!isAll) continue;
      } else if (!isAll && !rule.services!.includes(service)) {
        continue;
      }
      const specificity = isAll ? 0 : 2;
      const closedBonus = rule.mode === "closed" ? 2 : 1;
      const score = specificity + closedBonus;
      if (best && score <= best.score) continue;
      best =
        rule.mode === "closed"
          ? { score, effect: { kind: "closed", name, message } }
          : { score, effect: { kind: "custom_hours", name, message, intervals: rule.intervals! } };
    }
  }

  return best?.effect ?? null;
}

/** Convenience: today's effect in the restaurant's timezone. */
export function holidayEffectToday(
  holidays: HolidayRow[] | null | undefined,
  timezone: string | undefined,
  service: string | null,
  now: Date = new Date(),
): HolidayEffect {
  return holidayEffectForDay(holidays, dateKeyInTimezone(now, timezone || "UTC"), service);
}

/** Is an HH:MM (restaurant-local) inside any of the custom intervals? */
export function hhmmInsideIntervals(hhmm: string, intervals: HolidayInterval[]): boolean {
  return intervals.some((iv) => hhmm >= iv.open && hhmm < iv.close);
}

/**
 * Resolve today's holiday / extraordinary-closure BANNER state for a restaurant,
 * in its own timezone. The SHARED source of truth behind the amber "we're closed
 * / special hours today" banner on BOTH the ordering page and the standalone
 * reservation page — Luigi reseller report: a website "Book a table" link can
 * deep-link straight to the reservation page, so the same closure warning has to
 * show there too, not only on the order surface.
 *
 * Returns the GENERAL (page-level) closure plus which specific services are
 * holiday-closed while the rest stays open. A blank-name closure still reports
 * `todayHolidayClosed: true` (name/message are both optional — never infer
 * "closed" from their presence).
 */
export function resolveTodayHolidayClosure(
  holidays: HolidayRow[] | null | undefined,
  timezone: string | undefined,
  now: Date = new Date(),
): {
  todayHolidayName: string | null;
  todayHolidayMessage: string | null;
  todayHolidayIntervals: HolidayInterval[] | null;
  todayHolidayClosed: boolean;
  holidayClosedServices: string[];
} {
  const general = holidayEffectToday(holidays, timezone, null, now);
  const generalClosed = general?.kind === "closed";
  const holidayClosedServices = generalClosed
    ? []
    : ["pickup", "delivery", "dine_in", "take_out", "catering", "reservation"].filter(
        (s) => holidayEffectToday(holidays, timezone, s, now)?.kind === "closed",
      );
  // Prefer the general entry's message; else surface the first service-specific
  // closed entry's message so it isn't lost.
  const serviceMessage =
    !general && holidayClosedServices.length > 0
      ? holidayEffectToday(holidays, timezone, holidayClosedServices[0], now)?.message ?? null
      : null;
  return {
    todayHolidayName: general?.name ?? null,
    todayHolidayMessage: general?.message ?? serviceMessage,
    todayHolidayIntervals: general?.kind === "custom_hours" ? general.intervals : null,
    todayHolidayClosed: generalClosed,
    holidayClosedServices,
  };
}
