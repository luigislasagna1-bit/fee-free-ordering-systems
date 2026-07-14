/**
 * Shared delivery-completion core (2026-07-13). Extracted from the ShipDay
 * webhook (src/app/api/webhooks/shipday/route.ts) so BOTH ShipDay and our
 * in-house FeeFreeDelivery drivers finalize an order IDENTICALLY: the same
 * forward-only Order.status guard and the same five idempotent completion
 * ledger hooks. One funnel = the two providers can't drift; the hard-won
 * money-path fixes (2026-07-10 hardening) live in exactly one place.
 */
import prisma from "@/lib/db";
import { redeemCouponsForOrder } from "@/lib/coupon-ledger";
import { redeemForOrder as redeemRewardForOrder, awardForOrder as awardRewardForOrder } from "@/lib/reward-ledger";
import { awardEarnRulesForOrder, awardPromoCreditsForOrder } from "@/lib/reward-earn";

/** A terminal Order.status never moves again — delivery progress must never
 *  resurrect a cancelled / rejected / (refunded→cancelled) / completed order. */
export const DELIVERY_TERMINAL = new Set(["cancelled", "rejected", "completed"]);

/**
 * Apply a delivery status transition to an order + run completion side effects.
 * - FORWARD-ONLY: only advances Order.status when the order isn't terminal, so a
 *   late/replayed "delivered" can't flip a cancelled order back to completed.
 * - `extraUpdates` merges provider-specific columns into the SAME update (ShipDay
 *   passes shipdayStatus / shipdayOrderId; the in-house driver path passes none).
 * - On completion, runs the five idempotent, never-throw ledger hooks — the exact
 *   set the Simple-mode auto-complete cron runs — keyed off the TRANSLATED status
 *   (not the persisted one) so a crash-then-retry still finalizes exactly once.
 */
export async function applyDeliveryStatus(
  order: { id: string; status: string },
  opts: { orderStatus: string | null; extraUpdates?: Record<string, unknown> },
): Promise<void> {
  const updates: Record<string, unknown> = { ...(opts.extraUpdates ?? {}) };
  if (opts.orderStatus && !DELIVERY_TERMINAL.has(order.status)) {
    updates.status = opts.orderStatus;
    if (opts.orderStatus === "completed") updates.completedAt = new Date();
  }

  await prisma.order.update({ where: { id: order.id }, data: updates });

  if (opts.orderStatus === "completed") {
    await redeemCouponsForOrder(order.id);
    await redeemRewardForOrder(order.id);
    await awardRewardForOrder({ orderId: order.id });
    await awardEarnRulesForOrder({ orderId: order.id });
    await awardPromoCreditsForOrder({ orderId: order.id });
  }
}

/**
 * Map an in-house DeliveryAssignment status → Order.status (the FeeFree mirror of
 * translateShipdayEvent). Only pickup/on-the-way (→ ready) and delivered
 * (→ completed) move the order; queued / assigned / accepted / started / returned
 * / failed / cancelled are assignment-only and return null (no Order.status change).
 */
export function translateDriverEvent(assignmentStatus: string): { orderStatus: string | null } {
  switch (assignmentStatus) {
    case "picked_up":
    case "out_for_delivery":
      return { orderStatus: "ready" };
    case "delivered":
      return { orderStatus: "completed" };
    default:
      return { orderStatus: null };
  }
}
