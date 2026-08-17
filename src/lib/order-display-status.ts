/**
 * The ONE answer to "what should a human be told this order's state is?"
 *
 * ── Why this exists (Luigi 2026-08-17) ───────────────────────────────────────
 * `Order.status` carries two different meanings for an online-payment order, and
 * the admin Orders list was showing the wrong one.
 *
 * When `restaurant.autoAcceptOrders` is on, /api/orders stamps EVERY new order
 * `status: "accepted"` at CREATE — including a card/PayPal order whose payment
 * hasn't happened yet. For those, `status: "accepted"` does not mean "the
 * restaurant accepted this"; it means "auto-accept will apply once the money
 * lands". The RELEASE flag is `notifiedAt`, deliberately left null until the
 * payment settles (see the deferKitchenRelease block in /api/orders/route.ts),
 * which is what keeps the kitchen display, the ticket printer, the courier
 * dispatch and the confirmation emails away from an unpaid order.
 *
 * The kitchen was therefore always safe. The admin Orders list was not: it
 * rendered the raw `status`, so a customer who opened checkout, changed their
 * mind and rebuilt their cart left behind rows that read "Accepted · $33.30 ·
 * Card" — visually identical to a real, paid, cooking order. Luigi hit exactly
 * this on 2026-08-17 (ORD-599530704, ORD-906017021 abandoned; ORD-459250906 the
 * one they actually paid) and reasonably read his own screen as "orders are
 * being accepted without payment".
 *
 * So: the machinery keeps using `status` (every capture / dispatch / accept path
 * keys off `status === "accepted"` meaning auto-accept — do NOT change that),
 * and every HUMAN-FACING surface asks this module instead. One helper, so the
 * Orders list and the order detail page can never drift apart.
 *
 * NOT a security control — it decides labels, nothing else. The real gate is
 * `notifiedAt`, enforced in the kitchen queries.
 */

/** Payment states that mean "the online payment has not settled". Mirrors
 *  UNRESOLVED in reconcile-card-payments.ts, plus "failed" (a declined card the
 *  webhook flipped) — both are swept up by the 30-minute abandoned-payment
 *  cancel in auto-reject-orders.ts. "voided" is deliberately absent: that order
 *  is already dead and reads correctly as cancelled/rejected. */
const UNSETTLED_PAYMENT = new Set(["pending", "requires_action", "processing", "failed"]);

/** Methods where the money arrives through an online flow the customer can walk
 *  away from mid-way. Cash / pay-in-person never defer release, so they are
 *  never "awaiting payment" in this sense. */
const ONLINE_PAYMENT_METHODS = new Set(["card", "paypal"]);

/** Synthetic display status. Never written to the database. */
export const AWAITING_PAYMENT = "awaiting_payment";

/** The minimum an order has to expose for us to judge it. */
export type OrderPaymentShape = {
  status: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  /** THE release flag. Set ⇒ the kitchen has this order ⇒ never "awaiting". */
  notifiedAt: Date | string | null;
};

/**
 * True when the customer started an online checkout and never finished it, so
 * the order exists in the database but was never released to anyone.
 *
 * Scoped to live rows (`pending` / `accepted`) on purpose. A `completed` +
 * unpaid + never-released row is the separate, pre-existing class of phantom
 * left by the auto-complete bug (fixed 2026-08-11); the reconcile cron reports
 * those for a staff decision and relabelling them here would suggest they can
 * still be cancelled, which is not true — the restaurant may already have made
 * and handed over that food.
 */
export function isAwaitingPayment(order: OrderPaymentShape): boolean {
  if (order.notifiedAt) return false;
  if (!ONLINE_PAYMENT_METHODS.has(order.paymentMethod ?? "")) return false;
  if (!UNSETTLED_PAYMENT.has(order.paymentStatus ?? "")) return false;
  return order.status === "pending" || order.status === "accepted";
}

/**
 * The status string to LABEL and FILTER by. Returns `AWAITING_PAYMENT` for an
 * unfinished online checkout, otherwise the row's real status unchanged.
 */
export function orderDisplayStatus(order: OrderPaymentShape): string {
  return isAwaitingPayment(order) ? AWAITING_PAYMENT : order.status;
}
