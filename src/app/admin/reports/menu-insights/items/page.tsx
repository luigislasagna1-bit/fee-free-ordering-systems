import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { parseDateRange, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/menu-insights/items
 *
 * Per-item sales table — units sold, revenue, share-of-revenue.
 * Matches the GloriaFood "Menu Insights by Item" screenshot.
 *
 * Grouped by OrderItem.name (NOT by menuItemId) so renamed items still
 * reconcile to their historical sales — important because owners do
 * rename items as recipes evolve and we don't want last year's
 * "Margherita" to disappear when they call it "Classic Margherita" today.
 *
 * Once the MenuItemView model has data, the "Views" column will be
 * added (alongside a conversion-rate calc: orders ÷ views). Today the
 * column placeholder reads "—" because no views are being collected.
 */
export default async function MenuInsightsItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  // groupBy the easy way — Prisma does the heavy lifting server-side.
  const rows = await prisma.orderItem.groupBy({
    by: ["name"],
    where: {
      order: {
        restaurantId,
        status: "completed",
        createdAt: { gte: range.from, lte: range.to },
      },
    },
    _sum: { quantity: true, subtotal: true },
    _count: true,
    orderBy: { _sum: { subtotal: "desc" } },
    take: 100, // hard cap — the export endpoint will offer the unbounded version
  });

  const totalRevenue = rows.reduce((s, r) => s + (r._sum.subtotal ?? 0), 0);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Insights — Items</h1>
          <p className="text-sm text-gray-500 mt-0.5">Top 100 items by revenue · {formatRangeLabel(range)}</p>
        </div>
        <DateRangePicker />
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">Item</th>
              <th className="py-2.5 px-4 font-semibold text-right">Units sold</th>
              <th className="py-2.5 px-4 font-semibold text-right">Order lines</th>
              <th className="py-2.5 px-4 font-semibold text-right">Revenue</th>
              <th className="py-2.5 px-4 font-semibold text-right">% of revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 px-4 text-center text-gray-400 italic">No items sold in this range.</td></tr>
            )}
            {rows.map((r) => {
              const revenue = r._sum.subtotal ?? 0;
              const pct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{(r._sum.quantity ?? 0).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-gray-500">{r._count.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(revenue)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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

        <div className="absolute bottom-3 right-3">
          <ExportMenu exportUrl="/api/admin/reports/menu-insights/items/export" currentQuery={buildQuery(sp)} />
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
