import { after } from "next/server";
import prisma from "@/lib/db";
import { getRestaurantStripe, capturePayment } from "@/lib/stripe";
import { isStripeAlreadyCaptured } from "@/lib/capture-idempotency";
import { fireOrderNotifications } from "@/lib/order-notifications";
import { dispatchAcceptedOrderSafe } from "@/lib/delivery-dispatch";

/**
 * KEY-ONLY model replacement for the Stripe webhook.
 *
 * Under Stripe Connect, customer-payment state transitions
 * (pending → authorized → paid) were driven by webhooks the PLATFORM
 * received for events on connected accounts. In the key-only model the
 * restaurant uses their OWN Stripe account, which webhooks to THEIR OWN
 * endpoints — never to us. So we verify the PaymentIntent server-side
 * ourselves, using the restaurant's own secret key, at the moment the
 * customer lands back on the confirmation page after `confirmPayment`.
 *
 * This is the point where a card order is RELEASED TO THE KITCHEN
 * (fireOrderNotifications sets notifiedAt + fans out the new-order
 * alerts) — exactly mirroring the old `amount_capturable_updated`
 * webhook handler. Without this, card orders would never reach the
 * kitchen.
 *
 * Fully idempotent: safe to call on every confirmation-page render and
 * every status-page poll. Returns the resolved paymentStatus (or null
 * when nothing could be verified — caller should not treat that as an
 * error; the order simply stays where it was).
 *
 * Security: we NEVER trust the client-supplied `paymentIntentId` to
 * mutate an arbitrary order. We retrieve the intent from Stripe and
 * require `intent.metadata.orderId === orderId` before touching the row.
 */
export async function verifyAndReleaseOrderPayment(params: {
  orderId: string;
  /** The `payment_intent` query param Stripe appends to the return_url.
   *  Used only as a fallback when the order has no stored intent yet —
   *  always validated against the intent's own metadata.orderId. */
  paymentIntentId?: string | null;
}): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      restaurantId: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
      // Needed by the "money took, kitchen never told" self-heal below.
      notifiedAt: true,
    },
  });
  if (!order) return null;

  // Only card orders go through Stripe. Cash / pay-in-person never had a
  // PaymentIntent.
  if (order.paymentMethod !== "card") return order.paymentStatus;

  // ── A DEAD ORDER IS NEVER CAPTURED AND NEVER RELEASED ────────────────────
  // This is the one release path every caller shares (confirmation page, status
  // poll, reconcile cron), so the guard belongs here rather than in each of
  // them. Without it there's a live race: the reconciler reads a batch of
  // unreleased orders, the 10-minute abandoned-payment sweep cancels one of
  // them a moment later, and the reconciler then captures the card and sends a
  // cancelled order to the kitchen. Rejected orders are the same story from the
  // kitchen side. Any hold left behind is released by the reconciler's VOID
  // sweep within the minute. Caught in adversarial review, 2026-08-11.
  if (order.status === "cancelled" || order.status === "rejected") {
    return order.paymentStatus;
  }

  // ── SELF-HEAL: money settled but the order was never released ─────────────
  // Every early return below says "this payment is resolved, nothing to do".
  // That was only safe while resolving a payment and releasing the order were
  // one inseparable step — and they aren't. Both branches further down set
  // paymentStatus FIRST and call fireOrderNotifications AFTER, so anything that
  // kills the process in between (lambda timeout, a Resend hiccup thrown from
  // inside the fan-out, a deploy mid-request) leaves the order paid/authorized
  // with notifiedAt still null. Past that point EVERY later call — the customer
  // refreshing, the status poll, the reconcile cron — hit an early return and
  // gave up, so the kitchen could never learn about an order the customer had
  // genuinely paid for. That is the exact failure class this whole change
  // exists to make impossible, so close it here rather than trusting the
  // happy path to never be interrupted (Luigi 2026-08-11).
  //
  // fireOrderNotifications claims notifiedAt atomically, so this is safe to run
  // from any number of concurrent callers.
  //
  // "completed" is excluded: those are the phantom orders the auto-complete bug
  // left behind, and the restaurant has in all likelihood already made and
  // handed over that food. Releasing one now would print the kitchen a ticket
  // for a job finished days ago — the one outcome worse than the order having
  // been quiet. Their money is still collected (see the capture branch below).
  if (
    !order.notifiedAt &&
    order.status !== "completed" &&
    (order.paymentStatus === "paid" || order.paymentStatus === "authorized")
  ) {
    console.warn(
      `[verify-payment] order ${order.id} was ${order.paymentStatus} but never released — releasing now.`,
    );
    await fireOrderNotifications(order.id);
    if (order.status === "accepted") after(dispatchAcceptedOrderSafe(order.id));
  }

  // Terminal states — nothing left to verify.
  if (
    order.paymentStatus === "paid" ||
    order.paymentStatus === "refunded" ||
    order.paymentStatus === "voided"
  ) {
    return order.paymentStatus;
  }

  // "authorized" is normally terminal for verify — EXCEPT for an auto-accepted
  // order (status already "accepted"): the funds are only held, not captured,
  // and the capture must still happen here because the pending→accepted PATCH
  // that normally captures never runs for auto-accept. Letting accepted+
  // authorized fall through also lets a later poll RETRY a capture whose first
  // attempt failed. A normal (manually-accepted) authorized order early-returns
  // — its capture happens on the Accept PATCH. (LR-PAY-01 fix, 2026-07-10.)
  if (order.paymentStatus === "authorized" && order.status !== "accepted") {
    return "authorized";
  }

  const intentId = order.paymentIntentId || params.paymentIntentId || null;
  if (!intentId) return order.paymentStatus;

  const rs = await getRestaurantStripe(order.restaurantId);
  if (!rs) return order.paymentStatus;

  let intent;
  try {
    intent = await rs.client.paymentIntents.retrieve(intentId);
  } catch (e) {
    console.error(
      `[verify-payment] retrieve failed for order ${order.id}:`,
      e instanceof Error ? e.message : e,
    );
    return order.paymentStatus;
  }

  // Hard ownership check — the intent must belong to THIS order.
  if (intent.metadata?.orderId !== order.id) {
    console.warn(
      `[verify-payment] intent ${intent.id} metadata.orderId mismatch for order ${order.id} — ignoring`,
    );
    return order.paymentStatus;
  }

  switch (intent.status) {
    case "requires_capture": {
      // Authorized (manual-capture hold placed). Release to the kitchen.
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "authorized", paymentIntentId: intent.id },
      });
      // AUTO-ACCEPT: if the order is already "accepted", the pending→accepted
      // PATCH that normally captures never runs, so capture NOW or the
      // restaurant is never paid for food it will make (LR-PAY-01). Mirrors the
      // platform-webhook fix in events/payment-intent.ts. A capture FAILURE
      // must not block releasing the order to the kitchen — leave it
      // "authorized" (a later poll retries via the fall-through above);
      // isStripeAlreadyCaptured treats a mid-capture DB-write failure as done.
      // "completed" captures too, and this is NOT a nicety — it is the whole
      // point of leaving a phantom order payable. The confirmation page keeps a
      // status:"completed" order collectable on purpose (the auto-complete bug
      // left orders the restaurant may well have cooked and served anyway), but
      // every capture site in the codebase gated on status === "accepted", so
      // paying one placed a manual-capture HOLD that nothing would ever capture:
      // the money sat on the customer's card for ~7 days and then silently
      // released, the restaurant was paid nothing, and — because the release
      // stamped notifiedAt — the order also dropped out of the reconcile cron's
      // "unpaid, needs attention" report, so nobody would ever have noticed.
      // Caught in adversarial review, 2026-08-12.
      const captureNow = order.status === "accepted" || order.status === "completed";
      // A completed order's food was made and handed over long ago. Capturing
      // its money is right; printing the kitchen a fresh ticket for it is not —
      // that is how a restaurant cooks the same order twice. So the release
      // side-effects below stay tied to "accepted".
      const releaseToKitchen = order.status === "accepted";
      if (captureNow) {
        try {
          await capturePayment({ paymentIntentId: intent.id, restaurantId: order.restaurantId });
          await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
          if (!releaseToKitchen) {
            console.warn(
              `[verify-payment] captured ${intent.id} for COMPLETED order ${order.id} — paid after the fact, deliberately not re-sent to the kitchen.`,
            );
            return "paid";
          }
          await fireOrderNotifications(order.id);
          // AUTO-ACCEPT DISPATCH (2026-08-10): under the key-only model THIS is
          // the moment an auto-accepted card order becomes accepted + paid —
          // the platform webhook never fires, so the dispatch wire in
          // events/payment-intent.ts is dormant here. Without this call, every
          // auto-accepted card delivery waited for the dispatch-watchdog
          // (found live: both of Luigi's 2026-08-10 lunch orders reached
          // ShipDay 10-20 min late via RESCUED sweeps). after(): don't add a
          // courier-API roundtrip to the customer's confirmation page.
          after(dispatchAcceptedOrderSafe(order.id));
          return "paid";
        } catch (e) {
          if (isStripeAlreadyCaptured(e)) {
            await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
            if (!releaseToKitchen) return "paid";
            await fireOrderNotifications(order.id);
            after(dispatchAcceptedOrderSafe(order.id));
            return "paid";
          }
          console.error(
            `[verify-payment] auto-accept capture failed for order ${order.id} — left authorized for retry:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }
      // Everything else still releases here — an ordinary pending card order
      // reaches the kitchen on exactly this line. Only "completed" is held back,
      // because its food was already made.
      if (order.status !== "completed") await fireOrderNotifications(order.id);
      return "authorized";
    }
    case "succeeded": {
      // Already captured (shouldn't happen pre-accept, but handle it).
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "paid", paymentIntentId: intent.id },
      });
      // A completed order that turns out to be captured is money correctly
      // collected on food already served — record it, but don't hand the
      // kitchen a ticket for a job it finished days ago.
      if (order.status !== "completed") await fireOrderNotifications(order.id);
      // Accepted + captured: make sure the courier isn't forgotten on this
      // path either. dispatchOrderNow's atomic claim makes a duplicate call
      // race-safe (skipped "already_dispatched").
      if (order.status === "accepted") {
        after(dispatchAcceptedOrderSafe(order.id));
      }
      return "paid";
    }
    case "requires_action": {
      if (order.paymentStatus === "pending") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "requires_action", paymentIntentId: intent.id },
        });
        return "requires_action";
      }
      return order.paymentStatus;
    }
    case "processing": {
      if (order.paymentStatus === "pending" || order.paymentStatus === "requires_action") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "processing", paymentIntentId: intent.id },
        });
        return "processing";
      }
      return order.paymentStatus;
    }
    case "canceled": {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "voided" },
      });
      return "voided";
    }
    default:
      // requires_payment_method / requires_confirmation — customer hasn't
      // finished paying. Leave the order where it is.
      return order.paymentStatus;
  }
}
