import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * Setup-mode Checkout completion handler.
 *
 * When a restaurant goes through the /api/admin/billing/setup-card flow,
 * Stripe Checkout in setup mode collects a card and attaches it to the
 * customer, but does NOT set it as the default payment method for
 * future invoices. We have to do that step manually here.
 *
 * Without setting it as default, the next marketplace settlement
 * invoice would land in "open" state instead of auto-charging — which
 * defeats the whole point of asking for a card up front.
 *
 * Fires from BOTH `checkout.session.completed` (setup mode) and
 * `setup_intent.succeeded` for redundancy. The customer.update call
 * is idempotent so double-firing is harmless.
 */

export async function handleSetupIntentCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "setup") return;
  const setupIntentId = typeof session.setup_intent === "string"
    ? session.setup_intent
    : session.setup_intent?.id;
  if (!setupIntentId) return;
  await applyDefaultPaymentMethod(setupIntentId);
}

export async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): Promise<void> {
  await applyDefaultPaymentMethod(setupIntent.id);
}

async function applyDefaultPaymentMethod(setupIntentId: string): Promise<void> {
  const stripe = await getStripe();
  const si = await stripe.setupIntents.retrieve(setupIntentId);

  if (si.status !== "succeeded") {
    // Card was provided but the SetupIntent didn't actually succeed
    // (e.g. 3DS failed). Don't set as default.
    return;
  }

  const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
  const paymentMethodId =
    typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    console.warn(`[setup-intent] missing customer or payment method on ${setupIntentId}`);
    return;
  }

  // Idempotent: setting the same default again is a no-op for Stripe.
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}
