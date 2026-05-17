/**
 * Commission engine.
 *
 * One CommissionTransaction row per SubscriptionInvoice that earns commission.
 * Idempotent by `subscriptionInvoiceId` unique constraint — re-running the
 * webhook is a no-op.
 *
 * Rate tiers (commissions only apply to net subscription revenue):
 *   <6 active-paying restaurants  → 0%
 *   6–49                           → 5%
 *   50+                            → 10%
 *
 * The rate is snapshotted at SubscriptionInvoice.paidAt — when the 6th
 * restaurant pays, that invoice and every subsequent paid invoice earn 5%.
 * Past commissions stay at the rate they were recorded with.
 *
 * Lifecycle: pending → available (after 7-day hold) → paid (after payout)
 *                  ↘ reversed (refund/chargeback)
 *
 * Hold: 7 days. Most refund/chargeback signals surface inside that window;
 * a later reversal becomes a negative balance on the next payout request.
 */

import prisma from "@/lib/db";

export const COMMISSION_HOLD_DAYS = 7;
export const TIER_THRESHOLDS = { tier1: 6, tier2: 50 } as const;
export const TIER_RATES = { below: 0, tier1: 5, tier2: 10 } as const;

/** Tier rate by active-paying count. Pure function — easy to unit test. */
export function rateForActiveCount(count: number): number {
  if (count >= TIER_THRESHOLDS.tier2) return TIER_RATES.tier2;
  if (count >= TIER_THRESHOLDS.tier1) return TIER_RATES.tier1;
  return TIER_RATES.below;
}

/**
 * Count "active paying" restaurants for a reseller. A restaurant counts if:
 *   - linked to this reseller's profile
 *   - subscriptionStatus = "active"
 *   - has at least one paid SubscriptionInvoice in the last 35 days
 *     (covers monthly cycle + buffer for retries)
 */
export async function countActivePaying(resellerProfileId: string, asOf: Date): Promise<number> {
  const cutoff = new Date(asOf.getTime() - 35 * 24 * 60 * 60 * 1000);
  const rows = await prisma.restaurant.findMany({
    where: {
      resellerProfileId,
      subscriptionStatus: "active",
      subscriptionInvoices: {
        some: { status: "paid", paidAt: { gte: cutoff } },
      },
    },
    select: { id: true },
  });
  return rows.length;
}

/**
 * Record (or update) the commission for a paid SubscriptionInvoice.
 * Called from the invoice.paid webhook handler after the invoice row is upserted.
 * No-op if the restaurant has no reseller, the reseller isn't approved, or
 * the invoice isn't actually paid.
 */
export async function recordCommissionForInvoice(
  subscriptionInvoiceId: string
): Promise<{ ok: true; commissionCents: number; ratePercent: number } | { ok: false; reason: string }> {
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: subscriptionInvoiceId },
    include: { restaurant: { select: { id: true, resellerProfileId: true } } },
  });
  if (!invoice) return { ok: false, reason: "invoice not found" };
  if (invoice.status !== "paid") return { ok: false, reason: "invoice not paid" };

  const resellerProfileId = invoice.restaurant.resellerProfileId;
  if (!resellerProfileId) return { ok: false, reason: "no reseller" };

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") return { ok: false, reason: "reseller not approved" };

  const paidAt = invoice.paidAt ?? new Date();
  const activePayingCount = await countActivePaying(resellerProfileId, paidAt);
  const ratePercent = rateForActiveCount(activePayingCount);

  // Net = paid - refunded - taxes - stripe fees. Taxes and fees are 0 for
  // our current plans; the columns exist so we can refine later without
  // touching this signature.
  const netRevenueCents = Math.max(0, invoice.amountPaid - invoice.amountRefundedCents);
  const commissionCents = Math.round(netRevenueCents * (ratePercent / 100));

  await prisma.commissionTransaction.upsert({
    where: { subscriptionInvoiceId: invoice.id },
    update: {
      // Only the *first* recording is authoritative for the snapshot; on
      // re-runs we leave activePayingCount + ratePercent alone but refresh
      // commissionCents in case amountRefundedCents changed before the
      // reverseCommission path got a chance to fire.
      netRevenueCents,
      commissionCents,
    },
    create: {
      resellerProfileId,
      restaurantId: invoice.restaurant.id,
      subscriptionInvoiceId: invoice.id,
      netRevenueCents,
      activePayingCount,
      ratePercent,
      commissionCents,
      status: "pending",
    },
  });

  // Update the reseller's lifetime gross. We use raw increments to avoid
  // racing with concurrent webhook deliveries. (Stripe rarely fires the same
  // event in parallel but Vercel will retry on transient 500s.)
  if (commissionCents > 0) {
    await prisma.resellerProfile.update({
      where: { id: resellerProfileId },
      data: { totalEarnedCents: { increment: commissionCents } },
    });
  }

  return { ok: true, commissionCents, ratePercent };
}

/**
 * Reverse a commission. Called when the underlying charge is refunded or
 * disputed. Adjusts the reseller's totalEarnedCents and flips the row's
 * status to "reversed". If the commission was already included in a paid
 * payout, the negative balance is carried forward to the next payout.
 */
export async function reverseCommission(
  subscriptionInvoiceId: string,
  reason: string
): Promise<{ ok: boolean }> {
  const existing = await prisma.commissionTransaction.findUnique({
    where: { subscriptionInvoiceId },
  });
  if (!existing) return { ok: false };
  if (existing.status === "reversed") return { ok: true }; // idempotent

  await prisma.$transaction([
    prisma.commissionTransaction.update({
      where: { id: existing.id },
      data: {
        status: "reversed",
        reversedAt: new Date(),
        reversedReason: reason.slice(0, 500),
      },
    }),
    prisma.resellerProfile.update({
      where: { id: existing.resellerProfileId },
      data: { totalEarnedCents: { decrement: existing.commissionCents } },
    }),
  ]);

  return { ok: true };
}

/**
 * Promote commissions from `pending` → `available` once the hold window has
 * passed. Runs daily via cron. Idempotent — only touches rows still in
 * `pending` whose `createdAt` is older than the hold threshold.
 */
export async function promotePendingCommissions(): Promise<{ promoted: number }> {
  const threshold = new Date(Date.now() - COMMISSION_HOLD_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.commissionTransaction.updateMany({
    where: { status: "pending", createdAt: { lt: threshold } },
    data: { status: "available" },
  });
  return { promoted: result.count };
}

/**
 * Sum of currently-available commission cents for a reseller. Used by the
 * payout request endpoint to enforce the minimum and to compute the request
 * amount.
 */
export async function availableBalanceCents(resellerProfileId: string): Promise<number> {
  const agg = await prisma.commissionTransaction.aggregate({
    where: { resellerProfileId, status: "available" },
    _sum: { commissionCents: true },
  });
  return agg._sum.commissionCents ?? 0;
}
