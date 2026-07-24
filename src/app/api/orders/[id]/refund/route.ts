import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { refundDirectPayment, toStripeMinorUnits } from "@/lib/stripe";
import { refundForOrder as refundRewardForOrder } from "@/lib/reward-ledger";
import { reconcileTipRefund } from "@/lib/driver-payout";
import { sendOrderRefundEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

// Zero-decimal minor-unit conversion is the SHARED helper in @/lib/stripe —
// refunds must convert the exact same way the charge did, or a set drift
// mis-refunds by 100×.
const toMinorUnits = toStripeMinorUnits;

/**
 * Manual refund (Refund Offer — report cmpxeh56g). Lets the restaurant
 * partially or fully refund a CARD (Stripe) order that has already been
 * captured ("paid"). Runs on the restaurant's OWN Stripe account via their
 * stored key — same key-only model as the rest of payments. No platform
 * involvement, no fee.
 *
 * PayPal refunds are intentionally NOT handled here (per the report — the
 * owner refunds those from PayPal directly).
 *
 * Idempotent: the Stripe idempotency key is derived from the cumulative
 * refunded total so a double-click can't issue two refunds.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // preferKitchen — the Refund button lives in the kitchen OrderDetail, but
  // admin users (fallback session) can use it too.
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      restaurantId: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
      total: true,
      tip: true,
      creditApplied: true,
      refundedAmount: true,
      orderNumber: true,
      customerName: true,
      customerEmail: true,
      restaurant: { select: { currency: true, name: true, defaultLanguage: true, rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true } },
      // FeeFree delivery only — used to reverse the driver's frozen tip on refund (B2).
      deliveryAssignment: { select: { id: true, status: true, driverId: true, deliveredAt: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.restaurantId !== user.restaurantId && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.paymentMethod !== "card" || !order.paymentIntentId) {
    return NextResponse.json(
      { error: "Only card (Stripe) orders can be refunded here.", code: "not_card" },
      { status: 400 },
    );
  }
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    return NextResponse.json(
      {
        error:
          "This order isn't in a refundable state. Only captured (paid) orders can be refunded; for an un-accepted order, reject it to release the hold.",
        code: "not_refundable",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const currency = order.restaurant.currency || "usd";
  // The card was only charged total − Reward Dollars applied, so the refundable
  // amount is the CHARGED amount, never the full total (else we'd refund money we
  // never collected). The spent credit itself is returned to the wallet
  // separately (TODO: refund-to-wallet). Luigi 2026-06-27.
  const total = Math.round((order.total - (order.creditApplied ?? 0)) * 100) / 100;
  const already = order.refundedAmount ?? 0;
  const remaining = Math.max(0, total - already);

  // No amount (or amount >= remaining / "full") → refund the rest.
  const requested =
    body.full === true || body.amount === undefined || body.amount === null
      ? remaining
      : Number(body.amount);

  if (!Number.isFinite(requested) || requested <= 0) {
    return NextResponse.json({ error: "Invalid refund amount." }, { status: 400 });
  }
  // Allow a tiny epsilon for float rounding when refunding the remainder.
  if (requested > remaining + 0.005) {
    return NextResponse.json(
      {
        error: `Refund exceeds the refundable balance (${remaining.toFixed(2)} remaining).`,
        code: "exceeds_balance",
      },
      { status: 400 },
    );
  }

  const amount = Math.min(requested, remaining);
  const amountCents = toMinorUnits(amount, currency);
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Refund amount too small." }, { status: 400 });
  }

  const newRefundedTotal = Math.round((already + amount) * 100) / 100;
  const isFull = newRefundedTotal >= total - 0.005;

  await prisma.order.update({ where: { id }, data: { refundStatus: "pending" } });

  try {
    await refundDirectPayment({
      paymentIntentId: order.paymentIntentId,
      restaurantId: order.restaurantId,
      reason: "requested_by_customer",
      amountCents,
      // Cumulative-total key — a retry of the SAME refund returns the same
      // Stripe refund; a genuinely new (additional) refund has a new key.
      idempotencyKey: `refund_${id}_${Math.round(newRefundedTotal * 100)}`,
    });
  } catch (err) {
    console.error("[refund]", err instanceof Error ? err.message : err);
    await prisma.order
      .update({ where: { id }, data: { refundStatus: "failed" } })
      .catch(() => {});
    return NextResponse.json(
      { error: "Stripe declined the refund. The restaurant's available balance may be too low.", code: "stripe_failed" },
      { status: 400 },
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      refundedAmount: newRefundedTotal,
      refundStatus: isFull ? "refunded" : "partial",
      paymentStatus: isFull ? "refunded" : "partially_refunded",
    },
    select: { refundedAmount: true, refundStatus: true, paymentStatus: true },
  });

  // Reward Dollars: on a FULL refund, make the wallet whole — return the credit
  // the customer SPENT on this order and claw back the credit they EARNED on it
  // (clamp ≥ 0). Idempotent + best-effort so it never blocks the refund response.
  // Partial refunds leave credit untouched. Luigi 2026-06-30.
  if (isFull) {
    after(refundRewardForOrder(id).catch((e) => console.error("[refund reward-to-wallet]", e instanceof Error ? e.message : e)));
  }

  // FeeFree delivery tip pass-through (B2): when the refunded order was delivered
  // by a FeeFree driver, reduce the driver's FROZEN tip proportionally so the
  // restaurant statement (B4) and driver payout (B5) don't bill/pay a tip the
  // customer got back. Runs on PARTIAL and FULL, recomputed from the cumulative
  // refunded total (idempotent). Off the hot path; best-effort.
  const da = order.deliveryAssignment;
  if (da && da.status === "delivered") {
    after(
      reconcileTipRefund({
        assignmentId: da.id,
        driverId: da.driverId,
        deliveredAt: da.deliveredAt,
        originalTipCents: Math.round((order.tip ?? 0) * 100),
        chargedTotal: total,
        refundedTotal: newRefundedTotal,
        now: new Date(),
      }).catch((e) => console.error("[refund driver-tip reversal]", e instanceof Error ? e.message : e)),
    );
  }

  // Transactional email — the customer always gets a written record of the
  // refund (amount + partial/full). Fire-and-forget so a slow/failed email
  // never blocks the refund response. Skipped when there's no email on file.
  if (order.customerEmail) {
    // On a FULL refund the spent store credit goes back to the WALLET (the
    // refundRewardForOrder call above) — the email must say so, or a
    // $10-bucks + $20-card order reads "Full refund — $20.00" with the
    // bucks unexplained (audit 2026-07-11). Feature-gated on rewardsEnabled.
    const creditBack =
      isFull && order.restaurant.rewardsEnabled === true && (order.creditApplied ?? 0) > 0
        ? order.creditApplied!
        : 0;
    after(
      sendOrderRefundEmail({
        to: order.customerEmail,
        restaurantName: order.restaurant.name,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        refundAmountLabel: formatCurrency(amount, currency),
        isFull,
        creditReturnedLabel: creditBack > 0 ? formatCurrency(creditBack, currency) : undefined,
        rewardLabel:
          creditBack > 0
            ? order.restaurant.rewardLabelPlural?.trim() || order.restaurant.rewardLabelSingular?.trim() || null
            : undefined,
        locale: order.restaurant.defaultLanguage || "en",
      }).catch((e) => console.error("[refund email]", e instanceof Error ? e.message : e)),
    );
  }

  return NextResponse.json({ success: true, ...updated });
}
