import type Stripe from "stripe";
import prisma from "@/lib/db";
import { sendBillingNotificationEmail } from "@/lib/email";
import { recordCommissionForInvoice } from "@/lib/commission";
import { startRestaurantGrace, clearRestaurantGrace, GRACE_DAYS } from "@/lib/dunning";

/**
 * Handle invoice.* events for the platform subscription billing (Layer B).
 *
 * Stripe sends:
 *   - invoice.paid              (successful charge → extend currentPeriodEnd, status=active)
 *   - invoice.payment_failed    (failed charge → status=past_due, email owner)
 *   - invoice.payment_action_required (3DS / SCA required → email auth link)
 *   - invoice.finalized         (invoice issued; usually quiet)
 *   - invoice.created           (draft created; usually quiet)
 *
 * Every event logs to the SubscriptionInvoice table for audit trail and
 * cross-references the restaurant by stripeCustomerId.
 */
export async function handleInvoiceEvent(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const restaurant = await prisma.restaurant.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, email: true, name: true },
  });
  if (!restaurant) {
    console.warn(`[stripe] invoice event for unknown customer ${customerId}`);
    return;
  }

  // Upsert the invoice row regardless of event type (audit trail).
  // Subscription ID can live in different places depending on API version.
  const invAny = invoice as any;
  const subscriptionId: string | null =
    typeof invAny.subscription === "string"
      ? invAny.subscription
      : invAny.subscription?.id ?? invAny.parent?.subscription_details?.subscription ?? null;
  const upserted = await prisma.subscriptionInvoice.upsert({
    where: { stripeInvoiceId: invoice.id! },
    update: {
      status: invoice.status ?? "open",
      amountPaid: invoice.amount_paid,
      amountDue: invoice.amount_due,
      paidAt: invoice.status === "paid" && invAny.status_transitions?.paid_at
        ? new Date(invAny.status_transitions.paid_at * 1000)
        : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      attemptCount: invoice.attempt_count ?? 0,
    },
    create: {
      restaurantId: restaurant.id,
      stripeInvoiceId: invoice.id!,
      stripeSubscriptionId: subscriptionId,
      amountPaid: invoice.amount_paid,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status ?? "open",
      paidAt: invoice.status === "paid" && invAny.status_transitions?.paid_at
        ? new Date(invAny.status_transitions.paid_at * 1000)
        : null,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdfUrl: invoice.invoice_pdf ?? null,
      attemptCount: invoice.attempt_count ?? 0,
    },
  });

  // Marketplace settlement invoices are NOT subscription renewals — they
  // come from our monthly settlement cron and have metadata.type set to
  // "marketplace_settlement". Handle them separately: flip the settlement
  // row's status and short-circuit before the subscription-renewal logic
  // runs (so we don't accidentally extend currentPeriodEnd on a one-off
  // settlement charge).
  const meta = (invoice.metadata ?? {}) as Record<string, string>;
  if (meta.type === "marketplace_settlement" && meta.settlementId) {
    // NOTE: the `await` here already blocks the handler — the trailing
    // .catch was redundant for Vercel-lifecycle purposes, but switching
    // to try/catch makes the error visible in logs (the original silent
    // .catch(()=>{}) on the payment_failed branch was the real bug).
    if (event.type === "invoice.paid") {
      try {
        await prisma.marketplaceSettlement.update({
          where: { id: meta.settlementId },
          data: { status: "paid" },
        });
      } catch (e) {
        console.error(`[stripe] marketplace_settlement paid: failed to update row ${meta.settlementId}`, e);
      }
    } else if (event.type === "invoice.payment_failed") {
      try {
        await prisma.marketplaceSettlement.update({
          where: { id: meta.settlementId },
          data: { status: "failed", failureReason: "Stripe charge failed" },
        });
      } catch (e) {
        console.error(`[stripe] marketplace_settlement failed: failed to update row ${meta.settlementId}`, e);
      }
    }
    return;
  }

  if (event.type === "invoice.paid") {
    // Subscription successfully charged — extend the active window.
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        subscriptionStatus: "active",
        currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      },
    });
    // Recovery — a successful charge clears any dunning grace clock so the
    // daily reminders stop and the account reads healthy again. (Per-add-on
    // RestaurantAddOn.graceEndsAt is cleared by the subscription.updated→active
    // event that accompanies a successful add-on charge.)
    try {
      await clearRestaurantGrace(restaurant.id);
    } catch (e) {
      console.error("[stripe/invoice.paid] clearRestaurantGrace failed", e);
    }
    // Reseller Partner Program — record commission if the restaurant has an
    // approved reseller. No-op for direct (non-reseller) restaurants.
    try {
      await recordCommissionForInvoice(upserted.id);
    } catch (err) {
      console.error("[stripe] recordCommissionForInvoice failed", err);
    }
  } else if (event.type === "invoice.payment_failed") {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { subscriptionStatus: "past_due" },
    });
    // Dunning (Luigi 2026-06-15): DON'T cut service. Start a GRACE_DAYS grace
    // clock — paid features stay on (entitlements honor the window) and the
    // daily /api/cron/dunning job sends the countdown to the owner + reseller.
    // Fire the immediate "day 0" notice only when a NEW clock starts, so Stripe
    // retries / a second failing sub don't re-spam or reset the deadline.
    let graceStarted = false;
    try {
      graceStarted = await startRestaurantGrace(restaurant.id);
    } catch (e) {
      console.error("[stripe/invoice.payment_failed] startRestaurantGrace failed", e);
    }
    if (graceStarted && restaurant.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      // IMPORTANT: await — Vercel kills unawaited promises after webhook 200.
      try {
        await sendBillingNotificationEmail({
          to: restaurant.email,
          restaurantName: restaurant.name,
          subject: "We couldn't process your subscription payment",
          headline: "Your payment didn't go through — but your service is still on",
          body: `We weren't able to charge your card. As a courtesy we've kept your account fully active and given you ${GRACE_DAYS} days to sort it out. Please update your payment details to avoid any interruption — and remember your free features keep working no matter what.`,
          ctaLabel: "Update payment method",
          ctaUrl: invoice.hosted_invoice_url || `${baseUrl}/admin/billing`,
        });
      } catch (e) {
        console.error("[stripe/invoice.payment_failed] billing email failed", e);
      }
    }
  } else if (event.type === "invoice.payment_action_required") {
    if (restaurant.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      // IMPORTANT: await — Vercel kills unawaited promises after webhook 200.
      try {
        await sendBillingNotificationEmail({
          to: restaurant.email,
          restaurantName: restaurant.name,
          subject: "Action required to complete your subscription payment",
          headline: "Your bank needs you to confirm a payment",
          body: "Your card requires extra authentication (3D Secure) to complete this charge. Complete the step below to keep your subscription active.",
          ctaLabel: "Authenticate payment",
          ctaUrl: invoice.hosted_invoice_url || `${baseUrl}/admin/billing`,
        });
      } catch (e) {
        console.error("[stripe/invoice.payment_action_required] auth email failed", e);
      }
    }
  }
}
