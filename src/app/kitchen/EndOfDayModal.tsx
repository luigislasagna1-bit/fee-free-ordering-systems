/**
 * Kitchen tablet end-of-day report modal.
 *
 * Pulls a day's stats from /api/kitchen/end-of-day (same operational-day
 * aggregation as the email digest cron + /admin/reports/end-of-day) and lets
 * the owner glance at the numbers, step back up to 7 days, and print the
 * selected day to the connected thermal printer.
 *
 * Print path mirrors `printReservation` — server returns structured `lines`,
 * the kitchen client hands them to the Star native bridge. Printing a past day
 * "just works": whatever day is on screen is the day that prints.
 *
 * Luigi 2026-06-02; EOD overhaul (operational day + date stepper + currency)
 * 2026-06-14.
 */
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X, Printer, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { ThemeMode } from "./kitchen-types";
import { formatCurrency } from "@/lib/utils";

type Stats = {
  restaurantName: string;
  periodLabel: string;
  comparisonLabel: string;
  sales: number; salesDelta: number;
  orders: number; ordersDelta: number;
  avgOrderValue: number; avgOrderValueDelta: number;
  tableReservations: number; reservationsDelta: number;
  pickupOrders: number; pickupSales: number;
  deliveryOrders: number; deliverySales: number;
  dineInOrders: number; dineInSales: number;
  offlinePayments: number; offlinePaymentsAmount: number;
  onlinePayments: number; onlinePaymentsAmount: number;
  subTotals: number; taxAmount: number; deliveryFees: number; tips: number; otherFees: number; total: number;
  /** Money-normalization additions (Luigi 2026-07-02): discounts given, store
   *  credit redeemed (a tender, not cash/card) and real cash/card collected.
   *  Optional so a stale cached API payload can't crash the modal. */
  discounts?: number; storeCreditRedeemed?: number; collected?: number;
};

let activeCurrency = "usd";
function fmt(n: number): string {
  return formatCurrency(n ?? 0, activeCurrency);
}

/** Shift a "YYYY-MM-DD" key by N days (noon-UTC anchor, DST-safe). */
function shiftKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function DeltaPill({ pct }: { pct: number }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-[10px] font-medium text-gray-400">—</span>;
  }
  const up = pct > 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      {up ? "+" : "−"}{Math.abs(Math.round(pct))}%
    </span>
  );
}

export function EndOfDayModal({
  open,
  onClose,
  onPrint,
  themeMode,
  currency = "usd",
}: {
  open: boolean;
  onClose: () => void;
  currency?: string;
  onPrint: (payload: { lines: unknown[]; bytes?: string | null; width: number }) => Promise<void>;
  themeMode: ThemeMode;
}) {
  activeCurrency = currency;
  const t = useTranslations("admin.endOfDayPage");
  const tMoney = useTranslations("money");
  const tk = useTranslations("kitchen");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [printing, setPrinting] = useState(false);
  const [linesPayload, setLinesPayload] = useState<{ lines: unknown[]; width: number } | null>(null);
  // Date stepper state. `viewDate` null = the current operational day. Bounds
  // come from the API (it owns the operational-day + 7-day-lookback math).
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ dayKey: string; todayKey: string; minDayKey: string } | null>(null);

  const isDark = themeMode === "dark";

  const fetchSnapshot = async (date: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kitchen/end-of-day${date ? `?date=${date}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const body = await res.json();
      setStats(body.stats);
      setLinesPayload({ lines: body.lines, width: body.width });
      setBounds({ dayKey: body.dayKey, todayKey: body.todayKey, minDayKey: body.minDayKey });
    } catch (e: any) {
      toast.error(e?.message ?? tk("eodLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  // (Re)load when opened or when the stepped date changes.
  useEffect(() => {
    if (open) fetchSnapshot(viewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viewDate]);

  // Reset to "today" each time the modal is re-opened.
  useEffect(() => {
    if (open) setViewDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handlePrint = async () => {
    if (!linesPayload) { toast.error(tk("eodNothingToPrint")); return; }
    setPrinting(true);
    try {
      await onPrint({ lines: linesPayload.lines, bytes: null, width: linesPayload.width });
      toast.success(tk("eodPrinted"));
    } catch (e: any) {
      toast.error(e?.message ?? tk("eodPrintFailed"));
    } finally {
      setPrinting(false);
    }
  };

  const isToday = !!bounds && bounds.dayKey === bounds.todayKey;
  const canPrev = !!bounds && bounds.dayKey > bounds.minDayKey;
  const canNext = !!bounds && bounds.dayKey < bounds.todayKey;
  const dateLabel = bounds
    ? new Date(`${bounds.dayKey}T12:00:00Z`).toLocaleDateString(locale || undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : stats?.periodLabel ?? "";

  const card = isDark ? "bg-gray-700/40" : "bg-gray-50";
  const sub = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <h2 className="text-lg font-bold">{t("heading")}</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fetchSnapshot(viewDate)} disabled={loading}
              className={`p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} disabled:opacity-50`} title={tk("eodRefresh")}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} className={`p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date stepper */}
        <div className={`flex items-center justify-center gap-3 px-5 py-2.5 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <button type="button" onClick={() => bounds && setViewDate(shiftKey(bounds.dayKey, -1))} disabled={!canPrev}
            aria-label={t("prevDay")} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} disabled:opacity-30 disabled:pointer-events-none`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[8.5rem] text-center">
            {dateLabel}
            {isToday && (
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full align-middle">
                {t("todayBadge")}
              </span>
            )}
          </span>
          <button type="button" onClick={() => bounds && setViewDate(shiftKey(bounds.dayKey, 1))} disabled={!canNext}
            aria-label={t("nextDay")} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} disabled:opacity-30 disabled:pointer-events-none`}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && !stats && (
            <div className={`text-center text-sm py-10 ${sub}`}>{tk("eodLoading")}</div>
          )}
          {stats && (
            <>
              {/* Sales performance */}
              <div className={`text-[10px] uppercase tracking-wider font-semibold ${sub}`}>{t("salesPerformanceHeading")}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 ${card}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${sub}`}>{t("cardSales")}</div>
                  <div className="text-xl font-bold mt-1">{fmt(stats.sales)}</div>
                  <DeltaPill pct={stats.salesDelta} />
                </div>
                <div className={`rounded-xl p-3 ${card}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${sub}`}>{t("cardOrders")}</div>
                  <div className="text-xl font-bold mt-1">{stats.orders}</div>
                  <DeltaPill pct={stats.ordersDelta} />
                </div>
                <div className={`rounded-xl p-3 ${card}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${sub}`}>{t("statAvgTicket")}</div>
                  <div className="text-xl font-bold mt-1">{fmt(stats.avgOrderValue)}</div>
                  <DeltaPill pct={stats.avgOrderValueDelta} />
                </div>
                <div className={`rounded-xl p-3 ${card}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${sub}`}>{t("statReservations")}</div>
                  <div className="text-xl font-bold mt-1">{stats.tableReservations}</div>
                  <DeltaPill pct={stats.reservationsDelta} />
                </div>
              </div>

              {/* By channel */}
              <div className={`rounded-xl p-3 ${card}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-2 ${sub}`}>{t("byChannelHeading")}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>{t("channelPickup")}</span><span className="font-semibold">{stats.pickupOrders} · {fmt(stats.pickupSales)}</span></div>
                  <div className="flex justify-between"><span>{t("channelDelivery")}</span><span className="font-semibold">{stats.deliveryOrders} · {fmt(stats.deliverySales)}</span></div>
                  <div className="flex justify-between"><span>{t("channelDineIn")}</span><span className="font-semibold">{stats.dineInOrders} · {fmt(stats.dineInSales)}</span></div>
                </div>
              </div>

              {/* Sales breakdown */}
              <div className={`rounded-xl p-3 ${card}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-2 ${sub}`}>{t("salesBreakdownHeading")}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>{t("paymentOnline")}</span><span>{stats.onlinePayments} · {fmt(stats.onlinePaymentsAmount)}</span></div>
                  <div className="flex justify-between"><span>{t("paymentOffline")}</span><span>{stats.offlinePayments} · {fmt(stats.offlinePaymentsAmount)}</span></div>
                  <div className="h-px bg-gray-400/30 my-2" />
                  <div className="flex justify-between"><span>{t("breakdownSubtotal")}</span><span>{fmt(stats.subTotals)}</span></div>
                  {(stats.discounts ?? 0) > 0 && (
                    <div className="flex justify-between"><span>{tMoney("discounts")}</span><span>−{fmt(stats.discounts!)}</span></div>
                  )}
                  <div className="flex justify-between"><span>{t("breakdownDeliveryFees")}</span><span>{fmt(stats.deliveryFees)}</span></div>
                  <div className="flex justify-between"><span>{t("breakdownTips")}</span><span>{fmt(stats.tips)}</span></div>
                  <div className="flex justify-between"><span>{t("breakdownOtherFees")}</span><span>{fmt(stats.otherFees)}</span></div>
                  <div className="flex justify-between"><span>{t("breakdownTax")}</span><span>{fmt(stats.taxAmount)}</span></div>
                  <div className="h-px bg-gray-400/30 my-2" />
                  <div className="flex justify-between font-bold"><span>{t("breakdownTotal")}</span><span>{fmt(stats.total)}</span></div>
                  {/* Store credit is a tender — staff reconcile the drawer/processor
                      against COLLECTED, never the gross total. Rows only appear when
                      credit was actually redeemed (feature-gated by the data). */}
                  {(stats.storeCreditRedeemed ?? 0) > 0 && (
                    <>
                      <div className="flex justify-between"><span>{tMoney("pay.rewardCredit")}</span><span>−{fmt(stats.storeCreditRedeemed!)}</span></div>
                      <div className="flex justify-between font-bold"><span>{tMoney("amountCollected")}</span><span>{fmt(stats.collected ?? Math.max(0, stats.total - (stats.storeCreditRedeemed ?? 0)))}</span></div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={`px-5 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-100"} flex items-center justify-end gap-2`}>
          <button type="button" onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}>
            {tk("eodClose")}
          </button>
          <button type="button" onClick={handlePrint} disabled={!stats || printing}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2">
            <Printer className="w-4 h-4" />
            {printing ? tk("eodPrinting") : tk("eodPrintButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
