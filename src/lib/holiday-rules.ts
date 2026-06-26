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
import { dateKeyInTimezone, rowIntervals } from "@/lib/restaurant-hours";
import { pickHoursForService, type HoursRow, type ServiceKind } from "@/lib/service-hours";

export type HolidayInterval = { open: string; close: string };

export type HolidayRule = {
  /** null/empty = all services. Canonical keys: pickup, delivery, dine_in,
   *  take_out, catering, reservation. */
  services: string[] | null;
  /** closed = closed all day; open = open ONLY during `intervals` (custom hours);
   *  closed_windows = open on the normal schedule EXCEPT closed during `intervals`
   *  (a partial-day closure — e.g. "close pickup 16:00–20:00, open otherwise"). */
  mode: "closed" | "open" | "closed_windows";
  /** Meaningful when mode === "open" (the OPEN windows) or "closed_windows" (the CLOSED windows). */
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
  | { kind: "closed_windows"; name: string | null; message: string | null; intervals: HolidayInterval[] }
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
      const mode: "closed" | "open" | "closed_windows" =
        r.mode === "open" ? "open" : r.mode === "closed_windows" ? "closed_windows" : "closed";
      let services: string[] | null = null;
      if (Array.isArray(r.services)) {
        const cleaned = r.services
          .map((s: unknown) => canonicalHolidayService(String(s)))
          .filter((s: string) => CANONICAL_SERVICES.has(s));
        services = cleaned.length > 0 ? Array.from(new Set(cleaned)) : null;
      }
      let intervals: HolidayInterval[] | undefined;
      if ((mode === "open" || mode === "closed_windows") && Array.isArray(r.intervals)) {
        intervals = r.intervals
          .filter(
            (iv: any) =>
              // Both endpoints valid HH:MM and NOT equal. open > close is allowed
              // and means the window WRAPS past midnight (e.g. 22:00–02:00) — only
              // legitimate when the governing service's own hours also cross
              // midnight; that's enforced by the within-service-hours validator on
              // save (holidayWindowsWithinService), not here. Previously this
              // required open < close, which SILENTLY DROPPED any cross-midnight
              // closure (Luigi 2026-06-26: "close pickup 10pm–2am" vanished).
              iv && HHMM_RE.test(String(iv.open ?? "")) && HHMM_RE.test(String(iv.close ?? "")) &&
              String(iv.open) !== String(iv.close),
          )
          .map((iv: any) => ({ open: String(iv.open), close: String(iv.close) }));
      }
      // An "open" rule with no valid intervals is meaningless — treat as
      // closed so a half-filled admin form fails safe (closed), not open.
      if (mode === "open" && (!intervals || intervals.length === 0)) {
        out.push({ services, mode: "closed" });
      } else if (mode === "closed_windows" && (!intervals || intervals.length === 0)) {
        // "Close a time range" with no windows = nothing is closed → drop it.
        // Fail OPEN: never close the whole day from an empty range.
        continue;
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
      // Full "closed" outranks a partial override (open custom-hours OR
      // closed-windows) at equal specificity → a same-day full closure wins.
      const closedBonus = rule.mode === "closed" ? 2 : 1;
      const score = specificity + closedBonus;
      if (best && score <= best.score) continue;
      best =
        rule.mode === "closed"
          ? { score, effect: { kind: "closed", name, message } }
          : rule.mode === "closed_windows"
            ? { score, effect: { kind: "closed_windows", name, message, intervals: rule.intervals! } }
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

/** Is an HH:MM (restaurant-local) inside any of the custom intervals?
 *  Handles cross-midnight intervals (open > close, e.g. 22:00–02:00): such a
 *  window matches times AT/AFTER open OR BEFORE close. Same-day intervals use
 *  the usual [open, close) half-open test. */
export function hhmmInsideIntervals(hhmm: string, intervals: HolidayInterval[]): boolean {
  return intervals.some((iv) =>
    iv.open <= iv.close
      ? hhmm >= iv.open && hhmm < iv.close            // same-day window
      : hhmm >= iv.open || hhmm < iv.close,            // wraps past midnight
  );
}

/** HH:MM → minutes since midnight (0–1439). Invalid → 0. */
function hhmmToMin(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** A time window as a minute-range on a 0–2880 line (two days), so a window
 *  that wraps past midnight (open > close) becomes a single contiguous range
 *  [open, close+1440] instead of two pieces. Same-day → [open, close]. */
function toMinRange(open: string, close: string): { start: number; end: number } {
  const s = hhmmToMin(open);
  let e = hhmmToMin(close);
  if (e <= s) e += 1440; // wraps past midnight (or close===open guarded elsewhere)
  return { start: s, end: e };
}

/**
 * Does an exceptional (special-day) open/closed window fit ENTIRELY within the
 * governing service's normal operating hours for that day? An owner must not be
 * able to set a closure/override at a time the service isn't even offered (Luigi
 * 2026-06-26: "we shouldn't be able to set closed pickup hours for a time pickup
 * isn't usually offered"). `serviceIntervals` are the service's open windows for
 * the rule's day (resolve via pickHoursForService + rowIntervals; for an
 * all-services rule, pass the GENERAL hours). A cross-midnight exceptional window
 * is therefore only valid when a service window also crosses midnight and
 * contains it. Returns the FIRST offending window, or null when all fit.
 * An empty serviceIntervals (service closed that day) ⇒ every window is invalid.
 */
export function holidayWindowOutsideService(
  windows: HolidayInterval[] | undefined | null,
  serviceIntervals: HolidayInterval[],
): HolidayInterval | null {
  if (!windows || windows.length === 0) return null;
  const svc = serviceIntervals.map((iv) => toMinRange(iv.open, iv.close));
  for (const w of windows) {
    const wr = toMinRange(w.open, w.close);
    // A window fits a service range if it's a subset of it. Try the window both
    // at its natural position and shifted +1440, so an early-morning window
    // (e.g. 01:00–02:00) is recognised inside an overnight service span
    // (e.g. 10:00–03:00 → [600,1620]) where it lives in the post-midnight tail.
    const fits = svc.some(
      (s) =>
        (wr.start >= s.start && wr.end <= s.end) ||
        (wr.start + 1440 >= s.start && wr.end + 1440 <= s.end),
    );
    if (!fits) return w;
  }
  return null;
}

/** Map a holiday-service key to the hours "service" that governs it. Only
 *  pickup / delivery / reservation can carry their OWN weekly hours; dine_in,
 *  take_out, catering (and all-services rules) follow the GENERAL schedule. */
function governingHoursService(holidayService: string | null): ServiceKind | null {
  if (holidayService === "pickup" || holidayService === "delivery" || holidayService === "reservation") {
    return holidayService;
  }
  return null; // dine_in / take_out / catering / all-services → general hours
}

/**
 * Validate a set of special-day rules against the restaurant's NORMAL hours for
 * the rule's day: every open/closed-window override must fit inside the governing
 * service's operating hours (Luigi 2026-06-26 — can't close pickup at a time
 * pickup isn't offered). `startDow` is the day-of-week (0=Sun) of the special
 * day's start date. Returns the first offending {service, window} or null when
 * every window fits. Shared by the admin save API (authoritative) and the admin
 * form (instant feedback) so the two never disagree.
 */
export function validateHolidayRulesAgainstHours(
  rules: HolidayRule[] | null | undefined,
  openingHours: HoursRow[],
  startDow: number,
): { service: string | null; window: HolidayInterval } | null {
  if (!rules) return null;
  for (const rule of rules) {
    if (rule.mode === "closed") continue; // full-day closure has no window to bound
    if (!rule.intervals || rule.intervals.length === 0) continue;
    const services: (string | null)[] =
      rule.services && rule.services.length > 0 ? rule.services : [null];
    for (const svc of services) {
      const row = pickHoursForService(openingHours, startDow, governingHoursService(svc));
      const svcIntervals = row ? rowIntervals(row as any) : [];
      const bad = holidayWindowOutsideService(rule.intervals, svcIntervals);
      if (bad) return { service: svc, window: bad };
    }
  }
  return null;
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
  /** Services open today but CLOSED during specific windows (the "close a time
   *  range" rule), with those windows — drives the partial-closure banner. */
  holidayClosedWindows: Array<{ service: string; intervals: HolidayInterval[] }>;
  /** Services with per-service CUSTOM open-hours today (a service-specific
   *  "open with these hours" rule) — drives the per-service special-hours banner. */
  holidayCustomHoursServices: Array<{ service: string; intervals: HolidayInterval[] }>;
  /** A GENERAL (all-services) "Closed hours" rule's windows for today, or null.
   *  Surfaced as ONE banner line rather than one per service (avoids exploding a
   *  single all-services rule into 6 duplicate lines). */
  holidayClosedWindowsGeneral: HolidayInterval[] | null;
} {
  const general = holidayEffectToday(holidays, timezone, null, now);
  const generalClosed = general?.kind === "closed";
  const ALL_SVCS = ["pickup", "delivery", "dine_in", "take_out", "catering", "reservation"];
  const holidayClosedServices = generalClosed
    ? []
    : ALL_SVCS.filter((s) => holidayEffectToday(holidays, timezone, s, now)?.kind === "closed");
  // A GENERAL (all-services) closed-windows rule surfaces as ONE line via
  // holidayClosedWindowsGeneral; the per-service list below SKIPS it (else a
  // single all-services rule matches all 6 service queries → 6 duplicate lines).
  const holidayClosedWindowsGeneral =
    general?.kind === "closed_windows" ? general.intervals : null;
  const holidayClosedWindows = generalClosed || general?.kind === "closed_windows"
    ? []
    : ALL_SVCS.flatMap((s) => {
        const e = holidayEffectToday(holidays, timezone, s, now);
        return e?.kind === "closed_windows" ? [{ service: s, intervals: e.intervals }] : [];
      });
  // Per-service CUSTOM open-hours (a service-specific "open with these hours"
  // rule). Skipped when fully closed or when a GENERAL custom-hours rule already
  // shows via todayHolidayIntervals — so the same hours are never double-reported.
  const holidayCustomHoursServices = generalClosed || general?.kind === "custom_hours"
    ? []
    : ALL_SVCS.flatMap((s) => {
        const e = holidayEffectToday(holidays, timezone, s, now);
        return e?.kind === "custom_hours" ? [{ service: s, intervals: e.intervals }] : [];
      });
  // Prefer the general entry's message; else surface the FIRST per-service entry's message —
  // full-closed, closed-windows OR custom-hours — so a per-service closure's custom note still
  // shows on the banner. Previously only full-closed services were covered, so a message on a
  // per-service "closed hours" / special-hours rule was dropped. Fabrizio 2026-06-25.
  const serviceMessage = !general
    ? (ALL_SVCS.map((s) => holidayEffectToday(holidays, timezone, s, now)?.message ?? null).find((m) => m) ?? null)
    : null;
  return {
    todayHolidayName: general?.name ?? null,
    todayHolidayMessage: general?.message ?? serviceMessage,
    todayHolidayIntervals: general?.kind === "custom_hours" ? general.intervals : null,
    todayHolidayClosed: generalClosed,
    holidayClosedServices,
    holidayClosedWindows,
    holidayCustomHoursServices,
    holidayClosedWindowsGeneral,
  };
}
