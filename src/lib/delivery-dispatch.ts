/**
 * Delivery dispatch — ONE funnel for "route this delivery order to a courier",
 * branching by provider (2026-07-13). Wraps the existing ShipDay path and adds
 * our in-house FeeFreeDelivery pool, sharing the provider-agnostic dispatch
 * guards so the two can't drift. Called from the order-accept hook and the
 * manual admin "send" button.
 */
import prisma from "@/lib/db";
import { dispatchOrderNow } from "@/lib/shipday-dispatch";
import { shouldDispatchToShipday } from "@/lib/shipday";

export type DeliveryProvider = "own" | "shipday" | "feefree";

/**
 * Which provider handles this restaurant's delivery dispatch. FeeFree (our own
 * driver pool) takes precedence when its config is enabled; else ShipDay when
 * configured; else "own" (the restaurant handles delivery off-platform, as today
 * — no courier is dispatched).
 */
export async function resolveDeliveryProvider(restaurantId: string): Promise<DeliveryProvider> {
  const cfg = await prisma.feeFreeDeliveryConfig.findUnique({
    where: { restaurantId },
    select: { enabled: true },
  });
  if (cfg?.enabled) return "feefree";
  if (await shouldDispatchToShipday(restaurantId)) return "shipday";
  return "own";
}

/** The order fields the dispatch guards read. */
export type DispatchableOrder = {
  type: string;
  status: string;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryZip: string | null;
  paymentStatus: string;
  total: number;
  creditApplied: number | null;
  restaurant: { address: string | null; city: string | null; state: string | null; zip: string | null };
};

export type DispatchGuard =
  | { ok: true; customerAddress: string; restaurantAddress: string }
  | { ok: false; skipped: "not_delivery" | "order_dead" | "missing_address" | "not_prepaid" };

/**
 * Provider-agnostic "may we hand this order to a courier?" guards — shared by
 * ShipDay and FeeFree so the rules can't drift. Mirrors the historical
 * accept-path block: delivery type, a live (accepted/preparing/ready) status,
 * both addresses present, and PREPAID (a driver only picks up + drops off, so an
 * unpaid order would be uncollectable — "prepaid" = online charge captured OR
 * store credit covering the whole total). Returns the composed addresses on OK.
 */
export function assertDispatchable(o: DispatchableOrder): DispatchGuard {
  if (o.type !== "delivery") return { ok: false, skipped: "not_delivery" };
  if (!["accepted", "preparing", "ready"].includes(o.status)) return { ok: false, skipped: "order_dead" };
  const customerAddress = [o.deliveryAddress, o.deliveryCity, o.deliveryZip].filter(Boolean).join(", ");
  const restaurantAddress = [o.restaurant.address, o.restaurant.city, o.restaurant.state, o.restaurant.zip].filter(Boolean).join(", ");
  if (!customerAddress || !restaurantAddress) return { ok: false, skipped: "missing_address" };
  const fullyPrepaid = o.paymentStatus === "paid" || o.total - (o.creditApplied ?? 0) <= 0.009;
  if (!fullyPrepaid) return { ok: false, skipped: "not_prepaid" };
  return { ok: true, customerAddress, restaurantAddress };
}

export type DeliveryDispatchResult =
  | { ok: true; provider: DeliveryProvider; assignmentId?: string; shipdayOrderId?: string }
  | { ok: false; provider: DeliveryProvider; skipped?: string; error?: string };

/**
 * Create a QUEUED DeliveryAssignment for our own driver pool. Idempotent — a
 * second call (retry / duplicate accept) returns the existing assignment rather
 * than double-queuing. Prepaid-only via assertDispatchable (MVP restriction —
 * FeeFree drivers never collect cash).
 */
export async function assignToFeeFreeDriver(orderId: string): Promise<DeliveryDispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, restaurantId: true, type: true, status: true,
      deliveryAddress: true, deliveryCity: true, deliveryZip: true,
      paymentStatus: true, total: true, creditApplied: true,
      restaurant: { select: { address: true, city: true, state: true, zip: true } },
      deliveryAssignment: { select: { id: true } },
    },
  });
  if (!order) return { ok: false, provider: "feefree", skipped: "not_found" };
  if (order.deliveryAssignment) return { ok: true, provider: "feefree", assignmentId: order.deliveryAssignment.id };
  const guard = assertDispatchable(order);
  if (!guard.ok) return { ok: false, provider: "feefree", skipped: guard.skipped };
  const assignment = await prisma.deliveryAssignment.create({
    data: { orderId: order.id, restaurantId: order.restaurantId, status: "queued" },
  });
  return { ok: true, provider: "feefree", assignmentId: assignment.id };
}

/**
 * Route a delivery order to its provider. Every accept + manual retry converges
 * here (the analog of dispatchOrderNow, one level up). ShipDay keeps its exact
 * existing path; FeeFree queues an assignment; "own" is a no-op.
 */
export async function dispatchDeliveryNow(orderId: string): Promise<DeliveryDispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, restaurantId: true, type: true },
  });
  if (!order) return { ok: false, provider: "own", skipped: "not_found" };
  if (order.type !== "delivery") return { ok: false, provider: "own", skipped: "not_delivery" };

  const provider = await resolveDeliveryProvider(order.restaurantId);
  if (provider === "feefree") return assignToFeeFreeDriver(orderId);
  if (provider === "shipday") {
    const r = await dispatchOrderNow(orderId);
    return r.ok
      ? { ok: true, provider, shipdayOrderId: r.shipdayOrderId }
      : { ok: false, provider, skipped: r.skipped, error: r.error };
  }
  // "own" — restaurant handles delivery off-platform; nothing to dispatch.
  return { ok: false, provider: "own", skipped: "provider_own" };
}
