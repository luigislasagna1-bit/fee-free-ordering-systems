"use client";
import Link from "next/link";
import {
  BarChart3, TrendingUp, ShoppingBag, DollarSign,
  Building2, ArrowUpRight, Rocket,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BrandReportPayload } from "@/lib/brand-reports";

/**
 * Brand-level reports dashboard. Surfaces:
 *   - Top-line totals across every location in the brand
 *   - Per-location revenue + order table (with click-through to each
 *     location's own reports page)
 *   - Top 10 items chain-wide
 *   - 7-day trend chart aggregated across all locations
 *
 * Time range is fixed at 30 days for v1 — a range picker can be added
 * later as a query-string param.
 */
export function BrandReports({ payload }: { payload: BrandReportPayload }) {
  const maxRevenue = Math.max(...payload.daily.map((d) => d.revenue), 1);
  const maxLocationRev = Math.max(...payload.perLocation.map((l) => l.revenue), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-500" />
            {payload.brandName} — Chain Reports
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Last 30 days · {payload.totals.locations} location{payload.totals.locations === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Chain-wide deeper reports — Coming Soon ─────────────────────────
          Revenue, orders, top items and per-location breakdown are wired
          today. The rest of the per-location Reports suite (Funnel,
          Visits, Heatmap, Connectivity Health, Promotions Stats) is not
          yet aggregated chain-wide — owners can drill into a single
          location's reports for those. Custom date ranges also land in
          the post-launch pass. */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
          <Rocket className="w-4 h-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-sm font-bold text-amber-900">Deeper chain-wide reports</h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
          <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
            What you see today: revenue, orders, top items and per-location breakdown for the last 30 days. Coming next: chain-wide Funnel, Website Visits, Delivery Heatmap, Connectivity Health and custom date ranges. For those reports today, click into any single location below.
          </p>
        </div>
      </div>

      {/* Top-line cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Revenue", value: formatCurrency(payload.totals.revenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: "Completed Orders", value: payload.totals.completedCount, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Average Order", value: formatCurrency(payload.totals.averageOrder), icon: TrendingUp, color: "text-amber-500", bg: "bg-amber-50" },
          { label: "Total Orders", value: payload.totals.orderCount, icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-50" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{s.label}</span>
              <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* 7-day trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue — Last 7 Days (Chain-Wide)</h2>
          <div className="space-y-3">
            {payload.daily.map((d) => (
              <div key={d.date}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{d.date}</span>
                  <span>
                    {d.orderCount} order{d.orderCount === 1 ? "" : "s"} · {formatCurrency(d.revenue)}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top 10 Items — Chain-Wide</h2>
          {payload.topItems.length === 0 ? (
            <p className="text-sm text-gray-400">No items sold in this range yet.</p>
          ) : (
            <div className="space-y-2">
              {payload.topItems.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-bold w-6 text-center text-gray-400">{i + 1}</span>
                    <span className="text-sm text-gray-900 truncate">{item.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{item.quantity}</div>
                    <div className="text-xs text-gray-500">{formatCurrency(item.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-location breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Revenue by Location</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-4 font-medium">Location</th>
                <th className="py-2 pr-4 font-medium text-right">Orders</th>
                <th className="py-2 pr-4 font-medium text-right">Revenue</th>
                <th className="py-2 pr-4 font-medium text-right">Avg Order</th>
                <th className="py-2 font-medium hidden md:table-cell">Share</th>
              </tr>
            </thead>
            <tbody>
              {payload.perLocation.map((loc) => {
                const sharePct = payload.totals.revenue > 0
                  ? (loc.revenue / payload.totals.revenue) * 100
                  : 0;
                return (
                  <tr key={loc.restaurantId} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-900">{loc.name}</div>
                      {loc.city && <div className="text-xs text-gray-500">{loc.city}</div>}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div>{loc.completedCount}</div>
                      <div className="text-xs text-gray-400">of {loc.orderCount}</div>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(loc.revenue)}</td>
                    <td className="py-3 pr-4 text-right text-gray-600">{formatCurrency(loc.averageOrder)}</td>
                    <td className="py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px] max-w-[120px]">
                          <div
                            className="h-full bg-amber-500"
                            style={{ width: `${(loc.revenue / maxLocationRev) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{sharePct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Click a location in the brand dashboard to drill into its own per-location reports.
        </p>
      </div>
    </div>
  );
}
