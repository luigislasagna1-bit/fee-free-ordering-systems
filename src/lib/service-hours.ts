/**
 * Per-service opening-hours lookup.
 *
 * Restaurants can configure separate hours for each service surface:
 *   - "pickup"      — when customers can pick up orders
 *   - "delivery"    — when delivery is offered
 *   - "reservation" — when tables can be booked
 *
 * Plus an implicit "default" set (rows where `service` is null) that
 * was the only option before this feature. GloriaFood parity: their
 * "Set different operating hours for specific services" toggle.
 *
 * Lookup rule:
 *   1. Try the service-specific row for the requested day-of-week
 *   2. Fall back to the default (service=null) row
 *   3. If neither exists, the restaurant is treated as closed for that
 *      day and that service
 *
 * Used by:
 *   - CheckoutModal scheduling slot generation
 *   - ReservationModal slot generation
 *   - Customer-side openness check (when adapted)
 */

export type HoursRow = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
  closesNextDay?: boolean;
  service?: string | null;
};

export type ServiceKind = "pickup" | "delivery" | "reservation";

/**
 * Pick the effective hours row for a given day-of-week + service.
 * Returns the most specific row available (service-scoped first, then
 * the default), or null when neither exists.
 *
 * The row is normalised on the way out — if `closeTime <= openTime`
 * and `closesNextDay` is false, we infer that the owner meant
 * "closes at the end of the day" (a 12:00 AM mistake from the time
 * picker) and stamp closesNextDay=true on the returned row. This
 * means existing data with the bad shape still resolves correctly
 * without forcing a re-save. The same auto-correction now also
 * applies at write time in /api/restaurants/hours.
 */
export function pickHoursForService(
  rows: HoursRow[],
  dayOfWeek: number,
  service: ServiceKind | null,
): HoursRow | null {
  let picked: HoursRow | null = null;
  if (service) {
    const specific = rows.find((r) => r.dayOfWeek === dayOfWeek && r.service === service);
    if (specific) picked = specific;
  }
  if (!picked) {
    picked = rows.find((r) => r.dayOfWeek === dayOfWeek && (r.service == null || r.service === "")) ?? null;
  }
  if (!picked || !picked.isOpen) return picked;
  // Auto-fix impossible-window rows: 11 AM → 12 AM with closesNextDay
  // false would otherwise read as "closed all day" downstream.
  const [oh, om] = (picked.openTime || "00:00").split(":").map(Number);
  const [ch, cm] = (picked.closeTime || "00:00").split(":").map(Number);
  const openMin = (oh ?? 0) * 60 + (om ?? 0);
  const closeMin = (ch ?? 0) * 60 + (cm ?? 0);
  if (closeMin <= openMin && !picked.closesNextDay) {
    return { ...picked, closesNextDay: true };
  }
  return picked;
}

/**
 * Convenience: convert an array of HoursRow into the shape the rest
 * of the OrderingPageClient already consumes ({dayOfWeek, openTime,
 * closeTime, isOpen}) but filtered+resolved for a specific service.
 * Returns 7 rows (one per day) so consumers can index by getDay().
 */
export function resolveServiceHours(
  rows: HoursRow[],
  service: ServiceKind | null,
): HoursRow[] {
  const out: HoursRow[] = [];
  for (let d = 0; d < 7; d++) {
    const row = pickHoursForService(rows, d, service);
    if (row) {
      out.push({
        dayOfWeek: d,
        openTime: row.openTime,
        closeTime: row.closeTime,
        isOpen: row.isOpen,
        closesNextDay: row.closesNextDay,
        service: row.service ?? null,
      });
    } else {
      // No row at all → treat as closed (isOpen=false) so the slot
      // generator returns []. Lets the customer see "Closed this day"
      // rather than a fake 10–22 default.
      out.push({ dayOfWeek: d, openTime: "00:00", closeTime: "00:00", isOpen: false });
    }
  }
  return out;
}

/** A display group of opening-hours rows for the storefront info page —
 *  one row per day, ready to render under an optional service heading. */
export type HoursGroup = { key: "all" | "general" | ServiceKind; rows: HoursRow[] };

/** First row per day-of-week, sorted Sun→Sat. Guards against duplicate rows
 *  (e.g. two default rows for one day) that would otherwise collide as React
 *  keys and render the day twice. */
function dedupSortByDay(rows: HoursRow[]): HoursRow[] {
  const byDay = new Map<number, HoursRow>();
  for (const r of rows) if (!byDay.has(r.dayOfWeek)) byDay.set(r.dayOfWeek, r);
  return [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/**
 * Group raw opening-hours rows for human-readable display, divided by service.
 *
 * Rows with service=null are the default ("General") hours — they drive the
 * open/closed sign and cover any service without its own hours (dine-in,
 * takeout, catering). pickup / delivery / reservation may each carry their own.
 *
 *   - No service-specific rows  → a single { key:"all" } group (one plain list,
 *     unchanged from the pre-per-service behaviour — no regression).
 *   - Otherwise → a { key:"general" } group (the default rows) followed by one
 *     group per service that has its OWN rows, each RESOLVED (service rows where
 *     set, default otherwise) so it shows that service's true weekly schedule.
 *
 * Reseller request (Fabrizio 2026-06-21): the old flat list interleaved every
 * service's rows with no labels (Sunday ×3, Monday ×3…) — impossible to read.
 */
export function groupHoursByService(rows: HoursRow[]): HoursGroup[] {
  const customKinds = (["pickup", "delivery", "reservation"] as ServiceKind[])
    .filter((svc) => rows.some((r) => r.service === svc));
  const defaults = dedupSortByDay(rows.filter((r) => r.service == null || r.service === ""));
  if (customKinds.length === 0) {
    return [{ key: "all", rows: defaults.length ? defaults : dedupSortByDay(rows) }];
  }
  const groups: HoursGroup[] = [];
  if (defaults.length > 0) groups.push({ key: "general", rows: defaults });
  for (const svc of customKinds) groups.push({ key: svc, rows: resolveServiceHours(rows, svc) });
  return groups;
}
