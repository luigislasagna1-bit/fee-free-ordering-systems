/**
 * ONE definition of "this order's money was captured online" for reporting
 * (EOD modal, printed EOD slip, digest emails via src/lib/digests.ts).
 * PURE — no prisma import, so vitest can pin the classification.
 *
 * Online = the platform already holds the money before handoff: Stripe card,
 * PayPal, or an order fully covered by store credit (reward_credit — nothing
 * to collect at the counter). Anything else (cash, card_in_person, unpaid) is
 * offline/till money. PayPal was misclassified as Offline until 2026-07-11,
 * overstating the owner's cash reconciliation by every PayPal order.
 *
 * Refunded statuses stay ONLINE: "partially_refunded"/"refunded" mean the
 * money WAS captured online and then (partly) sent back — until 2026-07-31 a
 * partial refund silently moved the whole order into the Offline bucket
 * (Fabrizio cms0gyexp #14: an €86.40 card order showed as till cash after a
 * €20 refund). The refund itself is netted out by the aggregator, not here.
 */
export function isOnlineCapturedPayment(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  return (
    (paymentMethod === "card" || paymentMethod === "paypal" || paymentMethod === "reward_credit") &&
    (paymentStatus === "paid" || paymentStatus === "partially_refunded" || paymentStatus === "refunded")
  );
}
