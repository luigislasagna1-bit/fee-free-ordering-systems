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
import { isFeeFreeServiceArea } from "@/lib/feefree-delivery";

export type DeliveryProvider = "own" | "shipday" | "feefree";

/**
 * Which provider the admin chooser should DISPLAY as active, from already-loaded
 * config values. Pure — mirrors the runtime precedence (feefree > shipday > own)
 * including the legacy `deliverySource="both"` case, where the kitchen's
 * mid-shift toggle (`activeDispatchMode`) decides whether orders actually go to
 * ShipDay: "both"+"own" must display OWN, not ShipDay (fixed 2026-07-22 — the
 * chooser previously showed any non-"own" source as ShipDay-active even when
 * nothing was dispatching there).
 */
export function displayDeliveryProvider(
  feefreeEnabled: boolean,
  deliverySource: string,
  activeDispatchMode: string,
): DeliveryProvider {
  if (feefreeEnabled) return "feefree";
  if (deliverySource === "shipday") return "shipday";
  if (deliverySource === "both" && activeDispatchMode === "shipday") return "shipday";
  return "own";
}

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
  if (cfg?.enabled) {
    // FeeFree is geo-gated to its service area (≤100km of the home base). Only
    // route here when the restaurant is actually in range — defensive: the enable
    // API blocks out-of-area restaurants, but never dispatch to a pool we don't
    // serve. Out of area → fall through to ShipDay/own.
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { lat: true, lng: true } });
    if (isFeeFreeServiceArea(r?.lat, r?.lng)) return "feefree";
  }
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
 *
 * Honors FeeFreeDeliveryConfig.autoSend: when autoSend is OFF, the automatic
 * accept-hook path holds the order (skipped "manual_hold") instead of queuing —
 * the owner sends it later from /admin/delivery. `opts.force` is the manual
 * "Send to driver" button, which queues regardless of autoSend.
 */
export async function assignToFeeFreeDriver(
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<DeliveryDispatchResult> {
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

  // Manual-dispatch hold: the accept hook (force=false) defers to the owner's
  // autoSend preference, which is MANUAL by default (Luigi 2026-07-14) — a new
  // order should NOT auto-fly to a driver. It only auto-queues when the owner has
  // explicitly turned Auto-send ON. The manual "Send to driver" button passes
  // force=true and always queues.
  if (!opts.force) {
    const cfg = await prisma.feeFreeDeliveryConfig.findUnique({
      where: { restaurantId: order.restaurantId },
      select: { autoSend: true },
    });
    if (!cfg?.autoSend) {
      return { ok: false, provider: "feefree", skipped: "manual_hold" };
    }
  }

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
