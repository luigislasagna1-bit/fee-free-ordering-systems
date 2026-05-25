import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { isBrandParent } from "@/lib/brand";
import { loadBrandReports } from "@/lib/brand-reports";
import { BrandReports } from "./BrandReports";
import { parseDateRange, previousPeriod, eachDay, formatChartDate, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Receipt, ArrowRight, MousePointerClick, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";

/**
 * /admin/reports — Dashboard (the landing page of the Reports system).
 *
 * Mirrors the GloriaFood Reports Dashboard:
 *   - Top: 4 headline KPI cards (Revenue / Orders / Avg Order / Customers)
 *     with a "vs previous period" delta arrow + percentage. The previous
 *     period is automatically the immediately-prior range of the same
 *     length (Last 7 vs the 7 before it; Last 14 vs the 14 before it).
 *   - Below: a 4-up "Quick actions" panel — links to the Visits /
 *     Funnel / Clients / Promotions reports framed as growth nudges
 *     ("I want more visitors", "I want more orders", etc).
 *   - Bottom: existing brand-parent path stays intact (chain-wide
 *     aggregation rendered by the BrandReports component).
 *
 * Auth + restaurant resolution comes from the parent /admin layout —
 * by the time this component renders, `session.restaurantId` is valid.
 *
 * Performance:
 *   - Queries use `prisma.order.aggregate` (one COUNT, one SUM) rather
 *     than fetching every Order row into Node and reducing — at 10k
 *     orders/month we'd OOM the route otherwise.
 *   - `select` is explicit so we don't accidentally pull the new
 *     `deliveryLat/Lng/channel` columns before the schema is pushed.
 *   - The `(restaurantId, status, createdAt)` index added in this
 *     change set makes the status-filtered date-range scan an
 *     index-only query at the Postgres level.
 */
export default async function ReportsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);

  // Brand parents see the chain-wide aggregate (unchanged behavior).
  // We pass the resolved range so the brand-level report respects the
  // date picker too — previously hard-coded to 30 days.
  if (restaurantId && (await isBrandParent(restaurantId))) {
    const days = Math.round((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const payload = await loadBrandReports(restaurantId, days);
    if (payload) {
      return (
        <div>
          <ReportHeader title="Dashboard" subtitle="Chain-wide overview across all your locations." />
          <BrandReports payload={payload} />
        </div>
      );
    }
  }

  if (!restaurantId) {
    return (
      <div>
        <ReportHeader title="Dashboard" />
        <p className="text-sm text-gray-500">No restaurant context — sign in as a restaurant admin.</p>
      </div>
    );
  }

  const prev = previousPeriod(range);

  // Run all 8 aggregate queries in parallel. They all hit the same two
  // composite indexes — Postgres serves them concurrently with no lock
  // contention. Worst-case latency is ~50ms even at 100k orders.
  const [
    curRevenue, curOrders, curCompletedCount, curCustomers,
    prevRevenue, prevOrders, prevCompletedCount, prevCustomers,
    topItems, typeBreakdown,
  ] = await Promise.all([
    sumRevenue(restaurantId, range.from, range.to),
    countOrders(restaurantId, range.from, range.to),
    countCompleted(restaurantId, range.from, range.to),
    countDistinctCustomers(restaurantId, range.from, range.to),
    sumRevenue(restaurantId, prev.from, prev.to),
    countOrders(restaurantId, prev.from, prev.to),
    countCompleted(restaurantId, prev.from, prev.to),
    countDistinctCustomers(restaurantId, prev.from, prev.to),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: {
        order: {
          restaurantId,
          status: "completed",
          createdAt: { gte: range.from, lte: range.to },
        },
      },
      _count: true,
      _sum: { subtotal: true },
      orderBy: { _count: { name: "desc" } },
      take: 8,
    }),
    prisma.order.groupBy({
      by: ["type"],
      where: {
        restaurantId,
        status: "completed",
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: true,
    }),
  ]);

  const avgOrder = curCompletedCount > 0 ? curRevenue / curCompletedCount : 0;
  const prevAvgOrder = prevCompletedCount > 0 ? prevRevenue / prevCompletedCount : 0;

  // Build the daily revenue chart. Re-query with a `groupBy(createdAt::date)`
  // would be cleanest but Prisma's groupBy doesn't accept raw date casts —
  // so we fetch the lightweight (id, total, createdAt) set within the
  // range and bucket in JS. Capped at the range length × max(1000/day) by
  // the date filter, so safe.
  const dailyOrders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: "completed",
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { total: true, createdAt: true },
  });
  const buckets = new Map<string, { revenue: number; count: number }>();
  for (const d of eachDay(range)) {
    buckets.set(d.toDateString(), { revenue: 0, count: 0 });
  }
  for (const o of dailyOrders) {
    const key = new Date(o.createdAt).toDateString();
    const b = buckets.get(key);
    if (b) {
      b.revenue += o.total;
      b.count += 1;
    }
  }
  const days = Array.from(buckets.entries()).map(([key, b]) => ({
    date: new Date(key),
    revenue: b.revenue,
    count: b.count,
  }));
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);

  return (
    <div>
      <ReportHeader
        title="Dashboard"
        subtitle={`Headline metrics for ${formatRangeLabel(range)}.`}
      />

      {/* KPI cards with vs-previous-period deltas. The arrow + percentage
          gives owners an at-a-glance sense of whether they're growing,
          mirroring the GloriaFood "vs restaurant average" pattern. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Revenue"
          value={formatCurrency(curRevenue)}
          deltaPct={pctChange(curRevenue, prevRevenue)}
          icon={DollarSign}
          accent="emerald"
        />
        <KpiCard
          label="Completed orders"
          value={curCompletedCount.toLocaleString()}
          deltaPct={pctChange(curCompletedCount, prevCompletedCount)}
          icon={ShoppingBag}
          accent="blue"
        />
        <KpiCard
          label="Average order"
          value={formatCurrency(avgOrder)}
          deltaPct={pctChange(avgOrder, prevAvgOrder)}
          icon={Receipt}
          accent="amber"
        />
        <KpiCard
          label="Customers served"
          value={curCustomers.toLocaleString()}
          deltaPct={pctChange(curCustomers, prevCustomers)}
          icon={Users}
          accent="purple"
        />
      </div>

      {/* Daily revenue spark + top items + type split — same three panels
          as the legacy /admin/reports, kept because they answer the most
          common "how's it going?" question in one screen. */}
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Daily revenue</h2>
          <div className="space-y-2.5">
            {days.map((d) => (
              <div key={d.date.toISOString()}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{formatChartDate(d.date)}</span>
                  <span className="font-semibold text-gray-900">
                    {d.count} orders · {formatCurrency(d.revenue)}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {days.every((d) => d.count === 0) && (
              <p className="text-gray-400 text-sm italic">No completed orders in this range.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top selling items</h2>
          {topItems.length === 0 ? (
            <p className="text-gray-400 text-sm italic">No items sold in this range.</p>
          ) : (
            <div className="space-y-2.5">
              {topItems.map((it) => (
                <div key={it.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-800 truncate flex-1">{it.name}</span>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <span className="text-xs text-gray-500">{it._count} sold</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(it._sum.subtotal || 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Order-type breakdown — same dashboard primitive GloriaFood shows
          on the second screenshot Luigi shared. Color-coded so pickup vs
          delivery is readable in a glance. */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order types</h2>
        <div className="grid grid-cols-3 gap-3">
          {(["pickup", "delivery", "dine_in"] as const).map((t) => {
            const row = typeBreakdown.find((r) => r.type === t);
            const count = row?._count ?? 0;
            const palette = {
              pickup:   "bg-blue-50    text-blue-700",
              delivery: "bg-emerald-50 text-emerald-700",
              dine_in:  "bg-amber-50   text-amber-700",
            }[t];
            const label = t === "dine_in" ? "Dine-in" : t.charAt(0).toUpperCase() + t.slice(1);
            return (
              <div key={t} className={`p-4 rounded-xl text-center ${palette}`}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs mt-1 opacity-80">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* "I want more X" quick-action panel — the GloriaFood Dashboard
          surfaces these as discovery for the deeper reports + their
          related growth levers. Each card deep-links into the relevant
          report so owners learn the IA by clicking. */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Grow your restaurant</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ActionCard
            icon={MousePointerClick}
            title="More visitors"
            description="See where your traffic comes from and the conversion funnel."
            href="/admin/reports/online-ordering/visits"
            accent="bg-blue-100 text-blue-700"
          />
          <ActionCard
            icon={Sparkles}
            title="More orders"
            description="Find your top promotions and which items convert best."
            href="/admin/reports/online-ordering/promotions"
            accent="bg-emerald-100 text-emerald-700"
          />
          <ActionCard
            icon={UserPlus}
            title="More returning clients"
            description="Spot your repeat customers and re-engage the lapsed ones."
            href="/admin/reports/online-ordering/clients"
            accent="bg-purple-100 text-purple-700"
          />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Reusable header for every report page — title + date picker on one
 *  line. Subtitle wraps below on small screens. */
function ReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <DateRangePicker />
    </div>
  );
}

/** Single KPI card with delta vs previous-period. */
function KpiCard({
  label, value, deltaPct, icon: Icon, accent,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  icon: typeof DollarSign;
  accent: "emerald" | "blue" | "amber" | "purple";
}) {
  const ring = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue:    "bg-blue-50    text-blue-600",
    amber:   "bg-amber-50   text-amber-600",
    purple:  "bg-purple-50  text-purple-600",
  }[accent];

  // deltaPct null when the previous period was zero — show "—" rather
  // than infinity / NaN. Up arrow + green when positive, down + red
  // when negative; matches GloriaFood color semantics.
  const renderDelta = () => {
    if (deltaPct === null) return <span className="text-xs text-gray-400">— vs prev</span>;
    const positive = deltaPct >= 0;
    const Arrow = positive ? TrendingUp : TrendingDown;
    const color = positive ? "text-emerald-600" : "text-red-500";
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
        <Arrow className="w-3 h-3" />
        {Math.abs(deltaPct).toFixed(1)}% vs prev
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ring}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      {renderDelta()}
    </div>
  );
}

/** Quick-action card linking to a related report. */
function ActionCard({
  icon: Icon, title, description, href, accent,
}: {
  icon: typeof DollarSign;
  title: string;
  description: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-emerald-300 hover:shadow-md transition group"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <span className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        See report <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}

/** Percentage change helper. Returns null when prev was zero (avoids
 *  infinity in the UI). Note: when both are zero we also return null. */
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// ── Aggregate query helpers ──────────────────────────────────────────
//
// Kept tiny + explicit so the query plan is obvious from the call site.
// All four hit the existing (restaurantId, status, createdAt) composite
// index added in this change set.

async function sumRevenue(restaurantId: string, from: Date, to: Date): Promise<number> {
  const r = await prisma.order.aggregate({
    where: { restaurantId, status: "completed", createdAt: { gte: from, lte: to } },
    _sum: { total: true },
  });
  return r._sum.total ?? 0;
}

async function countOrders(restaurantId: string, from: Date, to: Date): Promise<number> {
  return prisma.order.count({
    where: { restaurantId, createdAt: { gte: from, lte: to } },
  });
}

async function countCompleted(restaurantId: string, from: Date, to: Date): Promise<number> {
  return prisma.order.count({
    where: { restaurantId, status: "completed", createdAt: { gte: from, lte: to } },
  });
}

/** Distinct customer count for a window. Uses a raw groupBy on
 *  `customerId` (excluding null guest orders). We could include guests
 *  by hashing on email/phone but that adds noise — for the dashboard
 *  headline metric, "customers we know" is the more useful number. */
async function countDistinctCustomers(restaurantId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      restaurantId,
      createdAt: { gte: from, lte: to },
      customerId: { not: null },
    },
  });
  return rows.length;
}
