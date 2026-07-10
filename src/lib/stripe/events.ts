/**
 * Stripe webhook event dispatcher.
 *
 * Routes incoming events to per-domain handlers and provides idempotency
 * via the StripeWebhookEvent table — if Stripe retries an event we've
 * already processed, we no-op.
 *
 * Each handler is small and side-effect-isolated so we can unit-test them
 * (and reason about their database writes) one at a time.
 */

import type Stripe from "stripe";
import prisma from "@/lib/db";

import { handleSubscriptionEvent } from "./events/subscription";
import { handleInvoiceEvent } from "./events/invoice";
import { handleAccountEvent } from "./events/account";
import { handlePaymentIntentEvent } from "./events/payment-intent";
import { handleChargeEvent } from "./events/charge";
import { handleSetupIntentCompleted, handleSetupIntentSucceeded } from "./events/setup-intent";

/**
 * Top-level dispatcher. Called from the webhook route AFTER signature
 * verification. Logs every event to StripeWebhookEvent, short-circuits if
 * already-processed (idempotency), routes by event.type.
 */
export async function dispatchStripeEvent(event: Stripe.Event): Promise<{
  status: "processed" | "skipped_duplicate" | "ignored" | "failed";
  message?: string;
}> {
  // 1+2. ATOMIC claim-first (mirrors the PayPal webhook, but STATUS-GATED):
  // the INSERT itself is the mutex, closing the create-vs-create race the
  // old findUnique-then-create had (loser used to 500 on P2002). On P2002 we
  // re-read the row and only dedup when it actually finished ("processed" /
  // "ignored"); a row stuck in "received"/"failed" means the earlier attempt
  // died mid-handler — Stripe's retry must REPROCESS it, not get swallowed
  // (Stripe webhooks are authoritative here, unlike PayPal's best-effort
  // backups whose claim is deliberately status-blind). LIMITS, stated
  // honestly: a retry arriving while the first attempt is STILL RUNNING sees
  // "received" and runs the handlers concurrently — per-handler idempotency
  // is the real guarantee there. And a row finalized "ignored" dedups
  // forever: if we later ship a handler for that event type, a manual
  // dashboard RESEND of an old event is suppressed until the ops recovery
  // (delete its StripeWebhookEvent row) is applied.
  let log;
  try {
    log = await prisma.stripeWebhookEvent.create({
      data: { stripeEventId: event.id, eventType: event.type, status: "received" },
    });
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (!existing) throw e; // claimed then deleted — shouldn't happen; let Stripe retry
    if (existing.status === "processed" || existing.status === "ignored") {
      return { status: "skipped_duplicate", message: "already processed" };
    }
    log = existing; // received/failed → reprocess on this delivery
  }

  // 3. Route by event.type. Each handler returns a verb describing what it did.
  //    Unrecognised events fall through to "ignored" — Stripe still gets 200
  //    so they don't pile up in retry queues.
  try {
    let outcome: "processed" | "ignored" = "ignored";
    if (event.type.startsWith("customer.subscription.")) {
      await handleSubscriptionEvent(event);
      outcome = "processed";
    } else if (event.type.startsWith("invoice.")) {
      await handleInvoiceEvent(event);
      outcome = "processed";
    } else if (event.type.startsWith("account.")) {
      await handleAccountEvent(event);
      outcome = "processed";
    } else if (event.type.startsWith("payment_intent.")) {
      await handlePaymentIntentEvent(event);
      outcome = "processed";
    } else if (event.type.startsWith("charge.")) {
      await handleChargeEvent(event);
      outcome = "processed";
    } else if (event.type === "checkout.session.completed") {
      // Subscription Checkout → customer.subscription.created + invoice.paid
      // downstream which we handle separately. Setup mode is the exception —
      // it doesn't trigger those events, so we need to handle it here to
      // attach the collected card as the customer's default payment method.
      const session = event.data.object as any;
      if (session.mode === "setup" && session.setup_intent) {
        await handleSetupIntentCompleted(session);
        outcome = "processed";
      } else {
        outcome = "ignored";
      }
    } else if (event.type === "setup_intent.succeeded") {
      // Belt-and-suspenders: Stripe also fires setup_intent.succeeded
      // alongside checkout.session.completed for setup-mode sessions.
      // The default-PM set is idempotent, so handling both is safe.
      await handleSetupIntentSucceeded(event.data.object as any);
      outcome = "processed";
    }

    await prisma.stripeWebhookEvent.update({
      where: { id: log.id },
      data: { status: outcome, processedAt: new Date() },
    });
    return { status: outcome };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error(`[stripe webhook] ${event.type} (${event.id}):`, msg);
    await prisma.stripeWebhookEvent.update({
      where: { id: log.id },
      data: { status: "failed", errorMessage: msg.slice(0, 500), processedAt: new Date() },
    });
    // Re-throw so the route returns 500 and Stripe retries with backoff.
    throw err;
  }
}
