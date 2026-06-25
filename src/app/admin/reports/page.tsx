import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { LocationDrillRow } from "./LocationDrillRow";
import { previousPeriod, formatChartDate, formatRangeLabel, toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz, eachDayKeyInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { dateKeyInTimezone } from "@/lib/restaurant-hours";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Receipt, ArrowRight, MousePointerClick, Sparkles, UserPlus, Building2, AlertTriangle } from "lucide-react";
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
 *   - Chain: a brand PARENT rolls the SAME dashboard up across all its
 *     locations (resolveReportScope → restaurantId IN (...)) + a clickable
 *     per-location breakdown table. No separate placeholder.
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
  const t = await getTranslations("admin.reportsHome");
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    return (
      <div>
        <ReportHeader title={t("dashboardTitle")} />
        <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>
      </div>
    );
  }

  // Resolve the report SCOPE: a single store → just this id; a brand PARENT →
  // the whole chain (all location ids), totalled in the parent's currency + tz.
  // The same rich dashboard renders for both — a chain just queries
  // `restaurantId IN (...)` and adds the per-location breakdown below.
  const scope = await resolveReportScope(restaurantId);
  const formatCurrency = (n: number) => fmtCurrency(n, scope.currency);
  const rangeQ = buildRangeQuery(sp);

  // Resolve the date range in the restaurant's timezone so "today" / "Last 7
  // days" matches the kitchen + the End-of-Day report (not the Vercel UTC day).
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);
  const prev = previousPeriod(range);

  // Run all 8 aggregate queries in parallel. They all hit the same two
  // composite indexes — Postgres serves them concurrently with no lock
  // contention. Worst-case latency is ~50ms even at 100k orders.
  const [
    curRevenue, curOrders, curCustomers,
    prevRevenue, prevOrders, prevCustomers,
    topItems, typeBreakdown,
    allTimeAgg, allTimeCustomers,
    perLocationRaw,
  ] = await Promise.all([
    sumRevenue(scope.ids, range),
    countReportOrders(scope.ids, range),
    countDistinctCustomers(scope.ids, range),
    sumRevenue(scope.ids, prev),
    countReportOrders(scope.ids, prev),
    countDistinctCustomers(scope.ids, prev),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: reportOrderWhere(scope.ids, range) },
      _count: true,
      _sum: { subtotal: true },
      orderBy: { _count: { name: "desc" } },
      take: 8,
    }),
    prisma.order.groupBy({
      by: ["type"],
      where: reportOrderWhere(scope.ids, range),
      _count: true,
    }),
    // All-time totals — the GloriaFood "/ 45,947" secondary figure beside the
    // range value. Indexed on (restaurantId, status); runs once per load.
    // SCALE SEAM: cache this nightly once a restaurant passes ~100k orders.
    prisma.order.aggregate({ where: { restaurantId: { in: scope.ids }, ...REPORT_ORDER_STATUS_WHERE }, _sum: { total: true }, _count: true }),
    prisma.customer.count({ where: { restaurantId: { in: scope.ids } } }),
    // Per-location breakdown (chain only) — ONE groupBy(restaurantId) instead of
    // an N-location fan-out; the (restaurantId,status,createdAt) index serves it.
    scope.isChain
      ? prisma.order.groupBy({ by: ["restaurantId"], where: reportOrderWhere(scope.ids, range), _count: true, _sum: { total: true } })
      : Promise.resolve([] as Array<{ restaurantId: string; _count: number; _sum: { total: number | null } }>),
  ]);

  // One consistent "what counts" rule (reportOrderWhere) → "Orders" and "Avg
  // order" now describe the SAME population. Before, Orders counted every
  // status while Avg divided by completed-only, so they never reconciled.
  const avgOrder = curOrders > 0 ? curRevenue / curOrders : 0;
  const prevAvgOrder = prevOrders > 0 ? prevRevenue / prevOrders : 0;
  const allTimeRevenue = allTimeAgg._sum.total ?? 0;
  const allTimeOrders = allTimeAgg._count;
  const allTimeAvg = allTimeOrders > 0 ? allTimeRevenue / allTimeOrders : 0;

  // Build the daily revenue chart. Re-query with a `groupBy(createdAt::date)`
  // would be cleanest but Prisma's groupBy doesn't accept raw date casts —
  // so we fetch the lightweight (id, total, createdAt) set within the
  // range and bucket in JS. Capped at the range length × max(1000/day) by
  // the date filter, so safe.
  const dailyOrders = await prisma.order.findMany({
    where: reportOrderWhere(scope.ids, range),
    select: { total: true, createdAt: true },
  });
  // Bucket by the restaurant-LOCAL calendar day so the chart lines up with the
  // tz-aware range (a 9pm-PST order counts on the PST day, not UTC tomorrow).
  const dayKey = (d: Date) => (scope.timezone ? dateKeyInTimezone(d, scope.timezone) : toISODate(d));
  const buckets = new Map<string, { revenue: number; count: number }>();
  for (const key of eachDayKeyInTz(range, scope.timezone ?? undefined)) {
    buckets.set(key, { revenue: 0, count: 0 });
  }
  for (const o of dailyOrders) {
    const b = buckets.get(dayKey(new Date(o.createdAt)));
    if (b) {
      b.revenue += o.total;
      b.count += 1;
    }
  }
  const days = Array.from(buckets.entries()).map(([key, b]) => ({
    date: new Date(`${key}T12:00:00`), // noon-local anchor → correct weekday label
    revenue: b.revenue,
    count: b.count,
  }));
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);

  // Per-location rows (chain only) — join the groupBy to the scope's location
  // list, sorted by revenue. A location with no orders in the range shows zero.
  const perLocById = new Map(
    (perLocationRaw as Array<{ restaurantId: string; _count: number; _sum: { total: number | null } }>)
      .map((r) => [r.restaurantId, { orders: r._count, revenue: r._sum.total ?? 0 }]),
  );
  const locationRows = scope.locations
    .map((l) => {
      const s = perLocById.get(l.id);
      const orders = s?.orders ?? 0;
      const revenue = s?.revenue ?? 0;
      return { id: l.id, name: l.name, city: l.city, isParent: l.isParent, orders, revenue, avg: orders > 0 ? revenue / orders : 0 };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const maxLocRev = Math.max(...locationRows.map((l) => l.revenue), 1);

  // Detect "brand-new restaurant" state — zero orders in BOTH the
  // current AND the previous period. We render a welcoming first-order
  // state instead of a wall of zeros + awkward "—" deltas.
  const isBrandNew = curOrders === 0 && prevOrders === 0;
  if (isBrandNew) {
    return (
      <div>
        <ReportHeader
          title={t("dashboardTitle")}
          subtitle={t("reportsReadySubtitle")}
        />
        <FirstOrderWelcome
          welcomeTitle={t("welcomeTitle")}
          welcomeBody={t("welcomeBody")}
          shareOrderLinkTitle={t("shareOrderLinkTitle")}
          shareOrderLinkDesc={t("shareOrderLinkDesc")}
          firstOrderPromoTitle={t("firstOrderPromoTitle")}
          firstOrderPromoDesc={t("firstOrderPromoDesc")}
          welcomeFootnote={t("welcomeFootnote")}
        />
      </div>
    );
  }

  const orderTypeLabelMap = {
    pickup: t("pickup"),
    delivery: t("delivery"),
    dine_in: t("dineIn"),
  };

  return (
    <div>
      <ReportHeader
        title={scope.isChain ? t("chainTitle", { brand: scope.brandName }) : t("dashboardTitle")}
        subtitle={
          scope.isChain
            ? t("chainSubtitle", { range: formatRangeLabel(range), count: scope.locations.length })
            : t("headlineMetricsSubtitle", { range: formatRangeLabel(range) })
        }
      />

      {/* KPI cards with vs-previous-period deltas. The arrow + percentage
          gives owners an at-a-glance sense of whether they're growing,
          mirroring the GloriaFood "vs restaurant average" pattern. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label={t("kpiRevenue")}
          value={formatCurrency(curRevenue)}
          allTime={formatCurrency(allTimeRevenue)}
          allTimeLabel={t("allTime")}
          deltaPct={pctChange(curRevenue, prevRevenue)}
          icon={DollarSign}
          accent="emerald"
          vsPrevLabel={t("vsPrev")}
          vsPrevPctLabel={(pct) => t("vsPrevPct", { pct })}
          href={`/admin/reports/list/orders?${rangeQ}`}
        />
        <KpiCard
          label={t("kpiCompletedOrders")}
          value={curOrders.toLocaleString()}
          allTime={allTimeOrders.toLocaleString()}
          allTimeLabel={t("allTime")}
          deltaPct={pctChange(curOrders, prevOrders)}
          icon={ShoppingBag}
          accent="blue"
          vsPrevLabel={t("vsPrev")}
          vsPrevPctLabel={(pct) => t("vsPrevPct", { pct })}
          href={`/admin/reports/list/orders?${rangeQ}`}
        />
        <KpiCard
          label={t("kpiAverageOrder")}
          value={formatCurrency(avgOrder)}
          allTime={formatCurrency(allTimeAvg)}
          allTimeLabel={t("allTime")}
          deltaPct={pctChange(avgOrder, prevAvgOrder)}
          icon={Receipt}
          accent="amber"
          vsPrevLabel={t("vsPrev")}
          vsPrevPctLabel={(pct) => t("vsPrevPct", { pct })}
          href={`/admin/reports/sales/summary?${rangeQ}`}
        />
        <KpiCard
          label={t("kpiCustomersServed")}
          value={curCustomers.toLocaleString()}
          allTime={allTimeCustomers.toLocaleString()}
          allTimeLabel={t("allTime")}
          deltaPct={pctChange(curCustomers, prevCustomers)}
          icon={Users}
          accent="purple"
          vsPrevLabel={t("vsPrev")}
          vsPrevPctLabel={(pct) => t("vsPrevPct", { pct })}
          href={`/admin/reports/list/clients?${rangeQ}`}
        />
      </div>

      {scope.isChain && (
        <>
          {(scope.mixedCurrency || scope.mixedTimezone) && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900/90">{t("chainMixedCaveat", { currency: scope.currency.toUpperCase() })}</p>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" /> {t("byLocation")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">{t("colLocation")}</th>
                    <th className="py-2 pr-4 font-medium text-right">{t("colOrders")}</th>
                    <th className="py-2 pr-4 font-medium text-right">{t("colRevenue")}</th>
                    <th className="py-2 pr-4 font-medium text-right">{t("colAvgOrder")}</th>
                    <th className="py-2 font-medium hidden md:table-cell">{t("colShare")}</th>
                  </tr>
                </thead>
                <tbody>
                  {locationRows.map((loc) => (
                    <LocationDrillRow key={loc.id} id={loc.id}>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {loc.name}
                          {loc.isParent && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{t("brandBadge")}</span>
                          )}
                        </div>
                        {loc.city && <div className="text-xs text-gray-500">{loc.city}</div>}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-700">{loc.orders.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-gray-900">{formatCurrency(loc.revenue)}</td>
                      <td className="py-3 pr-4 text-right text-gray-600">{formatCurrency(loc.avg)}</td>
                      <td className="py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px] max-w-[140px]">
                            <div className="h-full bg-amber-500" style={{ width: `${(loc.revenue / maxLocRev) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{curRevenue > 0 ? ((loc.revenue / curRevenue) * 100).toFixed(0) : 0}%</span>
                        </div>
                      </td>
                    </LocationDrillRow>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">{t("locationDrillHint")}</p>
          </div>
        </>
      )}

      {/* Daily revenue spark + top items + type split — same three panels
          as the legacy /admin/reports, kept because they answer the most
          common "how's it going?" question in one screen. */}
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">{t("dailyRevenue")}</h2>
          <div className="space-y-2.5">
            {days.map((d) => (
              <div key={d.date.toISOString()}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600">{formatChartDate(d.date)}</span>
                  <span className="font-semibold text-gray-900">
                    {t("ordersCount", { count: d.count, revenue: formatCurrency(d.revenue) })}
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
              <p className="text-gray-400 text-sm italic">{t("noOrdersInRange")}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">{t("topSellingItems")}</h2>
          {topItems.length === 0 ? (
            <p className="text-gray-400 text-sm italic">{t("noItemsSoldInRange")}</p>
          ) : (
            <div className="space-y-2.5">
              {topItems.map((it) => (
                <div key={it.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-800 truncate flex-1">{it.name}</span>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <span className="text-xs text-gray-500">{t("sold", { count: it._count })}</span>
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
        <h2 className="font-semibold text-gray-900 mb-4">{t("orderTypes")}</h2>
        <div className="grid grid-cols-3 gap-3">
          {(["pickup", "delivery", "dine_in"] as const).map((orderType) => {
            const row = typeBreakdown.find((r) => r.type === orderType);
            const count = row?._count ?? 0;
            const palette = {
              pickup:   "bg-blue-50    text-blue-700",
              delivery: "bg-emerald-50 text-emerald-700",
              dine_in:  "bg-amber-50   text-amber-700",
            }[orderType];
            const label = orderTypeLabelMap[orderType];
            return (
              <div key={orderType} className={`p-4 rounded-xl text-center ${palette}`}>
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
        <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">{t("growYourRestaurant")}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ActionCard
            icon={MousePointerClick}
            title={t("moreVisitorsTitle")}
            description={t("moreVisitorsDesc")}
            href="/admin/reports/online-ordering/visits"
            accent="bg-blue-100 text-blue-700"
            seeReport={t("seeReport")}
          />
          <ActionCard
            icon={Sparkles}
            title={t("moreOrdersTitle")}
            description={t("moreOrdersDesc")}
            href="/admin/reports/online-ordering/promotions"
            accent="bg-emerald-100 text-emerald-700"
            seeReport={t("seeReport")}
          />
          <ActionCard
            icon={UserPlus}
            title={t("moreClientsTitle")}
            description={t("moreClientsDesc")}
            href="/admin/reports/online-ordering/clients"
            accent="bg-purple-100 text-purple-700"
            seeReport={t("seeReport")}
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
  label, value, deltaPct, icon: Icon, accent, vsPrevLabel, vsPrevPctLabel, allTime, allTimeLabel, href,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  icon: typeof DollarSign;
  accent: "emerald" | "blue" | "amber" | "purple";
  vsPrevLabel: string;
  vsPrevPctLabel: (pct: string) => string;
  /** All-time figure shown as a muted secondary line (GloriaFood "/ 45,947"). */
  allTime?: string;
  allTimeLabel?: string;
  /** When set, the whole card becomes a drill-down link to a filtered report. */
  href?: string;
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
    if (deltaPct === null) return <span className="text-xs text-gray-400">{vsPrevLabel}</span>;
    const positive = deltaPct >= 0;
    const Arrow = positive ? TrendingUp : TrendingDown;
    const color = positive ? "text-emerald-600" : "text-red-500";
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
        <Arrow className="w-3 h-3" />
        {vsPrevPctLabel(Math.abs(deltaPct).toFixed(1))}
      </span>
    );
  };

  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ring}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      {renderDelta()}
      {allTime && (
        <div className="text-[11px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-50">
          {allTimeLabel} · {allTime}
        </div>
      )}
    </>
  );
  const base = "bg-white rounded-xl border border-gray-100 shadow-sm p-4 block";
  if (href) {
    return (
      <Link href={href} className={`${base} hover:border-emerald-300 hover:shadow-md transition`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** Quick-action card linking to a related report. */
function ActionCard({
  icon: Icon, title, description, href, accent, seeReport,
}: {
  icon: typeof DollarSign;
  title: string;
  description: string;
  href: string;
  accent: string;
  seeReport: string;
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
        {seeReport} <ArrowRight className="w-3 h-3" />
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

/**
 * Welcome banner shown when the restaurant has ZERO orders in both the
 * current and previous period. Without this, brand-new restaurants
 * see a wall of zeros + grey "— vs prev" deltas that feels broken.
 *
 * Layout mirrors the GloriaFood "you're about to take off" copy — a
 * single emerald banner + a checklist of "what to do next" pointing
 * at the existing publish/share surfaces. We deliberately don't show
 * KPI cards or charts here; with no data they're noise, and pre-
 * launch owners don't need to learn the chart UI before their first
 * order.
 */
function FirstOrderWelcome({
  welcomeTitle,
  welcomeBody,
  shareOrderLinkTitle,
  shareOrderLinkDesc,
  firstOrderPromoTitle,
  firstOrderPromoDesc,
  welcomeFootnote,
}: {
  welcomeTitle: string;
  welcomeBody: string;
  shareOrderLinkTitle: string;
  shareOrderLinkDesc: string;
  firstOrderPromoTitle: string;
  firstOrderPromoDesc: string;
  welcomeFootnote: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 text-2xl">
            🎉
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{welcomeTitle}</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              {welcomeBody}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Link
                href="/admin/publishing"
                className="block bg-white rounded-lg border border-gray-200 p-3 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-2">
                  <div className="text-emerald-500 mt-0.5">→</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{shareOrderLinkTitle}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{shareOrderLinkDesc}</div>
                  </div>
                </div>
              </Link>
              <Link
                href="/admin/promotions"
                className="block bg-white rounded-lg border border-gray-200 p-3 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-2">
                  <div className="text-emerald-500 mt-0.5">→</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{firstOrderPromoTitle}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{firstOrderPromoDesc}</div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400 italic">
        {welcomeFootnote}
      </div>
    </div>
  );
}

// ── Aggregate query helpers ──────────────────────────────────────────
//
// Kept tiny + explicit so the query plan is obvious from the call site.
// All four hit the existing (restaurantId, status, createdAt) composite
// index added in this change set.

async function sumRevenue(ids: string | string[], range: { from: Date; to: Date }): Promise<number> {
  const r = await prisma.order.aggregate({
    where: reportOrderWhere(ids, range),
    _sum: { total: true },
  });
  return r._sum.total ?? 0;
}

async function countReportOrders(ids: string | string[], range: { from: Date; to: Date }): Promise<number> {
  return prisma.order.count({ where: reportOrderWhere(ids, range) });
}

/** Distinct customer count for a window. Uses a raw groupBy on
 *  `customerId` (excluding null guest orders). We could include guests
 *  by hashing on email/phone but that adds noise — for the dashboard
 *  headline metric, "customers we know" is the more useful number. */
async function countDistinctCustomers(ids: string | string[], range: { from: Date; to: Date }): Promise<number> {
  const rows = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...reportOrderWhere(ids, range), customerId: { not: null } },
  });
  return rows.length;
}

/** Carry the active date range (preset / from / to) onto a drill-down link. */
function buildRangeQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const k of ["preset", "from", "to"]) {
    const v = sp[k];
    const val = Array.isArray(v) ? v[0] : v;
    if (val) u.set(k, val);
  }
  return u.toString();
}
