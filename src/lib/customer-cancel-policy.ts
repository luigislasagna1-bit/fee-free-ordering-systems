/**
 * WHEN does a confirmation email carry a guest cancel link? (Fabrizio
 * cms0idtz7; Luigi 2026-07-28 chose `closed_only`.)
 *
 *   closed_only  (default) — only orders placed while the restaurant was
 *                CLOSED get the emailed cancel link (GloriaFood's "cancel your
 *                order for later"). While open, the customer can simply call.
 *   all_pending — every confirmation email carries the link (it's only
 *                 actionable while the order is still `pending` server-side).
 *
 * This policy governs LINK VISIBILITY only. The cancel API's gate stays
 * `status === "pending"` for every auth path — signed-in customers could
 * already cancel any pending order, and narrowing that would be a regression.
 * Flipping scope later = set CUSTOMER_CANCEL_EMAIL_SCOPE, no code change.
 */
export type CancelEmailScope = "closed_only" | "all_pending";

export function cancelEmailScope(): CancelEmailScope {
  return process.env.CUSTOMER_CANCEL_EMAIL_SCOPE === "all_pending" ? "all_pending" : "closed_only";
}

export function shouldOfferEmailCancel(opts: { placedWhileClosed: boolean }): boolean {
  return cancelEmailScope() === "all_pending" ? true : opts.placedWhileClosed;
}
