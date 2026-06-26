import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/menu-insights/categories
 *
 * Per-category sales breakdown — count + revenue + share-of-revenue.
 * Matches the GloriaFood "Menu Insights by Category" screenshot.
 *
 * Data path: OrderItem rows in the date range JOIN MenuItem JOIN
 * MenuCategory, group by category. Items orphaned from their category
 * (rare — happens when a menu item is deleted post-sale) are bucketed
 * under "Uncategorized" so the row total still reconciles to the
 * Sales report totals.
 */
export default async function MenuInsightsCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.reportMenuCategories");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);
  const formatCurrency = (n: number) => fmtCurrency(n, scope.currency);

  // We pull OrderItem rows with their MenuItem→MenuCategory chain.
  // For restaurants with high OrderItem volume this is the heaviest
  // query in the reports system — when we add the daily snapshot
  // table to cache category rollups, hook the read in here.
  const items = await prisma.orderItem.findMany({
    where: {
      order: reportOrderWhere(scope.ids, range),
    },
    select: {
      quantity: true,
      subtotal: true,
      menuItem: { select: { category: { select: { id: true, name: true } } } },
    },
  });

  // Bucket in-process by categoryId. Map keeps insertion order so
  // sorting by revenue at the end is straightforward.
  type Bucket = { categoryId: string | null; name: string; itemsSold: number; revenue: number; lineCount: number };
  const buckets = new Map<string, Bucket>();
  for (const it of items) {
    const cat = it.menuItem?.category;
    const id = cat?.id ?? "_uncategorized";
    const name = cat?.name ?? "Uncategorized";
    const b = buckets.get(id) ?? { categoryId: cat?.id ?? null, name, itemsSold: 0, revenue: 0, lineCount: 0 };
    b.itemsSold += it.quantity;
    b.revenue += it.subtotal;
    b.lineCount += 1;
    buckets.set(id, b);
  }
  const rows = Array.from(buckets.values()).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("pageSubtitle", { range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker />
          <ExportMenu exportUrl="/api/admin/reports/menu-insights/categories/export" currentQuery={buildQuery(sp)} compact={false} />
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{t("colCategory")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colItemsSold")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colRevenue")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colPctOfRevenue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="py-6 px-4 text-center text-gray-400 italic">{t("emptyState")}</td></tr>
            )}
            {rows.map((r) => {
              const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r.itemsSold.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.revenue)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}
