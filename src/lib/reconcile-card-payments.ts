/**
 * Server-side card-payment reconciliation — the safety net that makes a card
 * order's fate independent of the customer's browser.
 *
 * ── Why this exists (Luigi 2026-08-11) ────────────────────────────────────────
 * Under the KEY-ONLY model the restaurant's Stripe account webhooks THEIR OWN
 * endpoints, never ours. So the only thing that ever moved a card order from
 * "paid" to "the kitchen can see it" was `verifyAndReleaseOrderPayment()` firing
 * when the customer's browser rendered the confirmation page after Stripe's
 * redirect.
 *
 * That made the customer's browser a single point of failure for the whole
 * order. Every one of these lost the order outright:
 *   • customer closes the tab on the "thanks" redirect
 *   • 3DS bounces them into a banking app and they never come back
 *   • an in-app browser (Instagram / Facebook / Messenger) drops the
 *     `?payment_intent=` query param on the return leg
 *   • phone loses signal between "Pay" and the redirect landing
 *   • the redirect lands but the render throws
 *
 * The order then sat with `notifiedAt: null` forever: kitchen never saw it, no
 * confirmation email, and — because auto-accept stamps card orders
 * status:"accepted" at create — the auto-complete cron eventually flipped it to
 * "completed", hiding it from every cleanup sweep. Meanwhile Stripe could be
 * holding a real authorization on the customer's card.
 *
 * Found live at Luigi's store: 36 stranded card orders in 60 days, 3 of them
 * ghosts the store never received (ORD-710341102 Sharon Craven $36.44,
 * ORD-733393825 Lisa Benacquista $34.39, ORD-721054168 Uzair Rana $12.79).
 * This is the behaviour GloriaFood has that we didn't: the server, not the
 * browser, decides an order is real.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 * RESCUE  — a still-live order (pending|accepted) that never released: ask
 *           Stripe what actually happened and, if the money is there, run the
 *           SAME release path the confirmation page runs (capture → notify
 *           kitchen → dispatch courier). Rescued within ~1 minute.
 * VOID    — an order already cancelled/rejected that still has a live
 *           authorization: release the hold so the customer's money goes back.
 *           The abandoned-payment sweep in auto-reject-orders.ts assumes "no
 *           money was ever moved" and never voided anything — true only because
 *           we'd lost the intent id. It isn't true in general.
 *
 * Idempotent and safe to run every minute. `fireOrderNotifications` claims
 * `notifiedAt` atomically, so a reconcile racing the customer's own
 * confirmation-page render can never double-notify or double-dispatch.
 */
import prisma from "@/lib/db";
import { getRestaurantStripe, voidPayment } from "@/lib/stripe";
import { verifyAndReleaseOrderPayment } from "@/lib/stripe/verify-order-payment";

/** Don't touch an order this young — the customer may still be typing their
 *  card in. Their own confirmation page handles the happy path in seconds;
 *  this cron only needs to catch the ones that never got there. */
const MIN_AGE_MS = 45 * 1000;
/** How far back to hunt for rescuable orders. Comfortably wider than the
 *  30-minute abandoned-payment window so a rescue always beats the cancel. */
const RESCUE_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Stripe authorizations expire after ~7 days; past that there's no hold left
 *  to release, so there's nothing for the void sweep to do. */
const VOID_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// NOTE: the metadata SEARCH fallback (for legacy rows with no stored intent id)
// needs no age cap of its own — RESCUE_WINDOW_MS already bounds the candidate
// set to the last 6 hours. An earlier 24h cap here was dead code, since nothing
// older than 6h can reach it. Caught in adversarial review, 2026-08-11.

const RESCUE_BATCH = 200;
const VOID_BATCH = 100;

/** Payment states that mean "not settled yet" — the ones worth asking Stripe
 *  about. "paid"/"refunded"/"voided" are terminal and never re-checked. */
const UNRESOLVED = ["pending", "requires_action", "processing", "authorized"];

export type ReconcileResult = {
  scannedRescue: number;
  /** Orders that Stripe confirmed were paid/authorized and that we released to
   *  the kitchen — food that would otherwise never have been cooked. */
  rescued: number;
  scannedVoid: number;
  /** Authorizations cancelled, returning held money to the customer. */
  voided: number;
  scannedRepair: number;
  /** Orders the kitchen was never told about and that were never paid, which
   *  the auto-complete bug left marked "completed". REPORTED ONLY — the
   *  restaurant may have fed the customer anyway, so cancelling or voiding is a
   *  human decision, never a cron's. */
  unpaidNeedingAttention: Array<{
    orderId: string;
    orderNumber: string;
    total: number;
    customerName: string;
    customerEmail: string | null;
    createdAt: string;
  }>;
  /** Intent ids recovered for legacy orders that had none stored. */
  intentsRecovered: number;
  errors: Array<{ orderId: string; reason: string }>;
};

/**
 * Find the PaymentIntent for an order that has none stored. Only used for rows
 * created before the payment-intent route started persisting the id. Stripe's
 * search index lags writes by up to a minute, which is fine — MIN_AGE_MS plus
 * the next cron tick covers it.
 */
async function findIntentIdByMetadata(
  restaurantId: string,
  orderId: string,
): Promise<string | null> {
  const rs = await getRestaurantStripe(restaurantId);
  if (!rs) return null;
  const found = await rs.client.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
    limit: 1,
  });
  return found.data[0]?.id ?? null;
}

export async function reconcileCardPayments(
  opts: { now?: Date; restaurantId?: string } = {},
): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const scopeRestaurant = opts.restaurantId ? { restaurantId: opts.restaurantId } : {};
  const result: ReconcileResult = {
    scannedRescue: 0, rescued: 0, scannedVoid: 0, voided: 0,
    scannedRepair: 0, unpaidNeedingAttention: [], intentsRecovered: 0, errors: [],
  };

  // ── RESCUE ────────────────────────────────────────────────────────────────
  // Still-live card orders that never made it to the kitchen. `notifiedAt: null`
  // is the whole point — an order with notifiedAt set was already released and
  // is none of our business.
  const rescuable = await prisma.order.findMany({
    where: {
      ...scopeRestaurant,
      paymentMethod: "card",
      notifiedAt: null,
      status: { in: ["pending", "accepted"] },
      paymentStatus: { in: UNRESOLVED },
      createdAt: {
        gte: new Date(now.getTime() - RESCUE_WINDOW_MS),
        lte: new Date(now.getTime() - MIN_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: RESCUE_BATCH,
    select: { id: true, restaurantId: true, paymentIntentId: true, createdAt: true, orderNumber: true },
  });
  result.scannedRescue = rescuable.length;

  for (const o of rescuable) {
    try {
      let intentId = o.paymentIntentId;
      if (!intentId) {
        intentId = await findIntentIdByMetadata(o.restaurantId, o.id);
        if (intentId) {
          // Persist what we recovered so the next pass (and any refund/void
          // later) doesn't have to search for it again.
          await prisma.order.updateMany({
            where: { id: o.id, paymentIntentId: null },
            data: { paymentIntentId: intentId },
          });
          result.intentsRecovered += 1;
        }
      }
      if (!intentId) continue; // customer never reached the card form — nothing to reconcile

      // Delegate to the ONE release path. It re-reads the order, re-validates
      // intent.metadata.orderId against it, refuses to touch a cancelled or
      // rejected order, captures when the order is auto-accepted, fires
      // notifications and dispatches the courier — all idempotently. Never fork
      // this logic; a second copy would drift.
      await verifyAndReleaseOrderPayment({ orderId: o.id, paymentIntentId: intentId });
      // The candidate query already required notifiedAt: null, so a single
      // re-read tells us whether WE released it — no "before" round-trip needed.
      const after = await prisma.order.findUnique({ where: { id: o.id }, select: { notifiedAt: true } });
      if (after?.notifiedAt) {
        result.rescued += 1;
        console.warn(
          `[reconcile-card-payments] RESCUED ${o.orderNumber} (${o.id}) — the customer paid but their browser never released the order. Check why the confirmation redirect was lost.`,
        );
      }
    } catch (e) {
      result.errors.push({ orderId: o.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── VOID ──────────────────────────────────────────────────────────────────
  // Dead orders (cancelled by the abandoned sweep, or rejected) that still
  // carry an authorization. Too late to cook the food; the right thing is to
  // stop holding the customer's money.
  const voidable = await prisma.order.findMany({
    where: {
      ...scopeRestaurant,
      paymentMethod: "card",
      notifiedAt: null,
      status: { in: ["cancelled", "rejected"] },
      paymentStatus: { in: UNRESOLVED },
      paymentIntentId: { not: null },
      createdAt: { gte: new Date(now.getTime() - VOID_WINDOW_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: VOID_BATCH,
    select: { id: true, restaurantId: true, paymentIntentId: true, orderNumber: true },
  });
  result.scannedVoid = voidable.length;

  for (const o of voidable) {
    try {
      const rs = await getRestaurantStripe(o.restaurantId);
      if (!rs) continue;
      const intent = await rs.client.paymentIntents.retrieve(o.paymentIntentId!);
      // Same ownership rule as verify-order-payment: never act on an intent
      // that doesn't claim this order.
      if (intent.metadata?.orderId !== o.id) continue;

      if (intent.status === "succeeded") {
        // Money was actually CAPTURED on a cancelled order. Voiding can't undo a
        // capture — this needs a refund decision, which is the restaurant's to
        // make, so surface it loudly rather than guessing.
        console.error(
          `[reconcile-card-payments] ORDER ${o.orderNumber} (${o.id}) was cancelled but its payment is CAPTURED (${intent.id}, ${intent.amount_received / 100} ${intent.currency}). Needs a manual refund.`,
        );
        result.errors.push({ orderId: o.id, reason: "cancelled order has a captured payment — manual refund needed" });
        continue;
      }

      if (intent.status === "canceled") {
        // Already dead at Stripe — just make our row agree so we stop re-checking.
        await prisma.order.updateMany({
          where: { id: o.id, paymentStatus: { in: UNRESOLVED } },
          data: { paymentStatus: "voided" },
        });
        continue;
      }

      // requires_capture (a real hold on the card), or an intent the customer
      // never completed. Cancelling is correct and terminal in both cases.
      // Snapshot first — cancelling mutates the intent's status, and only a
      // hold that was live counts as money actually returned to the customer.
      const heldRealMoney = intent.status === "requires_capture";
      await voidPayment({ paymentIntentId: intent.id, restaurantId: o.restaurantId });
      await prisma.order.updateMany({
        where: { id: o.id, paymentStatus: { in: UNRESOLVED } },
        data: { paymentStatus: "voided" },
      });
      if (heldRealMoney) {
        result.voided += 1;
        console.warn(
          `[reconcile-card-payments] VOIDED a live hold on cancelled order ${o.orderNumber} (${o.id}) — ${intent.amount / 100} ${intent.currency} released back to the customer.`,
        );
      }
    } catch (e) {
      result.errors.push({ orderId: o.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── FLAG ──────────────────────────────────────────────────────────────────
  // Fallout from the auto-complete bug (fixed in /api/cron/auto-complete-orders
  // the same day): that sweep matched on status alone, so an auto-accepted card
  // order still waiting on payment — born status:"accepted", notifiedAt:null —
  // was flipped to "completed" ~20 minutes after checkout. The row then matched
  // NOTHING that could clean it up: the abandoned-payment sweep only looks at
  // pending|accepted.
  //
  // We deliberately DO NOT touch these rows. The obvious "repair" — cancel it,
  // void the money, hand back the promo — is wrong, and Luigi caught it: the
  // restaurant may well have made the food anyway once the customer turned up
  // (Sharon Craven walked in and was served, ORD-710341102). Auto-cancelling
  // would have destroyed the restaurant's record of an order they'd fulfilled
  // and their ability to collect for it. Whether to chase payment or write it
  // off is the restaurant's call, not a cron's.
  //
  // So: surface them, loudly, and let staff decide via the "Request payment"
  // action on the order. Reporting only — no writes, no money moved.
  const unpaidPhantoms = await prisma.order.findMany({
    where: {
      ...scopeRestaurant,
      paymentMethod: { in: ["card", "paypal"] },
      notifiedAt: null,
      status: "completed",
      paymentStatus: { in: UNRESOLVED },
      createdAt: { gte: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
    },
    // Deterministic order — a bare take:50 leaves the DB free to return a
    // different 50 each run, so a phantom past the cap could hide forever.
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true, orderNumber: true, restaurantId: true, total: true,
      customerName: true, customerEmail: true, createdAt: true,
    },
  });
  result.scannedRepair = unpaidPhantoms.length;
  for (const o of unpaidPhantoms) {
    result.unpaidNeedingAttention.push({
      orderId: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      createdAt: o.createdAt.toISOString(),
    });
  }
  // ONE summary line, order numbers only. This sweep runs every 60 seconds and
  // its rows are sticky by design (nothing here mutates them), so a per-order
  // log would write the same customers' NAMES AND EMAIL ADDRESSES into the
  // platform logs 1,440 times a day, forever — a privacy leak dressed up as
  // observability, and it would drown the RESCUED/VOIDED lines that actually
  // need to be seen. The full detail is returned to the caller instead.
  // Caught in adversarial review, 2026-08-11.
  if (unpaidPhantoms.length > 0) {
    console.warn(
      `[reconcile-card-payments] ${unpaidPhantoms.length} unpaid order(s) the kitchen was never notified about, awaiting a staff decision: ${unpaidPhantoms.map((o) => o.orderNumber).join(", ")}`,
    );
  }

  return result;
}
