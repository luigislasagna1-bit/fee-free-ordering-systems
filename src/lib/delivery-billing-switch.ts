/**
 * MASTER KILL-SWITCH for FeeFreeDelivery restaurant billing (Luigi, 2026-07-23).
 *
 * Its own module — one line, no imports — so it can be read from anywhere without
 * dragging in Stripe/Prisma, and so tests can mock it without mocking the engine.
 *
 * Luigi's instruction: "we should not automatically bill anyone yet for these
 * services… leave it running if it's set up correctly and the charges are coming
 * and going to the correct people/company… if it's incorrect disable it and fix
 * it but re-enable it after it's all set up correctly."
 *
 * It bills the RIGHT party (restaurant → Fee Free) but is NOT correct yet:
 *   1. Week is Mon 00:00 UTC — the agreed billing week is Sat→Fri America/Toronto.
 *   2. The invoice covers ONLY the per-delivery platform fee. The agreed model is
 *      that fee PLUS the driver tips the restaurant collected on the driver's behalf.
 *   3. Tips have no driver attribution at all today: Order.tip lands 100% in the
 *      restaurant's own Stripe account and is never linked to a DeliveryAssignment,
 *      so the tip half of the bill is currently uncomputable.
 *
 * While false: no settlement rows, no invoice items, no charges. Delivered
 * assignments stay unsettled (settlementId: null) and keep accruing, so the
 * "owed this week" figure in the ops UI is unaffected and no data is lost.
 *
 * Flip to true ONLY once the Sat→Fri week and driver-tip pass-through are live
 * and Luigi has confirmed the first real invoice preview.
 */
export const DELIVERY_BILLING_ENABLED = false;
