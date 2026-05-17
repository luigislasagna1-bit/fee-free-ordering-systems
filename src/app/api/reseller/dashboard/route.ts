import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isResellerPartner } from "@/lib/roles";
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
  if (!user || !isResellerPartner(user.role) || !user.resellerProfileId) {
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
    activeRestaurantsWithPlans,
    availableCents,
    pendingAgg,
  ] = await Promise.all([
    prisma.restaurant.count({ where: { resellerProfileId: user.resellerProfileId } }),
    prisma.restaurant.groupBy({
      by: ["subscriptionStatus"],
      where: { resellerProfileId: user.resellerProfileId },
      _count: { _all: true },
    }),
    prisma.restaurant.findMany({
      where: {
        resellerProfileId: user.resellerProfileId,
        subscriptionStatus: "active",
      },
      include: { subscriptionPlan: { select: { price: true } } },
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

  const monthlyRecurringCents = activeRestaurantsWithPlans.reduce((sum, r) => {
    const price = r.subscriptionPlan?.price ?? 0;
    return sum + Math.round(price * 100);
  }, 0);

  return NextResponse.json({
    status: profile.status,
    activeRestaurants,
    pendingRestaurants,
    totalRestaurants,
    statusCounts,
    currentRatePercent,
    monthlyRecurringCents,
    commissionBalanceCents: availableCents,
    pendingCommissionCents: pendingAgg._sum.commissionCents ?? 0,
    lifetimeEarnedCents: profile.totalEarnedCents,
    lifetimePaidCents: profile.totalPaidCents,
  });
}
