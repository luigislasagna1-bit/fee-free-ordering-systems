/**
 * POST /api/webhooks/restaurant-stripe/[restaurantId]
 *
 * Per-restaurant Stripe webhook (hardening 2026-07-10). Registered on the
 * RESTAURANT'S OWN Stripe account by ensureRestaurantStripeWebhook (runs on
 * Test-connection) — under the key-only model their charge events never
 * reach the platform webhook, so a refund issued from the restaurant's own
 * Stripe DASHBOARD used to leave the order marked "paid" forever and never
 * restored/clawed back Reward Dollars.
 *
 * Handles charge.refunded only. Mirrors the admin refund route's semantics
 * exactly (refundable base = total − creditApplied; refundedAmount is the
 * cumulative major-unit total; FULL refund → paymentStatus "refunded" +
 * wallet make-whole via refundForOrder). Idempotent: Stripe's
 * charge.amount_refunded is cumulative, we never decrease refundedAmount,
 * and the admin route's own refunds echo here as a zero-delta no-op (which
 * also suppresses a duplicate customer email).
 */
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { fromStripeMinorUnits } from "@/lib/stripe";
import { refundForOrder as refundRewardForOrder } from "@/lib/reward-ledger";
import { sendOrderRefundEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest, ctx: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await ctx.params;

  const provider = await prisma.paymentProvider.findUnique({
    where: { restaurantId },
    select: { webhookSecretEnc: true, webhookSecretIv: true, webhookSecretTag: true, secretKeyEnc: true, secretKeyIv: true, secretKeyTag: true },
  });
  if (!provider?.webhookSecretEnc) {
    // Unknown restaurant / webhook never registered — 400 (Stripe will
    // eventually disable the endpoint, which is correct: it's not ours).
    return NextResponse.json({ error: "Not configured" }, { status: 400 });
  }

  let webhookSecret: string;
  let secretKey: string;
  try {
    webhookSecret = decrypt(provider.webhookSecretEnc, provider.webhookSecretIv, provider.webhookSecretTag);
    secretKey = decrypt(provider.secretKeyEnc, provider.secretKeyIv, provider.secretKeyTag);
  } catch {
    console.error(`[restaurant-stripe webhook] decrypt failed for ${restaurantId}`);
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();
  const stripe = new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    console.warn(`[restaurant-stripe webhook] bad signature for ${restaurantId}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Atomic, status-gated claim (same pattern as the platform dispatcher).
  // Event ids are only unique per Stripe account, so scope them.
  const claimId = `${restaurantId}:${event.id}`;
  let log;
  try {
    log = await prisma.stripeWebhookEvent.create({
      data: { stripeEventId: claimId, eventType: event.type, status: "received" },
    });
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    const existing = await prisma.stripeWebhookEvent.findUnique({ where: { stripeEventId: claimId } });
    if (!existing) return NextResponse.json({ error: "Claim failed" }, { status: 500 });
    if (existing.status === "processed" || existing.status === "ignored") {
      return NextResponse.json({ received: true, deduped: true });
    }
    log = existing; // earlier attempt died mid-handler → reprocess
  }

  const finish = async (status: "processed" | "ignored" | "failed", errorMessage?: string) => {
    await prisma.stripeWebhookEvent.update({
      where: { id: log.id },
      data: { status, processedAt: new Date(), errorMessage: errorMessage?.slice(0, 500) ?? null },
    }).catch(() => {});
  };

  if (event.type !== "charge.refunded") {
    await finish("ignored");
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    const charge = event.data.object as Stripe.Charge;
    // VOIDED AUTHORIZATIONS ARE NOT REFUNDS (review catch 2026-07-10): we
    // authorize with manual capture, and rejecting/cancelling a prepaid order
    // voids the uncaptured intent — Stripe then emits charge.refunded with
    // captured:false. Processing that as a refund would overwrite
    // paymentStatus "voided" with "refunded" and email the customer a refund
    // notice for money that was never captured.
    if (!charge.captured) {
      await finish("ignored");
      return NextResponse.json({ received: true, ignored: "uncaptured (void, not refund)" });
    }
    const orderId = charge.metadata?.orderId;
    if (!orderId) {
      // A charge we didn't create (no metadata) — e.g. something the owner
      // charged manually in their own dashboard. Not ours to track.
      await finish("ignored");
      return NextResponse.json({ received: true, ignored: "no orderId metadata" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, restaurantId: true, total: true, creditApplied: true, refundedAmount: true,
        paymentIntentId: true, orderNumber: true, customerName: true, customerEmail: true,
        paymentStatus: true, refundStatus: true,
        restaurant: { select: { name: true, currency: true, defaultLanguage: true } },
      },
    });
    if (!order || order.restaurantId !== restaurantId) {
      // Cross-tenant / unknown order id in metadata — ignore, don't 500.
      console.warn(`[restaurant-stripe webhook] order mismatch`, { restaurantId, orderId });
      await finish("ignored");
      return NextResponse.json({ received: true, ignored: "order mismatch" });
    }
    // The charge must belong to THIS order's payment intent (defense against
    // a stray/mis-tagged charge overwriting refund state).
    const chargePi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (order.paymentIntentId && chargePi && order.paymentIntentId !== chargePi) {
      await finish("ignored");
      return NextResponse.json({ received: true, ignored: "payment intent mismatch" });
    }
    // Same gate as the admin refund route: refunds only make sense against a
    // CAPTURED payment. Anything else (pending, voided, failed) is not a
    // refundable state — belt on top of the captured:false check above.
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded" && order.paymentStatus !== "refunded") {
      await finish("ignored");
      return NextResponse.json({ received: true, ignored: `order paymentStatus ${order.paymentStatus}` });
    }

    const currency = order.restaurant.currency || charge.currency || "usd";
    // Stripe's amount_refunded is CUMULATIVE for the charge — same axis as
    // our Order.refundedAmount (all refunds hit the one charge per order).
    const refundedMajor = round2(fromStripeMinorUnits(charge.amount_refunded ?? 0, charge.currency || currency));
    const already = order.refundedAmount ?? 0;
    const delta = round2(refundedMajor - already);
    if (delta <= 0.005) {
      // Echo of a refund we processed ourselves (admin route) or a replay —
      // state already reflects it. No update, no duplicate email.
      await finish("processed");
      return NextResponse.json({ received: true, noop: true });
    }

    const chargedBase = round2(order.total - (order.creditApplied ?? 0)); // card was only charged total − credit
    const isFull = refundedMajor >= chargedBase - 0.005;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundedAmount: refundedMajor,
        refundStatus: isFull ? "refunded" : "partial",
        paymentStatus: isFull ? "refunded" : "partially_refunded",
      },
    });

    // FULL refund → wallet make-whole (return spent credit, claw back earned).
    // Idempotent + never-throw, same as the admin route.
    if (isFull) {
      after(refundRewardForOrder(order.id).catch((e) => console.error("[restaurant-stripe webhook reward]", e instanceof Error ? e.message : e)));
    }

    // The customer gets the same written record they'd get for an admin
    // refund — this path IS the restaurant refunding, just from Stripe's UI.
    // EXCEPT when an admin-route refund is mid-flight (it stamps
    // refundStatus "pending" BEFORE calling Stripe, and its echo can land
    // here before it writes refundedAmount) — the admin route sends its own
    // email, so ours would be a duplicate.
    if (order.customerEmail && order.refundStatus !== "pending") {
      after(
        sendOrderRefundEmail({
          to: order.customerEmail,
          restaurantName: order.restaurant.name,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          refundAmountLabel: formatCurrency(delta, currency),
          isFull,
          locale: order.restaurant.defaultLanguage || "en",
        }).catch((e) => console.error("[restaurant-stripe webhook email]", e instanceof Error ? e.message : e)),
      );
    }

    await finish("processed");
    console.log(`[restaurant-stripe webhook] refund synced`, { orderId: order.id, refundedMajor, isFull });
    return NextResponse.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[restaurant-stripe webhook]", msg);
    await finish("failed", msg);
    // 500 → Stripe retries; the claim is status-gated so the retry reprocesses.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
