/**
 * /admin/reports/end-of-day
 *
 * End-of-day report. Defaults to the live snapshot of the current OPERATIONAL
 * day (store-hours aware — a 2am close belongs to the previous business day),
 * with a date stepper to look back up to 7 days. Reuses the same
 * `buildTodaySnapshot()` / `buildDayReport()` aggregation the digest cron + the
 * kitchen tablet use, so every surface agrees to the cent.
 *
 * GloriaFood-style layout: "Sales performance" (headline cards) + "Sales
 * breakdown" (subtotal / fees / tips / tax / total). Renders in the restaurant's
 * own currency. (Fabrizio 2026-06-01; EOD overhaul Luigi 2026-06-14.)
 */
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildTodaySnapshot, buildDayReport, currentOperationalDayKey } from "@/lib/digests";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { getRestaurantCurrency } from "@/lib/restaurant-currency";
import { getTranslations, getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;

function shiftKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function DeltaPill({ pct, vsLabel }: { pct: number; vsLabel: string }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-xs font-medium text-gray-400">—</span>;
  }
  const up = pct > 0;
  const sign = up ? "+" : "−";
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`} title={vsLabel}>
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

export default async function EndOfDayReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const __currency = await getRestaurantCurrency(user.restaurantId);
  const formatCurrency = (n: number) => fmtCurrency(n, __currency);

  // Resolve the operational day + 7-day look-back window (clamp the URL date).
  const todayKey = await currentOperationalDayKey(user.restaurantId);
  if (!todayKey) redirect("/admin");
  const minDayKey = shiftKey(todayKey, -LOOKBACK_DAYS);
  const sp = await searchParams;
  let dayKey = todayKey;
  if (sp?.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    dayKey = sp.date < minDayKey ? minDayKey : sp.date > todayKey ? todayKey : sp.date;
  }
  const isToday = dayKey === todayKey;

  const snapshot = isToday
    ? await buildTodaySnapshot(user.restaurantId)
    : await buildDayReport(user.restaurantId, dayKey);
  if (!snapshot) redirect("/admin");

  const t = await getTranslations("admin.endOfDayPage");
  const locale = await getLocale();
  const dateLabel = new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });

  const channels = [
    { label: "Pickup",   displayLabel: t("channelPickup"),   orders: snapshot.pickupOrders,   sales: snapshot.pickupSales },
    { label: "Delivery", displayLabel: t("channelDelivery"), orders: snapshot.deliveryOrders, sales: snapshot.deliverySales },
    { label: "Dine-in",  displayLabel: t("channelDineIn"),   orders: snapshot.dineInOrders,   sales: snapshot.dineInSales },
  ].sort((a, b) => b.orders - a.orders);

  const vsLabel = snapshot.comparisonLabel;
  const canPrev = dayKey > minDayKey;
  const canNext = dayKey < todayKey;
  const stepBtn = "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition";
  const stepBtnOff = "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-100 text-gray-300 cursor-not-allowed";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
          {/* Date stepper — look back up to 7 operational days. */}
          <div className="flex items-center gap-2 mt-2">
            {canPrev ? (
              <Link href={`?date=${shiftKey(dayKey, -1)}`} aria-label={t("prevDay")} className={stepBtn}>
                <ChevronLeft className="w-4 h-4" />
              </Link>
            ) : (
              <span className={stepBtnOff} aria-hidden><ChevronLeft className="w-4 h-4" /></span>
            )}
            <span className="text-sm font-medium text-gray-700 min-w-[10rem] text-center">
              {dateLabel}
              {isToday && (
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full align-middle">
                  {t("todayBadge")}
                </span>
              )}
            </span>
            {canNext ? (
              <Link href={`?date=${shiftKey(dayKey, 1)}`} aria-label={t("nextDay")} className={stepBtn}>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <span className={stepBtnOff} aria-hidden><ChevronRight className="w-4 h-4" /></span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-400 self-end">{t("autoRefreshNote")}</div>
      </header>

      {/* ── Sales performance ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900">{t("salesPerformanceHeading")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={t("cardSales")}        value={formatCurrency(snapshot.sales)}         delta={snapshot.salesDelta}         vsLabel={vsLabel} />
          <StatCard label={t("cardOrders")}       value={String(snapshot.orders)}                delta={snapshot.ordersDelta}        vsLabel={vsLabel} />
          <StatCard label={t("statAvgTicket")}    value={formatCurrency(snapshot.avgOrderValue)} delta={snapshot.avgOrderValueDelta} vsLabel={vsLabel} />
          <StatCard label={t("statReservations")} value={String(snapshot.tableReservations)}     delta={snapshot.reservationsDelta}  vsLabel={vsLabel} />
        </div>
      </section>

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

      {/* ── Payment split + Sales breakdown ───────────────────────── */}
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
          <h2 className="font-semibold text-gray-900 mb-3">{t("salesBreakdownHeading")}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700"><span>{t("breakdownSubtotal")}</span><span className="font-semibold">{formatCurrency(snapshot.subTotals)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownDeliveryFees")}</span><span className="font-semibold">{formatCurrency(snapshot.deliveryFees)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownTips")}</span><span className="font-semibold">{formatCurrency(snapshot.tips)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownOtherFees")}</span><span className="font-semibold">{formatCurrency(snapshot.otherFees)}</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("breakdownTax")}</span><span className="font-semibold">{formatCurrency(snapshot.taxAmount)}</span></div>
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
