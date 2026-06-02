/**
 * Kitchen tablet end-of-day report modal.
 *
 * Pulls today's live stats from /api/kitchen/end-of-day (same
 * aggregation as the email digest cron + the /admin/reports/end-of-day
 * page) and lets the owner:
 *   1. Glance at the numbers on screen.
 *   2. Send the same numbers to the connected thermal printer in
 *      receipt-shaped layout.
 *
 * Print path mirrors how `printReservation` works — server returns
 * structured `lines`, the kitchen client hands them to the Star
 * native bridge. PrintNode fallback uses the `lines` payload too
 * since we don't (yet) emit ESC/POS bytes for the EoD layout.
 *
 * Luigi 2026-06-02 (Fabrizio tracker #40 follow-up).
 */
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X, Printer, RefreshCw } from "lucide-react";
import type { ThemeMode } from "./kitchen-types";

type Stats = {
  restaurantName: string;
  periodLabel: string;
  comparisonLabel: string;
  sales: number;
  salesDelta: number;
  orders: number;
  ordersDelta: number;
  avgOrderValue: number;
  avgOrderValueDelta: number;
  tableReservations: number;
  reservationsDelta: number;
  pickupOrders: number;
  pickupSales: number;
  deliveryOrders: number;
  deliverySales: number;
  dineInOrders: number;
  dineInSales: number;
  offlinePayments: number;
  offlinePaymentsAmount: number;
  onlinePayments: number;
  onlinePaymentsAmount: number;
  subTotals: number;
  taxAmount: number;
  deliveryFees: number;
  tips: number;
  otherFees: number;
  total: number;
};

function fmt(n: number): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function DeltaPill({ pct }: { pct: number }) {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) {
    return <span className="text-[10px] font-medium text-gray-400">—</span>;
  }
  const up = pct > 0;
  return (
    <span
      className={`text-[10px] font-semibold ${
        up ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {up ? "+" : "−"}
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

export function EndOfDayModal({
  open,
  onClose,
  onPrint,
  themeMode,
}: {
  open: boolean;
  onClose: () => void;
  /** Caller is responsible for actually sending the lines to the
   *  printer — we hand it the raw payload from the API. Returning
   *  a resolved promise on success / rejected on failure drives the
   *  toast state in here. */
  onPrint: (payload: { lines: unknown[]; bytes?: string | null; width: number }) => Promise<void>;
  themeMode: ThemeMode;
}) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [printing, setPrinting] = useState(false);
  const [linesPayload, setLinesPayload] = useState<{
    lines: unknown[];
    width: number;
  } | null>(null);

  const isDark = themeMode === "dark";

  const fetchSnapshot = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kitchen/end-of-day", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const body = await res.json();
      setStats(body.stats);
      setLinesPayload({ lines: body.lines, width: body.width });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load today's totals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchSnapshot();
  }, [open]);

  if (!open) return null;

  const handlePrint = async () => {
    if (!linesPayload) {
      toast.error("Nothing to print — try refresh");
      return;
    }
    setPrinting(true);
    try {
      await onPrint({
        lines: linesPayload.lines,
        bytes: null, // no ESC/POS path for the EoD layout yet
        width: linesPayload.width,
      });
      toast.success("End-of-day report printed ✓");
    } catch (e: any) {
      toast.error(e?.message ?? "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl ${
          isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <div>
            <h2 className="text-lg font-bold">End of day report</h2>
            {stats && (
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {stats.periodLabel} · {stats.comparisonLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSnapshot}
              disabled={loading}
              className={`p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} disabled:opacity-50`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && !stats && (
            <div className={`text-center text-sm py-10 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Loading today&apos;s numbers…
            </div>
          )}
          {stats && (
            <>
              {/* Headline numbers — large, prominent */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Sales</div>
                  <div className="text-xl font-bold mt-1">{fmt(stats.sales)}</div>
                  <DeltaPill pct={stats.salesDelta} />
                </div>
                <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Orders</div>
                  <div className="text-xl font-bold mt-1">{stats.orders}</div>
                  <DeltaPill pct={stats.ordersDelta} />
                </div>
                <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Avg ticket</div>
                  <div className="text-xl font-bold mt-1">{fmt(stats.avgOrderValue)}</div>
                  <DeltaPill pct={stats.avgOrderValueDelta} />
                </div>
                <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                  <div className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Reservations</div>
                  <div className="text-xl font-bold mt-1">{stats.tableReservations}</div>
                  <DeltaPill pct={stats.reservationsDelta} />
                </div>
              </div>

              {/* By channel */}
              <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>By channel</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Pickup</span>
                    <span className="font-semibold">{stats.pickupOrders} · {fmt(stats.pickupSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span className="font-semibold">{stats.deliveryOrders} · {fmt(stats.deliverySales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dine-in</span>
                    <span className="font-semibold">{stats.dineInOrders} · {fmt(stats.dineInSales)}</span>
                  </div>
                </div>
              </div>

              {/* Payment split + money breakdown */}
              <div className={`rounded-xl p-3 ${isDark ? "bg-gray-700/40" : "bg-gray-50"}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Money in</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Online (card)</span><span>{stats.onlinePayments} · {fmt(stats.onlinePaymentsAmount)}</span></div>
                  <div className="flex justify-between"><span>Offline</span><span>{stats.offlinePayments} · {fmt(stats.offlinePaymentsAmount)}</span></div>
                  <div className="h-px bg-gray-400/30 my-2" />
                  <div className="flex justify-between"><span>Subtotal</span><span>{fmt(stats.subTotals)}</span></div>
                  <div className="flex justify-between"><span>Tax</span><span>{fmt(stats.taxAmount)}</span></div>
                  <div className="flex justify-between"><span>Delivery fees</span><span>{fmt(stats.deliveryFees)}</span></div>
                  <div className="flex justify-between"><span>Tips</span><span>{fmt(stats.tips)}</span></div>
                  <div className="h-px bg-gray-400/30 my-2" />
                  <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(stats.total)}</span></div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={`px-5 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-100"} flex items-center justify-end gap-2`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${isDark ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!stats || printing}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            {printing ? "Printing…" : "Print to printer"}
          </button>
        </div>
      </div>
    </div>
  );
}
