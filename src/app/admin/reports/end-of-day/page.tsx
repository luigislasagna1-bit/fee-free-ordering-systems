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
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

function DeltaPill({ pct, vsLabel }: { pct: number; vsLabel: string }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-xs font-medium text-gray-400">—</span>;
  }
  const up = pct > 0;
  const sign = up ? "+" : "−";
  return (
    <span
      className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}
      title={vsLabel}
    >
      {sign}
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function StatCard({
  label, value, delta, vsLabel,
}: { label: string; value: string; delta?: number; vsLabel: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {delta !== undefined && <DeltaPill pct={delta} vsLabel={vsLabel} />}
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

  const t = await getTranslations("admin.endOfDayPage");

  // Channel breakdown — top three order types in order of volume so
  // the kitchen quickly sees "we've done way more pickup than delivery today".
  const channels = [
    { label: "Pickup",   displayLabel: t("channelPickup"),   orders: snapshot.pickupOrders,   sales: snapshot.pickupSales },
    { label: "Delivery", displayLabel: t("channelDelivery"), orders: snapshot.deliveryOrders, sales: snapshot.deliverySales },
    { label: "Dine-in",  displayLabel: t("channelDineIn"),   orders: snapshot.dineInOrders,   sales: snapshot.dineInSales },
  ].sort((a, b) => b.orders - a.orders);

  const vsLabel = t("vsYesterday");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t.rich("liveSnapshotFor", {
              period: () => <span className="font-medium text-gray-700">{snapshot.periodLabel}</span>,
              comparison: () => <span className="text-gray-400">{snapshot.comparisonLabel}</span>,
            })}
          </p>
        </div>
        <div className="text-xs text-gray-400 self-end">
          {t("autoRefreshNote")}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("statSalesToday")}    value={formatCurrency(snapshot.sales)}            delta={snapshot.salesDelta}          vsLabel={vsLabel} />
        <StatCard label={t("statOrdersToday")}   value={String(snapshot.orders)}                   delta={snapshot.ordersDelta}         vsLabel={vsLabel} />
        <StatCard label={t("statAvgTicket")}      value={formatCurrency(snapshot.avgOrderValue)}    delta={snapshot.avgOrderValueDelta}  vsLabel={vsLabel} />
        <StatCard label={t("statReservations")}  value={String(snapshot.tableReservations)}         delta={snapshot.reservationsDelta}   vsLabel={vsLabel} />
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{t("byChannelHeading")}</h2>
          <span className="text-xs text-gray-500">{t("totalOrders", { count: snapshot.orders })}</span>
        </div>
        <div className="divide-y divide-gray-100">
          {channels.map((c) => (
            <div key={c.label} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-800">{c.displayLabel}</div>
                <div className="text-xs text-gray-500">{t("orderCount", { count: c.orders })}</div>
              </div>
              <div className="font-semibold text-gray-900">{formatCurrency(c.sales)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{t("paymentSplitHeading")}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>{t("paymentOnline")}</span>
              <span className="font-semibold">{formatCurrency(snapshot.onlinePaymentsAmount)} · {snapshot.onlinePayments}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>{t("paymentOffline")}</span>
              <span className="font-semibold">{formatCurrency(snapshot.offlinePaymentsAmount)} · {snapshot.offlinePayments}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{t("moneyBreakdownHeading")}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700"><span>{t("breakdownSubtotal")}</span><span className="font-semibold">{formatCurrency(snapshot.subTotals)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownTax")}</span><span className="font-semibold">{formatCurrency(snapshot.taxAmount)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownDeliveryFees")}</span><span className="font-semibold">{formatCurrency(snapshot.deliveryFees)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownTips")}</span><span className="font-semibold">{formatCurrency(snapshot.tips)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownOtherFees")}</span><span className="font-semibold">{formatCurrency(snapshot.otherFees)}</span></div>
            <div className="flex justify-between text-gray-900 border-t border-gray-100 pt-2 mt-2 font-bold">
              <span>{t("breakdownTotal")}</span>
              <span>{formatCurrency(snapshot.total)}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
