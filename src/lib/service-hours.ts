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
 */
export function pickHoursForService(
  rows: HoursRow[],
  dayOfWeek: number,
  service: ServiceKind | null,
): HoursRow | null {
  // Service-specific row wins when provided.
  if (service) {
    const specific = rows.find((r) => r.dayOfWeek === dayOfWeek && r.service === service);
    if (specific) return specific;
  }
  // Fall back to the default row (service = null).
  const fallback = rows.find((r) => r.dayOfWeek === dayOfWeek && (r.service == null || r.service === ""));
  return fallback ?? null;
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
