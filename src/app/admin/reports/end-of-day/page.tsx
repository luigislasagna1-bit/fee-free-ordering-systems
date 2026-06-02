/**
 * /admin/reports/end-of-day
 *
 * Live snapshot of today's numbers — owner can open this mid-service to
 * see where they stand without waiting for the next morning's digest
 * email. Reuses the same `buildTodaySnapshot()` aggregation the digest
 * cron uses, so the on-screen view and the morning email always agree.
 *
 * Compared against "same time yesterday" so the deltas read as
 * meaningful at any hour of the day, not against a full 24h yesterday
 * total (which would always look bad at noon).
 *
 * (Fabrizio 2026-06-01 — feature parity with GloriaFood's
 * "end of day report" tile in the admin sidebar.)
 */
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { buildTodaySnapshot } from "@/lib/digests";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function DeltaPill({ pct }: { pct: number }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-xs font-medium text-gray-400">—</span>;
  }
  const up = pct > 0;
  const sign = up ? "+" : "−";
  return (
    <span
      className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}
      title="vs same time yesterday"
    >
      {sign}
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function StatCard({
  label, value, delta,
}: { label: string; value: string; delta?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {delta !== undefined && <DeltaPill pct={delta} />}
      </div>
    </div>
  );
}

export default async function EndOfDayReportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const snapshot = await buildTodaySnapshot(user.restaurantId);
  if (!snapshot) redirect("/admin");

  // Channel breakdown — top three order types in order of volume so
  // the kitchen quickly sees "we've done way more pickup than delivery today".
  const channels = [
    { label: "Pickup",   orders: snapshot.pickupOrders,   sales: snapshot.pickupSales },
    { label: "Delivery", orders: snapshot.deliveryOrders, sales: snapshot.deliverySales },
    { label: "Dine-in",  orders: snapshot.dineInOrders,   sales: snapshot.dineInSales },
  ].sort((a, b) => b.orders - a.orders);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">End of day report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live snapshot for <span className="font-medium text-gray-700">{snapshot.periodLabel}</span> ·{" "}
            <span className="text-gray-400">{snapshot.comparisonLabel}</span>
          </p>
        </div>
        <div className="text-xs text-gray-400 self-end">
          Auto-refresh on page load. Email digest fires once a day after midnight UTC.
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sales today"  value={formatCurrency(snapshot.sales)}   delta={snapshot.salesDelta} />
        <StatCard label="Orders today" value={String(snapshot.orders)}          delta={snapshot.ordersDelta} />
        <StatCard label="Avg ticket"   value={formatCurrency(snapshot.avgOrderValue)} delta={snapshot.avgOrderValueDelta} />
        <StatCard label="Reservations" value={String(snapshot.tableReservations)} delta={snapshot.reservationsDelta} />
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">By channel</h2>
          <span className="text-xs text-gray-500">{snapshot.orders} total orders</span>
        </div>
        <div className="divide-y divide-gray-100">
          {channels.map((c) => (
            <div key={c.label} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-800">{c.label}</div>
                <div className="text-xs text-gray-500">{c.orders} order{c.orders === 1 ? "" : "s"}</div>
              </div>
              <div className="font-semibold text-gray-900">{formatCurrency(c.sales)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Payment split</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Online (card)</span>
              <span className="font-semibold">{formatCurrency(snapshot.onlinePaymentsAmount)} · {snapshot.onlinePayments}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Offline (cash / in person)</span>
              <span className="font-semibold">{formatCurrency(snapshot.offlinePaymentsAmount)} · {snapshot.offlinePayments}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Money breakdown</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700"><span>Subtotal</span><span className="font-semibold">{formatCurrency(snapshot.subTotals)}</span></div>
            <div className="flex justify-between text-gray-700"><span>Tax</span><span className="font-semibold">{formatCurrency(snapshot.taxAmount)}</span></div>
            <div className="flex justify-between text-gray-700"><span>Delivery fees</span><span className="font-semibold">{formatCurrency(snapshot.deliveryFees)}</span></div>
            <div className="flex justify-between text-gray-700"><span>Tips</span><span className="font-semibold">{formatCurrency(snapshot.tips)}</span></div>
            <div className="flex justify-between text-gray-700"><span>Other fees</span><span className="font-semibold">{formatCurrency(snapshot.otherFees)}</span></div>
            <div className="flex justify-between text-gray-900 border-t border-gray-100 pt-2 mt-2 font-bold">
              <span>Total taken in</span>
              <span>{formatCurrency(snapshot.total)}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
