import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import {
  countActivePaying,
  rateForActiveCount,
  availableBalanceCents,
  TIER_THRESHOLDS,
} from "@/lib/commission";
import { formatCurrency } from "@/lib/utils";
import {
  Store, TrendingUp, Wallet, DollarSign, Clock, ArrowRight, Percent, BarChart3,
} from "lucide-react";

export default async function ResellerDashboardPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true, totalEarnedCents: true, totalPaidCents: true, referralCode: true },
  });
  if (!profile || profile.status !== "approved") {
    redirect("/reseller/holding");
  }

  // 30-day signup window for the analytics chart
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRestaurants,
    statusBreakdown,
    activeWithPlans,
    activeCount,
    availableCents,
    pendingAgg,
    recentSignups,
  ] = await Promise.all([
    prisma.restaurant.count({ where: { resellerProfileId: user.resellerProfileId } }),
    prisma.restaurant.groupBy({
      by: ["subscriptionStatus"],
      where: { resellerProfileId: user.resellerProfileId },
      _count: { _all: true },
    }),
    prisma.restaurant.findMany({
      where: { resellerProfileId: user.resellerProfileId, subscriptionStatus: "active" },
      include: { subscriptionPlan: { select: { price: true } } },
    }),
    countActivePaying(user.resellerProfileId, new Date()),
    availableBalanceCents(user.resellerProfileId),
    prisma.commissionTransaction.aggregate({
      where: { resellerProfileId: user.resellerProfileId, status: "pending" },
      _sum: { commissionCents: true },
    }),
    prisma.restaurant.findMany({
      where: {
        resellerProfileId: user.resellerProfileId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
    }),
  ]);

  // Bucket signups into 30 daily counts (most recent on the right)
  const signupBuckets: number[] = Array(30).fill(0);
  for (const r of recentSignups) {
    const daysAgo = Math.floor((Date.now() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo < 30) signupBuckets[29 - daysAgo] += 1;
  }
  const maxBucket = Math.max(1, ...signupBuckets);
  const total30 = signupBuckets.reduce((s, n) => s + n, 0);

  const statusCounts: Record<string, number> = {};
  for (const row of statusBreakdown) statusCounts[row.subscriptionStatus] = row._count._all;
  const pendingRestaurants =
    (statusCounts["trialing"] ?? 0) +
    (statusCounts["past_due"] ?? 0) +
    (statusCounts["incomplete"] ?? 0);

  const monthlyRecurring = activeWithPlans.reduce(
    (sum, r) => sum + (r.subscriptionPlan?.price ?? 0),
    0
  );
  const ratePercent = rateForActiveCount(activeCount);
  const pendingCommission = pendingAgg._sum.commissionCents ?? 0;
  const projectedMonthlyCommission = (monthlyRecurring * ratePercent) / 100;
  const nextTier =
    activeCount < TIER_THRESHOLDS.tier1
      ? { count: TIER_THRESHOLDS.tier1, rate: 5 }
      : activeCount < TIER_THRESHOLDS.tier2
      ? { count: TIER_THRESHOLDS.tier2, rate: 10 }
      : null;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Your reseller program at a glance.</p>

      {/* Top stat row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={<Store className="w-4 h-4" />} label="Active paying" value={activeCount} hint={`${pendingRestaurants} pending`} />
        <Stat
          icon={<Percent className="w-4 h-4" />}
          label="Commission rate"
          value={`${ratePercent}%`}
          hint={nextTier ? `${nextTier.count - activeCount} more for ${nextTier.rate}%` : "Top tier reached"}
          highlight
        />
        <Stat
          icon={<TrendingUp className="w-4 h-4" />}
          label="Projected monthly"
          value={formatCurrency(projectedMonthlyCommission)}
          hint={`${formatCurrency(monthlyRecurring)} MRR × ${ratePercent}%`}
        />
        <Stat
          icon={<Wallet className="w-4 h-4" />}
          label="Available payout"
          value={formatCurrency(availableCents / 100)}
          hint={`+${formatCurrency(pendingCommission / 100)} on hold`}
        />
      </div>

      {/* Tier progress bar */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">Commission tier progress</h2>
          <span className="text-xs text-gray-500">{activeCount} active paying restaurants</span>
        </div>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className="absolute inset-y-0 left-0 bg-emerald-500 transition-all"
            style={{
              width: `${Math.min(100, (activeCount / TIER_THRESHOLDS.tier2) * 100)}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500">
          <span>0% · &lt;6</span>
          <span className={activeCount >= TIER_THRESHOLDS.tier1 ? "font-semibold text-emerald-600" : ""}>
            5% · 6+
          </span>
          <span className={activeCount >= TIER_THRESHOLDS.tier2 ? "font-semibold text-emerald-600" : ""}>
            10% · 50+
          </span>
        </div>
      </div>

      {/* 30-day signup chart */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-700" />
            <h2 className="text-sm font-bold text-gray-900">Signups · last 30 days</h2>
          </div>
          <span className="text-xs text-gray-500">{total30} restaurant{total30 === 1 ? "" : "s"} signed up</span>
        </div>
        <div className="flex items-end gap-0.5 h-24">
          {signupBuckets.map((count, i) => {
            const heightPct = (count / maxBucket) * 100;
            return (
              <div
                key={i}
                className="flex-1 bg-emerald-500 rounded-t opacity-80 hover:opacity-100 transition relative group"
                style={{ height: count === 0 ? "2px" : `${heightPct}%`, minHeight: "2px" }}
                title={`${count} signup${count === 1 ? "" : "s"} · ${new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString()}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
          <span>30d ago</span>
          <span>today</span>
        </div>
      </div>

      {/* Two-up: lifetime + referral */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-bold text-gray-900">Lifetime earnings</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total earned</span>
              <span className="font-semibold text-gray-900">{formatCurrency(profile.totalEarnedCents / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Paid out</span>
              <span className="font-semibold text-gray-900">{formatCurrency(profile.totalPaidCents / 100)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
              <span className="text-gray-700 font-medium">Outstanding</span>
              <span className="font-bold text-gray-900">{formatCurrency((profile.totalEarnedCents - profile.totalPaidCents) / 100)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900">Your referral link</h2>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Restaurants signing up with this link are attributed to you automatically.
          </p>
          <code className="block bg-gray-50 rounded-lg p-2 text-xs text-gray-700 break-all">
            {`${process.env.NEXT_PUBLIC_APP_URL || ""}/signup?ref=${profile.referralCode}`}
          </code>
          <Link
            href="/reseller/restaurants"
            className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-600 font-semibold hover:text-emerald-700"
          >
            Or invite directly <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Total restaurants linked: {totalRestaurants}. Tiers update automatically — the rate you see is what new
        invoices will earn.
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"
      } shadow-sm`}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500 mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-emerald-700" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{hint}</div>
    </div>
  );
}
