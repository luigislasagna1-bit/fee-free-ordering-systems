/**
 * FeeFreeDelivery constants + weekly settlement boundaries (2026-07-13).
 * The billing week runs Monday 00:00 UTC → next Monday, mirroring the monthly
 * boundary helpers in marketplace-settlement.ts.
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

/** First moment (UTC) of the Monday-anchored week that contains `d`. */
export function weekStartUtc(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Mon→0 … Sun→6
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCDate(base.getUTCDate() - daysSinceMonday);
  return base;
}

/** First moment (UTC) of the week BEFORE the one that contains `d`. */
export function previousWeekStartUtc(d: Date): Date {
  const ws = weekStartUtc(d);
  ws.setUTCDate(ws.getUTCDate() - 7);
  return ws;
}

/** Exclusive end of the week that starts at `weekStart` (the next Monday). */
export function weekEndUtc(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}
