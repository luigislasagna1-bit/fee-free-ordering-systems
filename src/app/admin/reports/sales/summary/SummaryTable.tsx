"use client";

import { useSortableRows, SortableTh } from "@/components/admin/sortable";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import type { SummaryRow } from "@/lib/reports/summary-rows";

/**
 * Client half of /admin/reports/sales/summary — the table only.
 *
 * Split out of the (server) page so the numeric/money columns get the shared
 * click-to-sort affordance (src/components/admin/sortable.tsx). All labels are
 * translated server-side and passed in, so this component adds NO i18n keys.
 *
 * The bold TOTAL row stays in <tfoot>, deliberately OUTSIDE the sortable row
 * set — it is pinned to the bottom whatever the sort. Default (no-sort) order
 * is exactly the server order.
 */

export type SummaryRowView = SummaryRow & { label: string };

export type SummaryTableLabels = {
  dim: string;
  orders: string;
  subtotal: string;
  discounts: string;
  tax: string;
  deliveryFee: string;
  tips: string;
  otherFees: string;
  total: string;
  rewardCredit: string;
  amountCollected: string;
  totalRow: string;
  emptyState: string;
};

const TH_RIGHT = "py-2.5 px-4 font-semibold text-right";

export function SummaryTable({ rows, totals, currency, showCredit, labels }: {
  rows: SummaryRowView[];
  totals: SummaryRow;
  currency: string;
  showCredit: boolean;
  labels: SummaryTableLabels;
}) {
  const formatCurrency = (n: number) => fmtCurrency(n, currency);
  const colCount = showCredit ? 11 : 9;

  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<SummaryRowView>(rows, {
    orders: (r) => r.orders,
    subtotal: (r) => r.subtotal,
    discounts: (r) => r.discounts,
    tax: (r) => r.tax,
    deliveryFee: (r) => r.deliveryFee,
    tips: (r) => r.tips,
    otherFees: (r) => r.otherFees,
    total: (r) => r.total,
    storeCredit: (r) => r.storeCredit,
    collected: (r) => r.collected,
  });

  const th = (id: string, label: string) => (
    <SortableTh label={label} sortId={id} sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className={TH_RIGHT} />
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
      <table className={`w-full text-sm ${showCredit ? "min-w-[1100px]" : "min-w-[940px]"}`}>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
            <th className="py-2.5 px-4 font-semibold">{labels.dim}</th>
            {th("orders", labels.orders)}
            {th("subtotal", labels.subtotal)}
            {th("discounts", labels.discounts)}
            {th("tax", labels.tax)}
            {th("deliveryFee", labels.deliveryFee)}
            {th("tips", labels.tips)}
            {th("otherFees", labels.otherFees)}
            {th("total", labels.total)}
            {showCredit && (
              <>
                {th("storeCredit", labels.rewardCredit)}
                {th("collected", labels.amountCollected)}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={colCount} className="py-6 px-4 text-center text-gray-400 italic">{labels.emptyState}</td></tr>
          )}
          {sorted.map((r) => (
            <tr key={r.key} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-2.5 px-4 font-medium text-gray-800">{r.label}</td>
              <td className="py-2.5 px-4 text-right text-gray-700">{r.orders.toLocaleString()}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.subtotal)}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{r.discounts > 0 ? `−${formatCurrency(r.discounts)}` : formatCurrency(0)}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.tax)}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.deliveryFee)}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.tips)}</td>
              <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(r.otherFees)}</td>
              <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.total)}</td>
              {showCredit && (
                <>
                  <td className="py-2.5 px-4 text-right text-gray-600">{r.storeCredit > 0 ? `−${formatCurrency(r.storeCredit)}` : formatCurrency(0)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.collected)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
              <td className="py-3 px-4">{labels.totalRow}</td>
              <td className="py-3 px-4 text-right">{totals.orders.toLocaleString()}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.subtotal)}</td>
              <td className="py-3 px-4 text-right">{totals.discounts > 0 ? `−${formatCurrency(totals.discounts)}` : formatCurrency(0)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.tax)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.deliveryFee)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.tips)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.otherFees)}</td>
              <td className="py-3 px-4 text-right">{formatCurrency(totals.total)}</td>
              {showCredit && (
                <>
                  <td className="py-3 px-4 text-right">−{formatCurrency(totals.storeCredit)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(totals.collected)}</td>
                </>
              )}
            </tr>
          </tfoot>
        )}
      </table>
      </div>
    </div>
  );
}
