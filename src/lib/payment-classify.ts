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
 */
export function isOnlineCapturedPayment(
  paymentMethod: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  return (
    (paymentMethod === "card" || paymentMethod === "paypal" || paymentMethod === "reward_credit") &&
    paymentStatus === "paid"
  );
}
