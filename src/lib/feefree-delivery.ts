/**
 * FeeFreeDelivery constants + weekly settlement boundaries (2026-07-13).
 * The billing week runs Monday 00:00 UTC → next Monday, mirroring the monthly
 * boundary helpers in marketplace-settlement.ts.
 */

/** Flat platform fee charged to the restaurant per DELIVERED order, in cents.
 *  Frozen onto DeliveryAssignment.platformFeeCents at delivery so a later price
 *  change never re-bills old deliveries. ($7.99 — vs ShipDay 10.99–12.99.) */
export const FEEFREE_DELIVERY_PER_ORDER_CENTS = 799;

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
