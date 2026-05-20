import type Stripe from "stripe";
import prisma from "@/lib/db";
import { sendBillingNotificationEmail } from "@/lib/email";
import { recordCommissionForInvoice } from "@/lib/commission";

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
    if (event.type === "invoice.paid") {
      await prisma.marketplaceSettlement.update({
        where: { id: meta.settlementId },
        data: { status: "paid" },
      }).catch((e) => {
        console.error(`[stripe] marketplace_settlement paid: failed to update row ${meta.settlementId}`, e);
      });
    } else if (event.type === "invoice.payment_failed") {
      await prisma.marketplaceSettlement.update({
        where: { id: meta.settlementId },
        data: { status: "failed", failureReason: "Stripe charge failed" },
      }).catch(() => {});
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
    if (restaurant.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      sendBillingNotificationEmail({
        to: restaurant.email,
        restaurantName: restaurant.name,
        subject: "Your subscription payment failed",
        headline: "Your last payment didn't go through",
        body: "Your subscription is now past due. Update your card to keep your account active — admin tools are locked until billing is restored.",
        ctaLabel: "Update payment method",
        ctaUrl: invoice.hosted_invoice_url || `${baseUrl}/admin/billing`,
      }).catch(() => {});
    }
  } else if (event.type === "invoice.payment_action_required") {
    if (restaurant.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      sendBillingNotificationEmail({
        to: restaurant.email,
        restaurantName: restaurant.name,
        subject: "Action required to complete your subscription payment",
        headline: "Your bank needs you to confirm a payment",
        body: "Your card requires extra authentication (3D Secure) to complete this charge. Complete the step below to keep your subscription active.",
        ctaLabel: "Authenticate payment",
        ctaUrl: invoice.hosted_invoice_url || `${baseUrl}/admin/billing`,
      }).catch(() => {});
    }
  }
}
