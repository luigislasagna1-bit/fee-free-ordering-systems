import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import {
  availableBalanceCents,
  countActivePaying,
  rateForActiveCount,
} from "@/lib/commission";

/**
 * GET /api/reseller/dashboard
 * Aggregated stats for the reseller dashboard landing page.
 *
 * Returns:
 *   activeRestaurants     — currently active+paying count (drives commission rate)
 *   pendingRestaurants    — trialing or past_due (not yet earning)
 *   totalRestaurants      — full count of linked restaurants
 *   currentRatePercent    — the tier the reseller is on right now
 *   monthlyRecurringCents — sum of plan.price * 100 for active restaurants
 *   commissionBalanceCents — currently-available (cleared the 7-day hold)
 *   lifetimeEarnedCents   — totalEarnedCents from the profile
 *   lifetimePaidCents     — totalPaidCents from the profile
 *   pendingCommissionCents — sum of commissions still in the 7-day hold
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      totalEarnedCents: true,
      totalPaidCents: true,
    },
  });
  if (!profile) return NextResponse.json({ error: "Profile missing" }, { status: 404 });

  const [
    totalRestaurants,
    statusBreakdown,
    availableCents,
    pendingAgg,
  ] = await Promise.all([
    prisma.restaurant.count({ where: { resellerProfileId: user.resellerProfileId } }),
    prisma.restaurant.groupBy({
      by: ["subscriptionStatus"],
      where: { resellerProfileId: user.resellerProfileId },
      _count: { _all: true },
    }),
    availableBalanceCents(user.resellerProfileId),
    prisma.commissionTransaction.aggregate({
      where: { resellerProfileId: user.resellerProfileId, status: "pending" },
      _sum: { commissionCents: true },
    }),
  ]);

  const activeRestaurants = await countActivePaying(user.resellerProfileId, new Date());
  const currentRatePercent = rateForActiveCount(activeRestaurants);

  const statusCounts: Record<string, number> = {};
  for (const row of statusBreakdown) statusCounts[row.subscriptionStatus] = row._count._all;
  const pendingRestaurants =
    (statusCounts["trialing"] ?? 0) +
    (statusCounts["past_due"] ?? 0) +
    (statusCounts["incomplete"] ?? 0);

  // monthlyRecurringCents removed 2026-05-28: previously summed
  // subscription_plan.price across active restaurants, but
  // subscriptionPlanId is a dead FK under the FREE-by-default + add-ons
  // model — most restaurants have it null, and the few legacy rows that
  // still link to a plan have stale $49.99 / $149.99 prices that don't
  // reflect real recurring revenue. Replacing this with a real
  // add-on-revenue rollup is post-launch (need to aggregate active add-on
  // subscription prices from Stripe). Until then we omit the field
  // rather than show misleading numbers — reseller dashboard already
  // shows lifetime + pending commission which are the trustworthy
  // metrics.

  return NextResponse.json({
    status: profile.status,
    activeRestaurants,
    pendingRestaurants,
    totalRestaurants,
    statusCounts,
    currentRatePercent,
    commissionBalanceCents: availableCents,
    pendingCommissionCents: pendingAgg._sum.commissionCents ?? 0,
    lifetimeEarnedCents: profile.totalEarnedCents,
    lifetimePaidCents: profile.totalPaidCents,
  });
}
