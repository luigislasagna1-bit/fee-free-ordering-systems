/**
 * FeeFreeDelivery constants + weekly settlement boundaries.
 * The billing week runs Saturday 00:00 → Friday 23:59:59.999 America/Toronto
 * (Luigi 2026-07-24; was Monday 00:00 UTC until then). See the week helpers below.
 */
import { haversineKm } from "@/lib/geocode";

/** Base/fallback platform fee (cents) — the first (nearest) distance tier. Used
 *  when the delivery distance can't be computed (missing coordinates). Frozen
 *  onto DeliveryAssignment.platformFeeCents at delivery so a later price change
 *  never re-bills old deliveries. */
export const FEEFREE_DELIVERY_PER_ORDER_CENTS = 799;

/**
 * DISTANCE-TIERED platform fee (Luigi 2026-07-14) — what FeeFree bills the
 * restaurant per delivered order, by straight-line distance restaurant→customer:
 *   ≤ 3.5 km → $7.99 · 3.5–7 km → $8.99 · 7–10 km → $9.99.
 * Beyond 10 km bills the top tier (the restaurant's Delivery Zones cap the actual
 * deliverable range, so this is a safety default, not a real band). Not advertised
 * as a single flat number.
 */
export const FEEFREE_DELIVERY_TIERS: ReadonlyArray<{ maxKm: number; cents: number }> = [
  { maxKm: 3.5, cents: 799 },
  { maxKm: 7, cents: 899 },
  { maxKm: 10, cents: 999 },
];

/** The platform fee (cents) for a delivery of `km` straight-line distance. */
export function feeCentsForDistanceKm(km: number): number {
  if (!Number.isFinite(km) || km < 0) return FEEFREE_DELIVERY_PER_ORDER_CENTS;
  for (const tier of FEEFREE_DELIVERY_TIERS) if (km <= tier.maxKm) return tier.cents;
  return FEEFREE_DELIVERY_TIERS[FEEFREE_DELIVERY_TIERS.length - 1].cents; // > top band
}

/**
 * The frozen fee for a delivered order, given the restaurant + customer
 * coordinates. Falls back to the base fee when either coordinate is missing
 * (so a delivery is never un-billable). Cents.
 */
export function feeCentsForDelivery(
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
  customerLat: number | null | undefined,
  customerLng: number | null | undefined,
): number {
  if (restaurantLat == null || restaurantLng == null || customerLat == null || customerLng == null) {
    return FEEFREE_DELIVERY_PER_ORDER_CENTS;
  }
  return feeCentsForDistanceKm(haversineKm(restaurantLat, restaurantLng, customerLat, customerLng));
}

/**
 * The platform fee (cents) to FREEZE onto a delivered order, honoring an optional
 * SUPERADMIN per-store flat override (FeeFreeDeliveryConfig.perDeliveryFeeCents).
 * When the override is a valid non-negative number it WINS — a flat per-store fee
 * (0 = a comped store) that replaces the distance tiers; otherwise the automatic
 * distance tiers apply (base fee when coords are missing). Frozen at delivery, so
 * a later change never re-bills past deliveries. Luigi 2026-07-21.
 */
export function resolveFrozenFeeCents(
  overrideCents: number | null | undefined,
  restaurantLat: number | null | undefined,
  restaurantLng: number | null | undefined,
  customerLat: number | null | undefined,
  customerLng: number | null | undefined,
): number {
  if (typeof overrideCents === "number" && Number.isFinite(overrideCents) && overrideCents >= 0) {
    return Math.round(overrideCents);
  }
  return feeCentsForDelivery(restaurantLat, restaurantLng, customerLat, customerLng);
}

/**
 * FeeFreeDelivery SERVICE AREA (Luigi 2026-07-14) — the in-house driver pool is
 * only offered to restaurants near the operation's home base (Milton / L9T, the
 * Greater Toronto Area), within 100 km. Restaurants outside this radius never see
 * the FeeFree option (they still get Own + ShipDay). ShipDay is a global
 * third-party network, so it isn't geo-gated.
 */
export const FEEFREE_SERVICE_ANCHOR = { lat: 43.5183, lng: -79.8774, label: "Milton, ON (L9T)" };
export const FEEFREE_SERVICE_RADIUS_KM = 100;

/** True if a restaurant at (lat,lng) is inside the FeeFree service area. A
 *  restaurant with no coordinates is treated as OUT (can't be placed → not
 *  offered). */
export function isFeeFreeServiceArea(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  return haversineKm(FEEFREE_SERVICE_ANCHOR.lat, FEEFREE_SERVICE_ANCHOR.lng, lat, lng) <= FEEFREE_SERVICE_RADIUS_KM;
}

/**
 * FeeFreeDelivery BILLING WEEK (Luigi 2026-07-24): Saturday 00:00 → Friday
 * 23:59:59.999, anchored to **America/Toronto** wall-clock (the whole operation
 * is Milton, ON). DST-aware — a week is 167h in spring, 169h in fall — computed
 * from the IANA zone via Intl, no external tz library. The old model was Monday
 * 00:00 *UTC*; every delivery reader now shares this Sat→Fri Toronto window so
 * driver earnings, restaurant statements, and payouts all date against one clock.
 */
export const DELIVERY_WEEK_TZ = "America/Toronto";

/** Local calendar date (in the delivery timezone) of an instant. */
function torontoCalendarDate(d: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: DELIVERY_WEEK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** Offset in minutes of America/Toronto at instant `d` (local = UTC + offset; Toronto is negative). */
function torontoOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: DELIVERY_WEEK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  const hour = Number(p.hour) % 24; // "24" (midnight) → 0
  const localAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return (localAsUtc - d.getTime()) / 60_000;
}

/** The UTC instant for a Toronto wall-clock time. Two-pass so DST edges resolve. */
function torontoWallClockToUtc(year: number, month: number, day: number, hh = 0, mm = 0, ss = 0): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, hh, mm, ss);
  const off1 = torontoOffsetMinutes(new Date(localAsUtc));
  let utc = localAsUtc - off1 * 60_000;
  const off2 = torontoOffsetMinutes(new Date(utc));
  if (off2 !== off1) utc = localAsUtc - off2 * 60_000;
  return new Date(utc);
}

/** First instant (UTC) of the Saturday→Friday Toronto week that contains `d`. */
export function deliveryWeekStart(d: Date): Date {
  const { year, month, day } = torontoCalendarDate(d);
  // Day-of-week of a calendar date is timezone-independent when built from its parts.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceSat = (dow + 1) % 7; // Sat→0, Sun→1 … Fri→6
  const cal = new Date(Date.UTC(year, month - 1, day));
  cal.setUTCDate(cal.getUTCDate() - daysSinceSat);
  return torontoWallClockToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
}

/** First instant (UTC) of the delivery week BEFORE the one that contains `d`. */
export function previousDeliveryWeekStart(d: Date): Date {
  const { year, month, day } = torontoCalendarDate(deliveryWeekStart(d));
  const cal = new Date(Date.UTC(year, month - 1, day));
  cal.setUTCDate(cal.getUTCDate() - 7);
  return torontoWallClockToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
}

/** Exclusive end (UTC) of the delivery week starting at `weekStart` — next Saturday 00:00 Toronto. */
export function deliveryWeekEnd(weekStart: Date): Date {
  const { year, month, day } = torontoCalendarDate(weekStart);
  const cal = new Date(Date.UTC(year, month - 1, day));
  cal.setUTCDate(cal.getUTCDate() + 7);
  return torontoWallClockToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
}
