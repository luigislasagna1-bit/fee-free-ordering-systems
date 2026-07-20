"use client";

import { useSortableRows, SortableTh } from "@/components/admin/sortable";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import type { PromoStatRow } from "@/lib/reports/promo-rows";

/**
 * Client half of /admin/reports/online-ordering/promotions — the table only.
 *
 * Split out of the (server) page so name / redemptions / discount / revenue
 * get the shared click-to-sort affordance (src/components/admin/sortable.tsx).
 * All labels are translated server-side and passed in — NO new i18n keys.
 * Default (no-sort) order is exactly the server order; the "% of revenue"
 * column is derived from revenue so it doesn't need its own sorter.
 */

export type PromotionsTableLabels = {
  coupon: string;
  name: string;
  redemptions: string;
  discount: string;
  revenue: string;
  pctOfRevenue: string;
  emptyState: string;
};

export function PromotionsTable({ rows, totalRevenue, currency, labels }: {
  rows: PromoStatRow[];
  totalRevenue: number;
  currency: string;
  labels: PromotionsTableLabels;
}) {
  const formatCurrency = (n: number) => fmtCurrency(n, currency);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<PromoStatRow>(rows, {
    name: (r) => r.name,
    redemptions: (r) => r.redemptions,
    discount: (r) => r.discount,
    revenue: (r) => r.revenue,
  });

  const common = { sortKey, sortDir, onToggle: toggleSort };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
            <th className="py-2.5 px-4 font-semibold">{labels.coupon}</th>
            <SortableTh label={labels.name} sortId="name" className="py-2.5 px-4 font-semibold" {...common} />
            <SortableTh label={labels.redemptions} sortId="redemptions" className="py-2.5 px-4 font-semibold text-right" {...common} />
            <SortableTh label={labels.discount} sortId="discount" className="py-2.5 px-4 font-semibold text-right" {...common} />
            <SortableTh label={labels.revenue} sortId="revenue" className="py-2.5 px-4 font-semibold text-right" {...common} />
            <th className="py-2.5 px-4 font-semibold text-right">{labels.pctOfRevenue}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={6} className="py-6 px-4 text-center text-gray-400 italic">{labels.emptyState}</td></tr>
          )}
          {sorted.map((r) => {
            const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
            return (
              <tr key={`${r.name}|${r.code}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2.5 px-4 font-mono text-xs text-gray-800">{r.code || "—"}</td>
                <td className="py-2.5 px-4 text-gray-600 max-w-xs truncate">{r.name}</td>
                <td className="py-2.5 px-4 text-right text-gray-700">{r.redemptions.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-right text-red-600">{formatCurrency(r.discount)}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.revenue)}</td>
                <td className="py-2.5 px-4 text-right text-gray-500">{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
