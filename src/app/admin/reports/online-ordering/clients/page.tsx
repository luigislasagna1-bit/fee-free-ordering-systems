import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { previousPeriod } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { Users, UserPlus, Repeat, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/online-ordering/clients
 *
 * Dashboard-style page (NOT a list — see /admin/reports/list/clients
 * for the table). Matches the GloriaFood "Clients" overview screenshot:
 *   - 4 KPI cards: Total / New / Returning / Avg orders per client
 *   - 2 add-on activation CTAs (placeholder for future cross-sells)
 *
 * "New" = first order with us is within the date range.
 * "Returning" = had at least one order BEFORE the range AND one DURING.
 */
export default async function ClientsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const t = await getTranslations("admin.reportOnlineClients");

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);
  const formatCurrency = (n: number) => fmtCurrency(n, scope.currency);

  // Three groupBy queries, all on the (restaurantId, createdAt) index.
  // The "new vs returning" split is computed in two passes:
  //   1. Customers who ordered IN the range.
  //   2. Of those, customers who ALSO ordered BEFORE the range.
  //      Difference = new-in-range.
  const [inRange, prior] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...reportOrderWhere(scope.ids, range), customerId: { not: null } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        restaurantId: { in: scope.ids },
        ...REPORT_ORDER_STATUS_WHERE,
        customerId: { not: null },
        createdAt: { lt: range.from },
      },
    }),
  ]);

  const priorIds = new Set(prior.map((p) => p.customerId));
  const returning = inRange.filter((r) => priorIds.has(r.customerId));
  const newInRange = inRange.filter((r) => !priorIds.has(r.customerId));
  const totalOrders = inRange.reduce((s, r) => s + r._count, 0);
  const totalSpend = inRange.reduce((s, r) => s + (r._sum.total ?? 0), 0);
  const avgOrders = inRange.length > 0 ? totalOrders / inRange.length : 0;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("pageSubtitle", { range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker />
          <ExportMenu
            exportUrl="/api/admin/reports/online-ordering/clients/export"
            currentQuery={buildQuery(sp)}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={Users}      accent="blue"    label={t("kpiTotalClients")}     value={inRange.length.toLocaleString()} />
        <Kpi icon={UserPlus}   accent="emerald" label={t("kpiNewClients")}       value={newInRange.length.toLocaleString()} />
        <Kpi icon={Repeat}     accent="purple"  label={t("kpiReturningClients")} value={returning.length.toLocaleString()} />
        <Kpi icon={TrendingUp} accent="amber"   label={t("kpiAvgOrdersPerClient")} value={avgOrders.toFixed(1)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">{t("spendOverviewTitle")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">{t("totalSpendInRange")}</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalSpend)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{t("spendFromReturningClients")}</div>
            <div className="text-xl font-bold text-gray-900">
              {formatCurrency(returning.reduce((s, r) => s + (r._sum.total ?? 0), 0))}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {inRange.length > 0
                ? t("returningClientsPercent", { pct: ((returning.length / inRange.length) * 100).toFixed(0) })
                : "—"}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 italic mt-2">
        {t.rich("listViewLink", {
          a: (chunks) => <a href="/admin/reports/list/clients" className="text-emerald-600 hover:underline">{chunks}</a>,
        })}
      </p>
    </div>
  );
}

/** Re-stringify the searchParams object into a URLSearchParams-safe query
 *  string, so the export honors the active filters (preset/from/to + any
 *  report-specific params). Mirrors /admin/reports/sales/trend. */
function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}

function Kpi({
  icon: Icon, accent, label, value,
}: {
  icon: typeof Users;
  accent: "blue" | "emerald" | "purple" | "amber";
  label: string;
  value: string;
}) {
  const ring = {
    blue:    "bg-blue-50    text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple:  "bg-purple-50  text-purple-600",
    amber:   "bg-amber-50   text-amber-600",
  }[accent];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ring}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
