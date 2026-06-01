"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  Bell, Printer, RefreshCw, LogOut, ChefHat, Sun, Moon,
  Package, Clock, Truck, ShoppingBag, CheckCircle, Trash2,
  FlaskConical, Loader2, Volume2, VolumeX, AlertTriangle, XCircle,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import { signOut } from "next-auth/react";
import { PrinterSetupModal } from "./PrinterSetupModal";
import { DispatchModeToggle } from "./DispatchModeToggle";
import { OrderDetail } from "./OrderDetail";
import { RejectOrderModal } from "./RejectOrderModal";
import { KitchenFirstRunTour } from "./KitchenFirstRunTour";
import {
  isNativePrinterAvailable,
  nativePrint,
  nativePrinterErrorCopy,
} from "@/lib/native-printer";
import { NativePrinterSetup, getDirectPrinterConfig } from "./NativePrinterSetup";
import { THEMES, type Order, type PrinterSettings, type ThemeMode, type T } from "./kitchen-types";
import { useTranslations } from "next-intl";

// ── Countdown hook ────────────────────────────────────────────────────────────
// Returns 0 until the client mounts so SSR and the first client render match
// (Date.now() differs between them, which triggers a hydration warning).
// Consumers should treat `now === 0` as "not yet mounted" and render a stable
// placeholder.
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function ReservationStatusBadge({ status, t }: { status: string; t: T }) {
  const tk = useTranslations("kitchen");
  const map: Record<string, { bg: string; key: string }> = {
    pending:   { bg: "bg-yellow-100 text-yellow-800",    key: "pending" },
    confirmed: { bg: "bg-blue-100 text-blue-800",        key: "confirmed" },
    seated:    { bg: "bg-emerald-100 text-emerald-800",  key: "seated" },
    no_show:   { bg: "bg-red-100 text-red-700",          key: "noShow" },
    completed: { bg: t.badgeCompleted ?? "bg-gray-100 text-gray-700", key: "done" },
    cancelled: { bg: "bg-gray-100 text-gray-500",        key: "cancelled" },
  };
  const m = map[status] ?? { bg: "bg-gray-100 text-gray-700", key: "" };
  const label = m.key ? tk(m.key).toUpperCase() : status.toUpperCase();
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${m.bg}`}>{label}</span>;
}

function ReservationCard({
  r, t, onStatusChange, onPrint, compact,
}: {
  r: KitchenReservation;
  t: T;
  onStatusChange: (id: string, status: string) => void;
  onPrint: (id: string) => void;
  compact?: boolean;
}) {
  const tk = useTranslations("kitchen");
  return (
    <div className={`${t.row} rounded-xl p-${compact ? "3" : "4"} border ${t.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold ${t.text} ${compact ? "text-sm" : ""}`}>{r.customerName}</span>
            <ReservationStatusBadge status={r.status} t={t} />
            {r.depositPaid && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {tk("depositPaid").toUpperCase()}
              </span>
            )}
          </div>
          <div className={`text-xs ${t.muted} mt-1 flex gap-3 flex-wrap`}>
            <span>{r.date} · {r.time}</span>
            <span>{tk("partyOf", { n: r.partySize })}</span>
            {r.table && <span>{r.table.name}</span>}
            {!compact && r.customerPhone && <span>📞 {r.customerPhone}</span>}
          </div>
          {!compact && r.notes && (
            <div className={`text-xs ${t.muted} mt-1 italic`}>&quot;{r.notes}&quot;</div>
          )}
          <div className="text-[10px] font-mono text-gray-400 mt-1">#{r.confirmationCode}</div>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={() => onPrint(r.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${t.border} ${t.muted} hover:${t.text} transition flex items-center gap-1`}>
            <Printer className="w-3 h-3" /> {tk("print")}
          </button>
          {r.status === "pending" && (
            <button onClick={() => onStatusChange(r.id, "confirmed")}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600">
              {tk("confirmed")}
            </button>
          )}
          {(r.status === "pending" || r.status === "confirmed") && (
            <>
              <button onClick={() => onStatusChange(r.id, "seated")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600">
                {tk("seated")}
              </button>
              <button onClick={() => onStatusChange(r.id, "no_show")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600">
                {tk("noShow")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: T }) {
  const tk = useTranslations("kitchen");
  const cls: Record<string, string> = {
    pending: t.badgePending, accepted: t.badgeAccepted, preparing: t.badgePreparing,
    ready: t.badgeReady, completed: t.badgeCompleted, rejected: t.badgeRejected,
    cancelled: t.badgeCancelled,
  };
  const keyMap: Record<string, string> = {
    pending: "pending", accepted: "accepted", preparing: "preparing",
    ready: "ready", completed: "done", rejected: "rejected", cancelled: "cancelled",
  };
  const k = keyMap[status];
  const label = k ? tk(k).toUpperCase() : status.toUpperCase();
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls[status] ?? t.badgeCompleted}`}>
      {label}
    </span>
  );
}

// ── Countdown display ─────────────────────────────────────────────────────────
/**
 * Counts down from 3:00 from the moment the order was RELEASED to the
 * kitchen (notifiedAt). For cash orders that's the moment of POST; for
 * online_card orders that's when Stripe confirms payment via webhook.
 *
 * Bug fix 2026-05-29: previously used createdAt which made the timer
 * tick down while the customer was still in Stripe Checkout — kitchens
 * saw orders arrive already 1:30 into the 3:00 window.
 *
 * Falls back to createdAt for old orders that pre-date the notifiedAt
 * column being populated, so historic rows still show a sensible value.
 */
function Countdown({
  notifiedAt, createdAt, alertAt, placedWhileClosed, now,
}: {
  notifiedAt: string | null;
  createdAt: string;
  alertAt?: string | null;
  placedWhileClosed?: boolean;
  now: number;
}) {
  // Stable placeholder until the client mounts (now === 0) to avoid hydration mismatch.
  if (!now) return <span className="text-xs font-mono text-gray-400">--:--</span>;
  // If alertAt is set AND still in the future, the order is parked —
  // the countdown hasn't started yet. Show "waiting for open" badge.
  if (alertAt) {
    const alertMs = new Date(alertAt).getTime();
    if (alertMs > now) {
      const diff = alertMs - now;
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const when = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300"
          title={`Alert fires in ${when} (at ${new Date(alertAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })})`}
        >
          OPENS IN {when.toUpperCase()}
        </span>
      );
    }
  }
  // Countdown reference: prefer alertAt (when fired) so closed-placed
  // orders count from open time, not the middle-of-the-night createdAt.
  const reference = alertAt ?? notifiedAt ?? createdAt;
  // Closed-placed orders get a 15-minute initial buffer (staff may be
  // a few min late arriving after open). Normal orders keep 3 min.
  const totalMs = placedWhileClosed ? 15 * 60 * 1000 : 3 * 60 * 1000;
  const ms = totalMs - (now - new Date(reference).getTime());
  if (ms <= 0) return <span className="text-xs font-bold text-red-500 animate-pulse">URGENT</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const color = ms < 60000 ? "text-red-500 font-bold" : "text-emerald-500 font-semibold";
  return <span className={`text-xs ${color} font-mono`}>{m}:{s.toString().padStart(2, "0")}</span>;
}

// ── Order row ─────────────────────────────────────────────────────────────────
function OrderRow({ order, selected, onClick, t, now }: {
  order: Order; selected: boolean; onClick: () => void; t: T; now: number;
}) {
  const tk = useTranslations("kitchen");
  // `now === 0` means the client hasn't mounted yet (see useNow). Render
  // stable, time-independent values during SSR/first paint to match hydration.
  // ALL pending (unaccepted) orders flash — not just <30s old. A pending
  // order is by definition "needs the kitchen's attention right now," so
  // the row keeps pulsing on the left edge until staff accepts/rejects it.
  // We pile the flash class onto whatever theme row style is active so
  // selected-but-still-pending rows also flash.
  //
  // TWO intensities (Luigi feedback 2026-05-29):
  //   - YELLOW pulse during the first 2:30 of the 3-min accept window —
  //     attention-grabbing but not panic-inducing.
  //   - RED pulse once the order has <30 seconds left before the deadline.
  //     Matches the URGENT countdown badge so kitchen sees a unified
  //     escalation cue.
  const isPending = order.status === "pending";
  // If the order was placed while closed and the alert hasn't fired
  // yet, treat it as "parked" — visible but NOT flashing/urgent. The
  // kitchen sees it for prep planning but it doesn't compete for
  // attention with live pending orders.
  const alertParked = !!order.alertAt && new Date(order.alertAt).getTime() > (now || 0);
  const countdownReference = order.alertAt ?? order.notifiedAt ?? order.createdAt;
  const totalCountdownMs = order.placedWhileClosed ? 15 * 60 * 1000 : 3 * 60 * 1000;
  const msLeft = now && !alertParked
    ? totalCountdownMs - (now - new Date(countdownReference).getTime())
    : Number.POSITIVE_INFINITY;
  const isUrgent = isPending && !alertParked && msLeft <= 30 * 1000;
  const baseRowClass = selected ? t.rowSelected : isPending && !alertParked ? `${t.rowNew} cursor-pointer` : t.row;
  const flashClass = isUrgent ? "kitchen-flash-urgent" : "kitchen-flash-new";
  const rowClass = isPending && !alertParked ? `${baseRowClass} ${flashClass}` : baseRowClass;
  const timeAgo = (() => {
    if (!now) return "";
    const diff = now - new Date(order.createdAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return tk("addedAt");
    if (m < 60) return `${m} ${tk("minAway", { minutes: m })}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  })();

  const isTest = order.customerName.startsWith("[TEST]");

  return (
    <div onClick={onClick} className={`px-4 py-3.5 transition-colors ${rowClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          isTest ? "bg-amber-500/20" :
          order.type === "delivery" ? "bg-blue-500/20" : "bg-emerald-500/20"
        }`}>
          {isTest
            ? <FlaskConical className="w-4 h-4 text-amber-500" />
            : order.type === "delivery"
              ? <Truck className="w-4 h-4 text-blue-500" />
              : <ShoppingBag className="w-4 h-4 text-emerald-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${t.text}`}>#{order.orderNumber}</span>
            <StatusBadge status={order.status} t={t} />
            {order.status === "pending" && (
              <Countdown
                notifiedAt={order.notifiedAt}
                createdAt={order.createdAt}
                alertAt={order.alertAt}
                placedWhileClosed={order.placedWhileClosed}
                now={now}
              />
            )}
            {order.viaMarketplace && (
              // Marketplace channel attribution — purple to differentiate
              // from direct widget/walk-up orders. Staff sees at a glance
              // which orders came from /marketplace discovery.
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
                MARKETPLACE
              </span>
            )}
            {isTest && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500">TEST</span>}
          </div>
          <div className={`text-sm ${t.textMuted} truncate`}>
            {order.customerName.replace("[TEST] ", "")}
            {order.deliveryAddress && ` · ${order.deliveryAddress}`}
          </div>
          <div className={`text-xs ${t.subtle} flex items-center gap-2 mt-0.5`}>
            <span>{order.items.length} {tk("items")}</span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-bold text-sm ${t.text}`}>{formatCurrency(order.total)}</div>
          {order.preparationTime && (
            <div className={`text-xs ${t.muted} flex items-center gap-0.5 justify-end`}>
              <Clock className="w-3 h-3" />{order.preparationTime}m
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, t }: {
  title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; t: T;
}) {
  const tc = useTranslations("common");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className={`${t.modal} rounded-2xl w-full max-w-sm p-6 shadow-2xl`}>
        <h3 className={`text-lg font-bold ${t.text} mb-2`}>{title}</h3>
        <p className={`text-sm ${t.muted} mb-6`}>{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className={`flex-1 ${t.btn} py-2.5 rounded-xl font-semibold text-sm transition`}
          >
            {tc("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main KitchenDisplay ───────────────────────────────────────────────────────
type KTab = "orders" | "inprogress" | "complete" | "reservations";

// Per-tab visual identity. Each kitchen tab gets its own accent color +
// icon so staff can scan + identify at a glance — even the inactive
// tabs stay color-coded by their icon. Luigi flagged "All orders /
// In progress / Completed all looking the same is confusing" — this
// fixes that by treating each tab as its own semantic surface:
//   orders       = emerald (the "incoming + history" tab)
//   inprogress   = amber   (the "doing it now" tab — eye-catching)
//   complete     = slate   (the "done" tab — neutral, dark navy)
//   reservations = sky     (the "future / off-floor" tab — cool blue)
type TabStyle = {
  /** Icon rendered to the LEFT of the tab label. */
  Icon: typeof ShoppingBag;
  /** Bottom-border accent when the tab is selected. */
  activeBorder: string;
  /** Tab label text color when selected. */
  activeText:   string;
  /** Subtle background fill behind the active tab so it visually pops. */
  activeBg:     string;
  /** Icon color when the tab is NOT selected — keeps the per-tab color
   *  visible even when the user isn't on that tab, which is the main
   *  scannability win. */
  inactiveIcon: string;
  /** Pill/dot background when count > 0. */
  badge:        string;
};
const TAB_STYLES_LIGHT: Record<KTab, TabStyle> = {
  orders:       { Icon: ShoppingBag,  activeBorder: "border-emerald-500", activeText: "text-emerald-700", activeBg: "bg-emerald-50",  inactiveIcon: "text-emerald-500", badge: "bg-emerald-500 text-white" },
  inprogress:   { Icon: Clock,        activeBorder: "border-amber-500",   activeText: "text-amber-700",   activeBg: "bg-amber-50",    inactiveIcon: "text-amber-500",   badge: "bg-amber-500 text-white"   },
  complete:     { Icon: CheckCircle,  activeBorder: "border-slate-900",   activeText: "text-slate-900",   activeBg: "bg-slate-100",   inactiveIcon: "text-slate-600",   badge: "bg-slate-900 text-white"   },
  reservations: { Icon: CalendarDays, activeBorder: "border-sky-500",     activeText: "text-sky-700",     activeBg: "bg-sky-50",      inactiveIcon: "text-sky-500",     badge: "bg-sky-500 text-white"     },
};
const TAB_STYLES_DARK: Record<KTab, TabStyle> = {
  orders:       { Icon: ShoppingBag,  activeBorder: "border-emerald-400", activeText: "text-emerald-300", activeBg: "bg-emerald-500/10", inactiveIcon: "text-emerald-400", badge: "bg-emerald-500 text-white" },
  inprogress:   { Icon: Clock,        activeBorder: "border-amber-400",   activeText: "text-amber-300",   activeBg: "bg-amber-500/10",   inactiveIcon: "text-amber-400",   badge: "bg-amber-500 text-white"   },
  complete:     { Icon: CheckCircle,  activeBorder: "border-slate-200",   activeText: "text-white",       activeBg: "bg-slate-700/40",   inactiveIcon: "text-slate-300",   badge: "bg-slate-200 text-slate-900" },
  reservations: { Icon: CalendarDays, activeBorder: "border-sky-400",     activeText: "text-sky-300",     activeBg: "bg-sky-500/10",     inactiveIcon: "text-sky-400",     badge: "bg-sky-500 text-white"     },
};

type KitchenReservation = {
  id: string;
  confirmationCode: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  date: string;
  time: string;
  notes: string | null;
  preOrderTotal: number;
  depositPaid: boolean;
  depositAmount: number;
  table: { name: string; number: number | null } | null;
};

function loadSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); }
  catch { return new Set(); }
}
function saveSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
}

const IN_PROGRESS_STATUSES = ["accepted", "preparing", "ready"];
const COMPLETE_STATUSES = ["completed", "rejected", "cancelled"];

export function KitchenDisplay({ restaurant, initialOrders }: { restaurant: any; initialOrders: Order[] }) {
  const tk = useTranslations("kitchen");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("kds-theme") as ThemeMode) ?? "light";
  });
  const t = THEMES[themeMode];

  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<KTab>("orders");
  const [reservations, setReservations] = useState<KitchenReservation[]>([]);
  // Kitchen workflow mode — drives whether the order detail panel shows
  // the full state-machine buttons (Preparing/Ready/Out for delivery/
  // Complete) or just Accept + Reject. Hydrated from /api/kitchen/orders
  // response so admin can toggle it without restarting the kitchen.
  // Default "simple" matches the server default + the GloriaFood pattern
  // Luigi specified as the main flow.
  const [workflowMode, setWorkflowMode] = useState<"simple" | "tracking">(
    (restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple"),
  );
  // PrintNode opt-in flag. When false (default), the PrintNode setup
  // UI is hidden from the kitchen header — Direct LAN printer is the
  // main path. Admin enables PrintNode from /admin/orders as an
  // explicit backup option.
  const [printNodeEnabled, setPrintNodeEnabled] = useState<boolean>(
    !!restaurant?.printNodeEnabled,
  );

  // Track which reservation IDs the kitchen has already seen — same
  // pattern as seenIdsRef for orders. Lets the fetch loop tell
  // "brand-new arrival" (worth ringing/toasting) from "still in the
  // upcoming list since last poll" (already acknowledged). Seeded
  // empty so the very first poll doesn't ring for every existing
  // booking — we seed inside the first fetchRes() below.
  const seenReservationIdsRef = useRef<Set<string> | null>(null);

  // Poll upcoming reservations whenever the Reservations OR Orders tab is open
  // (Orders tab shows reservations alongside the order list). Also drives
  // the kitchen ring/toast for NEW reservation arrivals — manual-accept
  // (status "pending") re-arms the alarm loop the same way a new order
  // does; auto-accept (status "confirmed") shows a single toast so staff
  // know a booking just landed without the alarm cadence.
  useEffect(() => {
    if (activeTab !== "reservations" && activeTab !== "orders") return;
    let cancelled = false;
    const fetchRes = async () => {
      try {
        const res = await fetch("/api/admin/reservations/upcoming");
        if (!res.ok) return;
        const data: KitchenReservation[] = await res.json();
        if (cancelled) return;
        // Seed the seen-set on the FIRST poll so existing bookings
        // don't trigger an alarm on tab-open. Subsequent polls compare
        // against this baseline to find new arrivals.
        if (seenReservationIdsRef.current === null) {
          seenReservationIdsRef.current = new Set(data.map((r) => r.id));
        } else {
          const seen = seenReservationIdsRef.current;
          const fresh = data.filter((r) => !seen.has(r.id));
          if (fresh.length > 0) {
            const newPending = fresh.filter((r) => r.status === "pending");
            const newConfirmed = fresh.filter((r) => r.status === "confirmed");
            if (newPending.length > 0) {
              // Manual-accept arrival → re-arm the kitchen alarm.
              // Mirrors the order-side "newPending" branch in
              // fetchOrders. Same alarm loop will keep ringing until
              // staff acknowledge (silence button) or accept/reject
              // each booking via the reservation list.
              setAcknowledged(false);
              toast(
                `🔔 ${newPending.length} new reservation${newPending.length > 1 ? "s" : ""} — tap to accept`,
                { icon: "📅", duration: 8000 },
              );
            }
            if (newConfirmed.length > 0) {
              // Auto-accept arrival → single chime + toast. Uses
              // the SAME owner-chosen ring sound + volume the
              // alarm loop uses, fired exactly once. No re-arm —
              // staff get the heads-up without the prep-rush
              // cadence. Mirrors the order-side auto-accept
              // chime so both surfaces sound identical for the
              // "new thing arrived, already accepted" event.
              try { ringBellOnceRef.current?.(); } catch { /* noop */ }
              toast(
                `📅 ${newConfirmed.length} new reservation${newConfirmed.length > 1 ? "s" : ""} confirmed`,
                { icon: "✅", duration: 5000 },
              );
              // Auto-print each confirmed reservation through the
              // PrintNode pipe (the only reservation print path
              // wired today — direct-LAN reservation printing is
              // tracked separately). Skips silently when no
              // PrintNode printer is configured — same posture as
              // the order auto-print path. Luigi 2026-06-01.
              if (
                printerSettingsRef.current?.printNodeConnected &&
                printerSettingsRef.current.selectedPrinterId
              ) {
                for (const r of newConfirmed) {
                  fetch("/api/kitchen/printnode/print", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reservationId: r.id }),
                  }).catch((err) =>
                    console.warn("[kds reservation auto-print] failed:", err),
                  );
                }
              }
            }
            fresh.forEach((r) => seen.add(r.id));
          }
        }
        setReservations(data);
      } catch {}
    };
    fetchRes();
    // Match the order-poll cadence (4s) so a new reservation surfaces
    // within seconds, not the 30s the original setInterval allowed.
    // Luigi 2026-06-01: "takes 30–60 sec after order placed before it
    // shows up". Reservations are low-volume — the 4s interval costs
    // negligible compared to orders, and the kitchen needs to hear
    // the ring as soon as a booking lands so they can plan capacity.
    //
    // Plus visibility / focus / online wake hooks — same pattern as
    // fetchOrders. Without them, a backgrounded kitchen tab gets
    // throttled by Chromium to ~1 poll/min for hidden tabs, so the
    // first poll on tab re-focus could otherwise be 30+ sec late.
    const id = setInterval(fetchRes, 4000);
    const wake = () => {
      if (document.visibilityState === "visible") fetchRes();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [activeTab]);

  const printReservation = async (id: string) => {
    if (!printerSettings?.printNodeConnected || !printerSettings.selectedPrinterId) {
      toast.error("No printer configured. Open Printer Setup to connect.");
      setShowPrinterSetup(true);
      return;
    }
    try {
      const res = await fetch("/api/kitchen/printnode/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Print failed");
      toast.success("Reservation sent to printer");
    } catch (e: any) {
      toast.error(e.message || "Print failed");
    }
  };

  const updateReservationStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Two separate printer setup modals — DirectPrinter (LAN, primary)
  // and PrintNode (legacy / Windows-bridge / backup). One settings
  // button in the header opens the right one based on platform; the
  // user can switch between them from within either modal.
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [showDirectPrinterSetup, setShowDirectPrinterSetup] = useState(false);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings | null>(null);
  // Acknowledged = user pressed "Silence" while the bell was ringing. Bell
  // stays quiet until a *new* pending order arrives (detected in
  // fetchOrders below), which resets this to false and re-arms the alarm.
  // We never persist this — every reload starts un-acknowledged so a new
  // shift can't inherit a silenced alarm.
  const [acknowledged, setAcknowledged] = useState(false);
  const [prepModal, setPrepModal] = useState<string | null>(null);
  const [prepTime, setPrepTime] = useState("20");
  const [testOrdering, setTestOrdering] = useState(false);
  // Order ID being rejected from the Accept Order prep prompt. When non-null,
  // the shared RejectOrderModal opens for that order. Setting this and
  // setPrepModal(null) at the same time hands the user from the Accept
  // prompt straight into the reject-reasons flow.
  const [rejectFromPrep, setRejectFromPrep] = useState<string | null>(null);

  // ── Alert-sound state ──────────────────────────────────────────────────────
  // Continuous bell tone that rings while ANY order is pending. Models
  // GloriaFood's school-bell-style notification — purposely impossible to
  // miss. Default volume is MAX (1.0); restaurants can lower it but a
  // warning banner appears anytime volume < 0.5 with a pending order.
  const [alertVolume, setAlertVolume] = useState(1.0);
  const [alertMuted, setAlertMuted] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  // Which sound to play on new-order alerts.
  //   "gloriafood" = the sampled MP3 ding (default; bundled with the app)
  //   "synth"      = the classic 4-partial bell synthesized by Web Audio
  //                  (the original sound from before the sample existed)
  //   "custom"     = a sound the restaurant owner uploaded via
  //                  /admin/profile → Kitchen Alert Sound. Only selectable
  //                  when restaurant.kitchenAlertSoundUrl is non-null;
  //                  otherwise we silently fall back to "gloriafood".
  // Picker UI lives in the sound-settings modal. Persisted to localStorage.
  type AlertSoundChoice = "gloriafood" | "synth" | "custom";
  const customSoundUrl: string | null = restaurant?.kitchenAlertSoundUrl ?? null;
  const [alertSound, setAlertSound] = useState<AlertSoundChoice>("gloriafood");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);

  // Decoded GloriaFood sample as a Web Audio buffer. We use the
  // AudioContext + decodeAudioData path instead of an HTMLAudioElement
  // for three reasons:
  //
  //   1. We can TRIM the noisy intro of the MP3 in-browser (Luigi flagged
  //      audible background hiss in the first ~150ms before the actual ding).
  //   2. We can pipe through a high-pass filter to cut low-frequency
  //      room hum, yielding a cleaner ring than the raw file.
  //   3. AudioBufferSourceNode plays GARBAGE-collected per-call sources —
  //      no event listeners that could survive across renders, no
  //      currentTime races, no risk of two playbacks overlapping
  //      themselves. Cleaner under React strict-mode / fast refresh.
  //
  // The ref holds the post-processed buffer; null until it's decoded.
  const sampleBufferRef = useRef<AudioBuffer | null>(null);
  const sampleErroredRef = useRef(false);
  // Parallel slot for the owner-uploaded custom ring sound. Decoded
  // the same way the bundled GloriaFood sample is — same trim, same
  // fade math — so playback feel is consistent across sources. Null
  // when restaurant.kitchenAlertSoundUrl is empty (or the decode
  // fails). The picker only surfaces "Custom Sound" as selectable
  // when this buffer is non-null and didn't error out.
  const customSampleBufferRef = useRef<AudioBuffer | null>(null);
  const customSampleErroredRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) {
          sampleErroredRef.current = true;
          return;
        }
        const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        // Cache-buster: browsers (and Vercel's CDN) aggressively cache
        // /sounds/*.mp3, so when we swap the file in public/sounds/
        // every existing kitchen tablet keeps playing the OLD version
        // for hours until its cache TTL expires. Bumping this query
        // string forces a fresh fetch the next time the KDS loads.
        // Bump whenever the bundled MP3 is replaced:
        //   v=2 (2026-05-31) — Luigi's IMG_6508 11–15s extract
        const res = await fetch("/sounds/gloriafood-new-order.mp3?v=2");
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const arr = await res.arrayBuffer();
        // decodeAudioData is the old callback API in Safari — wrap.
        const raw: AudioBuffer = await new Promise((resolve, reject) => {
          try {
            const p = ctx.decodeAudioData(arr.slice(0), resolve, reject);
            // Modern impl returns a promise; await it too.
            if (p && typeof (p as any).then === "function") {
              (p as Promise<AudioBuffer>).then(resolve, reject);
            }
          } catch (e) { reject(e); }
        });
        if (cancelled) return;

        // ── Process the buffer ─────────────────────────────────────────
        // Three cleanup passes:
        //   1. Trim the leading 200ms — Luigi flagged audible room
        //      tone / echo-tail in the lead-in. 200ms aligns past the
        //      end of the source's reverb buildup and into the clean
        //      sustain of the actual bell strike.
        //   2. Trim the trailing silence — scan backwards from the end
        //      to find the last sample where amplitude exceeds a
        //      noise-floor threshold. Anything past that is just dead
        //      air or recorder hiss; ditch it and let our explicit
        //      fade-out handle the end shape.
        //   3. Apply linear fade-in (8ms) + fade-out (25ms). The fade-
        //      out is the perceptual fix for Luigi's "cuts off too
        //      early" complaint — without it the abrupt buffer end
        //      sounds clipped; with it the ending tapers smoothly so
        //      the perceived stop matches the natural bell decay.
        // 2026-05-28: bumped trim + noise floor more aggressively after
        // Luigi reported persistent background noise. TRIM_START_MS=250
        // cuts past most of the source's lead-in artifact. NOISE_FLOOR
        // raised to 0.025 — surfaces of the bell wave that fall below
        // that are treated as silence-with-noise rather than signal,
        // which trims more aggressively from the tail. Side effect: a
        // very-quiet bell ring would be over-trimmed, but the source
        // clip is loud enough that this is fine.
        const TRIM_START_MS = 250;
        const NOISE_FLOOR = 0.025;
        const FADE_IN_MS = 8;
        const FADE_OUT_MS = 25;

        const startSamples = Math.min(
          Math.floor((TRIM_START_MS / 1000) * raw.sampleRate),
          Math.max(0, raw.length - 1),
        );

        // Find the END of the audible content. Search backwards from
        // the end and find the last sample where ANY channel exceeds
        // the noise floor. Keep a 30ms tail past that for the natural
        // decay, then we'll fade it out.
        let lastAudibleSample = raw.length - 1;
        for (let i = raw.length - 1; i >= startSamples; i--) {
          let peak = 0;
          for (let ch = 0; ch < raw.numberOfChannels; ch++) {
            const v = Math.abs(raw.getChannelData(ch)[i]);
            if (v > peak) peak = v;
          }
          if (peak > NOISE_FLOOR) {
            lastAudibleSample = i;
            break;
          }
        }
        const tailSamples = Math.floor(0.030 * raw.sampleRate);
        const endSamples = Math.min(raw.length, lastAudibleSample + tailSamples);

        const newLength = endSamples - startSamples;
        const out = ctx.createBuffer(raw.numberOfChannels, newLength, raw.sampleRate);
        const fadeInSamples = Math.floor((FADE_IN_MS / 1000) * raw.sampleRate);
        const fadeOutSamples = Math.floor((FADE_OUT_MS / 1000) * raw.sampleRate);
        for (let ch = 0; ch < raw.numberOfChannels; ch++) {
          const src = raw.getChannelData(ch);
          const dst = out.getChannelData(ch);
          for (let i = 0; i < newLength; i++) dst[i] = src[i + startSamples];
          // Fade in
          for (let i = 0; i < Math.min(fadeInSamples, newLength); i++) {
            dst[i] *= i / fadeInSamples;
          }
          // Fade out — apply at the very end so we never hear the
          // raw buffer boundary as a click.
          const fadeOutStart = Math.max(0, newLength - fadeOutSamples);
          for (let i = fadeOutStart; i < newLength; i++) {
            const t = (newLength - i) / fadeOutSamples; // 1 → 0
            dst[i] *= t;
          }
        }
        sampleBufferRef.current = out;
        console.info(
          `[KDS] GloriaFood sample decoded + cleaned: trimmed ${TRIM_START_MS}ms from start, ` +
          `${((raw.length - endSamples) / raw.sampleRate * 1000).toFixed(0)}ms of trailing ` +
          `silence/noise from end, fade-in ${FADE_IN_MS}ms + fade-out ${FADE_OUT_MS}ms. ` +
          `Playback length ${out.duration.toFixed(2)}s.`
        );
      } catch (e) {
        if (cancelled) return;
        sampleErroredRef.current = true;
        console.warn(
          "[KDS] /sounds/gloriafood-new-order.mp3 failed to load/decode — " +
          "if 'gloriafood' is the chosen alert sound, alerts will be silent " +
          "(synth fallback only fires when user explicitly picks 'Classic Bell'). " +
          "Error:", e
        );
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Custom sound loader. Mirrors the GloriaFood-sample pipeline above
  // — same trim, fade math, error path — but pulls from the owner's
  // uploaded URL. Re-runs whenever the URL changes (owner uploads a
  // new file → admin save → next KDS render picks it up). If decode
  // fails (corrupt file, unsupported codec) we don't surface the
  // option in the picker, falling back to GloriaFood Ding silently.
  useEffect(() => {
    if (!customSoundUrl) {
      customSampleBufferRef.current = null;
      customSampleErroredRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) {
          customSampleErroredRef.current = true;
          return;
        }
        const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        const res = await fetch(customSoundUrl);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const arr = await res.arrayBuffer();
        const raw: AudioBuffer = await new Promise((resolve, reject) => {
          try {
            const p = ctx.decodeAudioData(arr.slice(0), resolve, reject);
            if (p && typeof (p as any).then === "function") {
              (p as Promise<AudioBuffer>).then(resolve, reject);
            }
          } catch (e) { reject(e); }
        });
        if (cancelled) return;

        // Same cleanup pass as the bundled sample — owner-uploaded
        // files are even more likely to need it (variable source
        // quality), and consistent trim/fade keeps the perceived
        // "feel" matched across sound choices.
        const FADE_IN_MS = 8;
        const FADE_OUT_MS = 25;
        const fadeInSamples = Math.floor((FADE_IN_MS / 1000) * raw.sampleRate);
        const fadeOutSamples = Math.floor((FADE_OUT_MS / 1000) * raw.sampleRate);
        const out = ctx.createBuffer(raw.numberOfChannels, raw.length, raw.sampleRate);
        for (let ch = 0; ch < raw.numberOfChannels; ch++) {
          const src = raw.getChannelData(ch);
          const dst = out.getChannelData(ch);
          for (let i = 0; i < raw.length; i++) dst[i] = src[i];
          for (let i = 0; i < Math.min(fadeInSamples, raw.length); i++) {
            dst[i] *= i / fadeInSamples;
          }
          const fadeOutStart = Math.max(0, raw.length - fadeOutSamples);
          for (let i = fadeOutStart; i < raw.length; i++) {
            const t = (raw.length - i) / fadeOutSamples;
            dst[i] *= t;
          }
        }
        customSampleBufferRef.current = out;
        customSampleErroredRef.current = false;
        console.info(
          `[KDS] custom alert sound decoded from owner upload: ` +
          `length ${out.duration.toFixed(2)}s, fade-in ${FADE_IN_MS}ms + fade-out ${FADE_OUT_MS}ms.`
        );
      } catch (e) {
        if (cancelled) return;
        customSampleErroredRef.current = true;
        customSampleBufferRef.current = null;
        console.warn(
          "[KDS] custom alert sound failed to load/decode — falling back to GloriaFood Ding " +
          "for this session. The owner may need to re-upload the file from /admin/profile. " +
          "Error:", e
        );
      }
    })();
    return () => { cancelled = true; };
  }, [customSoundUrl]);

  // Load saved volume / mute / sound choice on mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem("kds-alert-volume");
      if (v !== null) {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) setAlertVolume(Math.max(0, Math.min(1, n)));
      }
      const m = localStorage.getItem("kds-alert-muted");
      if (m === "1") setAlertMuted(true);
      const s = localStorage.getItem("kds-alert-sound");
      if (s === "synth" || s === "gloriafood" || s === "custom") setAlertSound(s);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("kds-alert-volume", String(alertVolume)); } catch {}
  }, [alertVolume]);
  useEffect(() => {
    try { localStorage.setItem("kds-alert-muted", alertMuted ? "1" : "0"); } catch {}
  }, [alertMuted]);
  useEffect(() => {
    try { localStorage.setItem("kds-alert-sound", alertSound); } catch {}
  }, [alertSound]);

  // Browsers require a user gesture before AudioContext can play. We unlock
  // it on the first click/keypress anywhere on the page, then keep the same
  // AudioContext alive for the lifetime of the session.
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        audioUnlockedRef.current = true;
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /**
   * Synthesized fallback — four sine partials at classic struck-bell
   * harmonic ratios (1, 2.756, 5.404, 8.933) with exponential decay.
   * Used only when the GloriaFood sample isn't loaded.
   */
  const synthBellOnce = useCallback((vol: number) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new Ctx();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const t0 = ctx.currentTime;
      const fundamental = 880; // A5 — bright, attention-grabbing
      const partials: Array<{ ratio: number; gain: number }> = [
        { ratio: 1.000, gain: 0.50 },
        { ratio: 2.756, gain: 0.30 },
        { ratio: 5.404, gain: 0.15 },
        { ratio: 8.933, gain: 0.08 },
      ];

      const master = ctx.createGain();
      // 0.6 peak at full volume is loud-but-safe over kitchen tablets / TVs.
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.6 * vol, t0 + 0.005);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
      master.connect(ctx.destination);

      partials.forEach(({ ratio, gain }) => {
        const osc = ctx!.createOscillator();
        osc.type = "sine";
        osc.frequency.value = fundamental * ratio;
        const g = ctx!.createGain();
        g.gain.value = gain;
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + 1.3);
      });
    } catch {}
  }, []);

  /**
   * Play one strike of the decoded GloriaFood sample. Each call creates a
   * fresh AudioBufferSourceNode (single-use, garbage-collected after play
   * completes) so we never have two overlapping playbacks of the same
   * buffer. The signal chain is:
   *
   *   AudioBufferSourceNode → highpass(80Hz) → gain(volume) → destination
   *
   * The high-pass filter strips room-rumble and any low-frequency hum from
   * the source recording, leaving the ding cleaner and more cut-through.
   * Returns true if a sample was scheduled, false if no buffer is loaded.
   */
  // Inner playback core — takes any decoded buffer and applies the
  // same filter chain. Used by both the bundled GloriaFood sample and
  // the owner's custom upload.
  const playBufferOnce = useCallback((buf: AudioBuffer | null, vol: number): boolean => {
    const ctx = audioCtxRef.current;
    if (!ctx || !buf) return false;
    try {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Signal chain (heavier processing as of 2026-05-28 after Luigi
      // reported lingering background noise):
      //   src
      //     → highpass(220Hz)   kills low-frequency hum (HVAC, traffic)
      //     → lowpass(4500Hz)   kills high-frequency hiss / tape noise
      //     → peakingEQ(1kHz+4) lifts bell-strike brightness so it cuts
      //                          through what noise remains
      //     → gain(volume)
      //     → destination
      //
      // The bell's important partials live ~440Hz–3.5kHz. Cutting outside
      // that band sacrifices nothing musical and excises most of the
      // noise spectrum (hum is <100Hz, hiss is >5kHz). If the source
      // MP3 still sounds noisy after this, the noise lives INSIDE the
      // bell's frequency band — at that point only a cleaner source
      // file can help (filters can't surgically remove noise that
      // overlaps the signal's spectrum without distorting the signal).
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 220;
      highpass.Q.value = 0.707;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 4500;
      lowpass.Q.value = 0.707;

      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 1000;
      presence.Q.value = 1.0;
      presence.gain.value = 4;

      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(highpass).connect(lowpass).connect(presence).connect(gain).connect(ctx.destination);
      src.start();
      return true;
    } catch (e) {
      console.warn("[KDS ring] sample playback threw:", e);
      return false;
    }
  }, []);

  const playSampleOnce = useCallback(
    (vol: number) => playBufferOnce(sampleBufferRef.current, vol),
    [playBufferOnce],
  );
  const playCustomOnce = useCallback(
    (vol: number) => playBufferOnce(customSampleBufferRef.current, vol),
    [playBufferOnce],
  );

  /**
   * Ring one strike using the user's chosen alert sound.
   *
   * STRICT: we never fall back from one sound to another. If the user
   * picked GloriaFood but the buffer hasn't loaded (or load failed),
   * the ring is silent + we log to console. This was Luigi's specific
   * ask — previous behaviour would play BOTH the sample and the synth
   * under some race conditions, producing a confusing layered ding.
   * Now exactly one sound (or zero, on failure) plays per strike.
   *
   * Logs the path taken on the first ring of the session for debugging.
   */
  const loggedRingPathRef = useRef(false);
  const ringBellOnce = useCallback((volumeOverride?: number) => {
    const vol = Math.max(0, Math.min(1, volumeOverride ?? alertVolume));
    if (vol <= 0) return;

    if (alertSound === "synth") {
      if (!loggedRingPathRef.current) {
        console.info("[KDS ring] synth (Classic Bell)");
        loggedRingPathRef.current = true;
      }
      synthBellOnce(vol);
      return;
    }

    if (alertSound === "custom") {
      // Owner-uploaded custom track. Stays strict — if the buffer
      // failed to decode (corrupt file, etc.) we DON'T silently fall
      // back to the GloriaFood sample. Better to be silent + log so
      // the staff hears that something's broken and the owner fixes it.
      const ok = playCustomOnce(vol);
      if (ok) {
        if (!loggedRingPathRef.current) {
          console.info("[KDS ring] custom (owner-uploaded)");
          loggedRingPathRef.current = true;
        }
      } else if (!loggedRingPathRef.current) {
        console.warn(
          "[KDS ring] custom sound not playable (" +
          (customSampleErroredRef.current ? "load/decode error" : "buffer not ready yet") +
          "). Silent this ring. Pick GloriaFood Ding or Classic Bell in Sound Settings " +
          "for guaranteed playback until the file is replaced."
        );
        loggedRingPathRef.current = true;
      }
      return;
    }

    // alertSound === "gloriafood"
    const ok = playSampleOnce(vol);
    if (ok) {
      if (!loggedRingPathRef.current) {
        console.info("[KDS ring] sample (GloriaFood Ding — trimmed + filtered)");
        loggedRingPathRef.current = true;
      }
    } else if (!loggedRingPathRef.current) {
      console.warn(
        "[KDS ring] GloriaFood sample not playable (" +
        (sampleErroredRef.current ? "load/decode error" : "buffer not ready yet") +
        "). Silent this ring. Pick 'Classic Bell' in Sound Settings if you want " +
        "guaranteed playback while the sample is unavailable."
      );
      loggedRingPathRef.current = true;
    }
  }, [alertVolume, alertSound, synthBellOnce, playSampleOnce, playCustomOnce]);

  // Mirror the latest ringBellOnce into a ref so non-reactive call
  // sites (the fetchOrders useCallback, which keeps deps=[] to stop
  // the 4s poll interval from tearing down each tick) can still
  // fire the current sound. Re-points whenever alertVolume /
  // alertSound / underlying playback fns change.
  useEffect(() => {
    ringBellOnceRef.current = ringBellOnce;
  }, [ringBellOnce]);

  // Derived. `alerting` is true only while there's at least one pending
  // order AND the user hasn't silenced the current alarm. Computed each
  // render so the bell can never get "stuck" — when pending drops to 0
  // or `acknowledged` flips true, the very next render kills the loop.
  // Pending orders that should ACTIVELY ring. Excludes "parked" orders
  // — closed-placed orders sitting silently in the queue until the
  // restaurant opens. They become alertable the moment the live clock
  // ticks past their `alertAt`. Recomputed every render so the
  // transition happens automatically without a fetch round-trip.
  const nowMs = Date.now();
  const pendingCount = orders.filter(
    (o) => o.status === "pending" && !(o.alertAt && new Date(o.alertAt).getTime() > nowMs),
  ).length;
  // Pending reservations (manual-accept mode arrivals not yet
  // accepted/declined by staff) re-arm the alarm right alongside
  // pending orders. The existing alarm-loop reads pendingCount, so
  // adding reservations here is the single hook that ties the
  // reservation-side ring to the order-side cadence — no duplicate
  // loop required. Luigi 2026-06-01: "the ring should be the same".
  const pendingReservationCount = reservations.filter((r) => r.status === "pending").length;
  const alerting = (pendingCount + pendingReservationCount) > 0 && !acknowledged;

  // Silence the current alarm. Bell stops; the visual "X new" badge
  // stays so the kitchen still sees there's work waiting. Auto-cleared
  // when fetchOrders detects a brand-new pending order arrival.
  const silenceAlert = useCallback(() => {
    setAcknowledged(true);
  }, []);

  // Stash `orders` in a ref so the bell-loop timer below can read the
  // current pending set without forcing the entire loop to tear down +
  // restart every time fetchOrders updates the array. Without this the
  // 4s polling would reset the timer mid-cadence.
  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Dynamic-cadence ring loop while pending orders are unacknowledged.
  //
  // Cadence is driven by the OLDEST pending order's remaining time
  // before the auto-reject cron kills it (10 minutes after creation
  // by default — see src/lib/auto-reject-orders.ts). Spaced out when
  // the order is fresh, escalating to rapid in the final 30 seconds.
  //
  //   >7min remaining   → 3000ms  (calm, just an acknowledgement)
  //   3-7min remaining  → 2500ms
  //   30s-3min          → 1800ms
  //   last 30s          → ramps 800ms → 250ms (urgent, "ACT NOW")
  //   0 or past         → silent  (auto-reject cron handles it)
  //
  // We use a recursive setTimeout (not setInterval) because each tick
  // computes its own interval based on the current oldest-pending age.
  const AUTO_REJECT_MS = 10 * 60 * 1000;
  const cadenceForRemainingMs = (remainingMs: number | null): number | null => {
    if (remainingMs === null) return 3000;
    if (remainingMs <= 0) return null; // stop ringing
    if (remainingMs <= 30_000) {
      // Linear ramp 800ms (at 30s remaining) → 250ms (at 0s remaining).
      const t = remainingMs / 30_000; // 1 → 0
      return Math.round(250 + (800 - 250) * t);
    }
    if (remainingMs <= 3 * 60_000) return 1800;
    if (remainingMs <= 7 * 60_000) return 2500;
    return 3000;
  };
  useEffect(() => {
    if (!alerting || alertMuted || alertVolume <= 0) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled) return;
      ringBellOnce();
      // Find the oldest pending order (lowest createdAt) — that's the
      // one closest to auto-reject and drives the urgency.
      let oldestMs: number | null = null;
      for (const o of ordersRef.current) {
        if (o.status !== "pending") continue;
        const t = new Date(o.createdAt).getTime();
        if (oldestMs === null || t < oldestMs) oldestMs = t;
      }
      const remainingMs = oldestMs === null ? null : AUTO_REJECT_MS - (Date.now() - oldestMs);
      const next = cadenceForRemainingMs(remainingMs);
      if (next === null) return; // past timeout — let the cron auto-reject
      timeoutId = setTimeout(tick, next);
    };
    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [alerting, alertMuted, alertVolume, ringBellOnce]);

  const testAlertSound = useCallback(() => {
    // ONE strike only — restaurants confused "I keep hearing it" with
    // "the test sound is on a loop". One clean strike (~1.3s) decays
    // and stops with no overlap, no ambiguity. The real alarm loop is
    // separate (see the bell-loop effect above).
    ringBellOnce(alertVolume || 1.0);
  }, [ringBellOnce, alertVolume]);

  // Clear history sets (localStorage-persisted).
  // Start empty on both server and client so hydration matches, then load
  // from localStorage in an effect after the first render.
  const [clearedOrders, setClearedOrders] = useState<Set<string>>(() => new Set());
  const [clearedComplete, setClearedComplete] = useState<Set<string>>(() => new Set());
  const [clearConfirm, setClearConfirm] = useState<"orders" | "complete" | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set(initialOrders.map(o => o.id)));
  // Stable ref to ringBellOnce so fetchOrders (deps=[]) can call the
  // current sound config without forcing the 4s poll interval to tear
  // down every time alertVolume / alertSound changes. Single-chime-on-
  // auto-accept reads this ref. Luigi 2026-06-01.
  const ringBellOnceRef = useRef<((volumeOverride?: number) => void) | null>(null);
  // Same ref-shape for autoPrint — fetchOrders detects newly auto-
  // accepted orders and fires this so the receipt prints without
  // staff needing to touch the screen. The function captures the
  // current printerSettings (PrintNode + direct LAN configs); the
  // ref keeps fetchOrders' deps=[] stable across printer config
  // changes. Luigi 2026-06-01: "if auto accept is on and printer
  // is connected, once accepted it should auto print".
  const autoPrintRef = useRef<((orderId: string, opts?: { force?: boolean }) => Promise<void>) | null>(null);
  // Mirror of printerSettings into a ref so the reservation poll
  // (deps=[activeTab]) can decide whether to auto-print a newly-
  // confirmed reservation without retearing-down the 4s interval
  // every time settings load. Luigi 2026-06-01.
  const printerSettingsRef = useRef<PrinterSettings | null>(null);
  const autoPrintedRef = useRef<Set<string>>(new Set());
  // Tracks orders we've already kicked an auto-reject request for, so the
  // 1-second `now` tick doesn't re-fire the PATCH while the previous one
  // is still in flight (or after it succeeded but before fetchOrders has
  // refreshed the list). Cleared when the order leaves the pending list.
  const autoRejectingRef = useRef<Set<string>>(new Set());
  const now = useNow();

  useEffect(() => { localStorage.setItem("kds-theme", themeMode); }, [themeMode]);

  // ── Client-side auto-reject when the 3-min countdown elapses ──────────
  // The cron (auto-reject-stale-orders) is the server-side safety net but
  // runs every 5 min — so without this client trigger, the bell can ring
  // for up to ~5 minutes past the visual countdown ending. The trigger
  // below fires the moment the kitchen tablet sees a pending order's
  // countdown drop past a small grace window (5 s past 0 — gives staff
  // the briefest chance to hit Accept on a buzzer-beater). Idempotent
  // server-side: if staff Accepted in the same beat, the PATCH 4xx's
  // because the order is no longer pending.
  //
  // The reason string here matches what auto-reject-orders.ts uses so a
  // mixed-source rejection looks consistent to the customer.
  useEffect(() => {
    if (!now) return;
    for (const order of orders) {
      if (order.status !== "pending") continue;
      if (autoRejectingRef.current.has(order.id)) continue;
      // Parked closed-when-placed orders haven't actually started ringing
      // yet — alertAt is the future moment when their countdown begins.
      if (order.alertAt && new Date(order.alertAt).getTime() > now) continue;
      const reference = order.alertAt ?? order.notifiedAt ?? order.createdAt;
      const totalMs = order.placedWhileClosed ? 15 * 60 * 1000 : 3 * 60 * 1000;
      const elapsed = now - new Date(reference).getTime();
      // 5-second grace past the countdown — lets the URGENT pulse render
      // for a beat before we kill the row.
      if (elapsed < totalMs + 5_000) continue;
      autoRejectingRef.current.add(order.id);
      const reason = `Auto-rejected: not accepted within ${order.placedWhileClosed ? 15 : 3} minutes.`;
      fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
      })
        .then(async (r) => {
          // 409 / 400 typically means the order already moved off pending
          // (staff Accepted in the same tick, or cron already rejected).
          // Either way the result we wanted — pending cleared — is true.
          if (!r.ok && r.status !== 409 && r.status !== 400) {
            // Surface unexpected failures so it doesn't silently retry-loop
            // every tick. The ref stays set; if staff want to retry they
            // can hit Reject manually.
            const body = await r.text().catch(() => "");
            console.warn(`[kds auto-reject] order ${order.id} PATCH failed:`, r.status, body.slice(0, 200));
          }
        })
        .catch((e) => console.warn(`[kds auto-reject] order ${order.id} network error:`, e))
        .finally(() => {
          // Next fetchOrders tick will pick up the new rejected status and
          // the row drops out of the pending list naturally.
          fetchOrders();
        });
    }
    // Garbage-collect the ref: drop IDs that aren't in the current pending
    // list anymore, so a future "manually-re-pended" order (shouldn't
    // happen but defensive) would get auto-rejected again next time.
    const pendingIds = new Set(orders.filter(o => o.status === "pending").map(o => o.id));
    for (const id of Array.from(autoRejectingRef.current)) {
      if (!pendingIds.has(id)) autoRejectingRef.current.delete(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, now]);

  // Load cleared-order sets from localStorage after hydration (can't do this
  // during render because the server has no localStorage, causing a mismatch).
  useEffect(() => {
    setClearedOrders(loadSet("kds-cleared-orders"));
    setClearedComplete(loadSet("kds-cleared-complete"));
  }, []);

  useEffect(() => {
    fetch("/api/kitchen/printnode/settings")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json().catch(() => null);
        if (data?.settings) setPrinterSettings(data.settings);
      })
      .catch(() => {});
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders");
      if (!res.ok) return;
      const body = await res.json();
      // Response shape evolved 2026-05-24: was Order[]; is now
      //   { orders: Order[]; kitchenWorkflowMode: "simple" | "tracking" }
      // Be tolerant of both — older deployments may still emit the
      // bare array, and tablets running a cached SW from a previous
      // build will keep reading the array shape for a few minutes
      // after deploy.
      const fresh: Order[] = Array.isArray(body) ? body : (body?.orders ?? []);
      const mode: "simple" | "tracking" =
        Array.isArray(body) ? "simple" : (body?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple");
      const pnEnabled: boolean =
        Array.isArray(body) ? false : !!body?.printNodeEnabled;

      const newPending = fresh.filter(o => o.status === "pending" && !seenIdsRef.current.has(o.id));
      if (newPending.length > 0) {
        // A new pending order ALWAYS re-arms the alarm — even if it was
        // silenced for an earlier order, the kitchen must hear the bell
        // for every new arrival.
        setAcknowledged(false);
        toast(`🔔 ${newPending.length} new order${newPending.length > 1 ? "s" : ""}!`, { icon: "🍕", duration: 6000 });
        newPending.forEach(o => seenIdsRef.current.add(o.id));
      }

      // Auto-accept-mode arrivals — order skipped the pending state
      // because Restaurant.autoAcceptOrders is true server-side, so it
      // wouldn't hit the alarm loop above. Luigi 2026-06-01: "ring
      // once instead of ongoing" so staff still get the heads-up.
      // Uses the SAME ringBellOnce primitive that drives the
      // continuous alarm — owner-chosen sound (synth / GloriaFood /
      // custom-uploaded), owner-chosen volume — but fired exactly
      // once per arriving order. No re-arm of the alarm loop.
      const newAutoAccepted = fresh.filter(
        o => o.status === "accepted" && !seenIdsRef.current.has(o.id),
      );
      if (newAutoAccepted.length > 0) {
        // Single chime via the shared sound primitive. Reads through
        // the ref so this fetchOrders callback (deps=[]) stays
        // stable across polls — without the ref, adding ringBellOnce
        // to fetchOrders' deps would tear the 4s interval down on
        // every volume/sound-choice change.
        try { ringBellOnceRef.current?.(); } catch { /* noop */ }
        toast(
          `✅ ${newAutoAccepted.length} new order${newAutoAccepted.length > 1 ? "s" : ""} auto-accepted`,
          { icon: "🍕", duration: 5000 },
        );
        // Fire auto-print for each auto-accepted order, same way the
        // manual Accept button triggers it elsewhere. The function
        // prefers Direct LAN printer (when configured) then falls
        // back to PrintNode. Its own internal autoPrintedRef
        // dedupes so a re-render or duplicate poll can't double-
        // print. Luigi 2026-06-01: "if auto accept is on and
        // printer is connected, once accepted it should auto print".
        for (const o of newAutoAccepted) {
          // force=true bypasses the per-printer "autoprint" toggle.
          // The owner has already opted into full automation via
          // autoAcceptOrders; gating on a second toggle would be
          // redundant and is what was preventing the receipt from
          // printing in Luigi's 2026-06-01 repro.
          autoPrintRef.current?.(o.id, { force: true }).catch((err) =>
            console.warn("[kds auto-print on auto-accept] failed:", err),
          );
        }
        newAutoAccepted.forEach(o => seenIdsRef.current.add(o.id));
      }

      setOrders(fresh);
      setWorkflowMode(mode);
      setPrintNodeEnabled(pnEnabled);
    } catch {}
  }, []);

  // Kitchen orders polling. We poll every 4 seconds while the tab is
  // visible — that's the "feels instant" target. We also force a fresh
  // poll the moment the tab regains visibility, focus, or comes back
  // online, so a backgrounded kitchen tab catches up immediately on
  // re-focus instead of waiting for the next interval.
  //
  // Why this matters: Chromium-based browsers (Edge/Chrome) throttle
  // setInterval to one tick per minute for hidden tabs since v87
  // (https://www.chromium.org/.../intensive-throttling). Without the
  // visibility/focus catch-ups, a kitchen tab in the background would
  // see new orders 20–60 seconds late, even though the polling timer
  // is set to 4s.
  //
  // Scale note: at 10k restaurants × 4s polling = 2,500 req/sec for
  // this endpoint alone. M-future replaces this with Server-Sent
  // Events so we get push semantics + no polling overhead. Tracked
  // in ROADMAP.md.
  useEffect(() => {
    const interval = setInterval(fetchOrders, 4000);
    const wake = () => {
      // Skip if the tab is still hidden (e.g. visibilitychange fired
      // because the tab is being hidden, not shown).
      if (document.visibilityState === "visible") fetchOrders();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [fetchOrders]);

  // Heartbeat: tell the server this device is online. Used by the admin
  // publishing checklist to know an order-taking app is connected. Sends
  // immediately on mount + every 60s while the page is open.
  useEffect(() => {
    let deviceHash = "";
    try {
      deviceHash = localStorage.getItem("kds-device-hash") || "";
      if (!deviceHash) {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        deviceHash = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("kds-device-hash", deviceHash);
      }
    } catch {}
    if (!deviceHash) return;
    const beat = () => {
      fetch("/api/kitchen/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceHash }),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, []);

  // pendingCount/alerting/silenceAlert are declared above next to the
  // bell-loop effect (they have to be in scope before that effect runs).

  const autoPrint = useCallback(async (orderId: string, opts?: { force?: boolean }) => {
    if (autoPrintedRef.current.has(orderId)) return;
    autoPrintedRef.current.add(orderId);
    // Preference order:
    //   1. Direct LAN printer (native app) — fastest, no third-party
    //      dependency, no monthly fee. The "main" path going forward.
    //   2. PrintNode — fallback for browser / desktop / non-native
    //      installs. Still works for restaurants who haven't installed
    //      the native app yet.
    //
    // `force` (Luigi 2026-06-01): when true, bypass the per-printer
    // "autoprint" toggles. Used by the auto-accept code path — the
    // owner has explicitly opted into full automation (server-side
    // autoAcceptOrders=true), so requiring them to also flip the
    // direct.autoprint or printerSettings.autoPrint toggle would
    // double-gate the same intent. Manual-accept path leaves `force`
    // undefined so the toggles still control "do I want a receipt
    // when I tap Accept?".
    const printType: "kitchen" | "customer" | "both" =
      printerSettings?.printKitchen && printerSettings?.printCustomer ? "both"
      : printerSettings?.printCustomer ? "customer"
      : "kitchen"; // default — chef always wants the ticket

    const direct = getDirectPrinterConfig();
    if (direct && (opts?.force || direct.autoprint)) {
      try {
        await doPrintDirect(orderId, printType);
        return;
      } catch (err) {
        console.warn("[kitchen/autoPrint] direct printer failed, trying PrintNode", err);
      }
    }
    // PrintNode path (legacy / backup)
    if (!printerSettings?.printNodeConnected || !printerSettings.selectedPrinterId) return;
    if (!opts?.force && !printerSettings.autoPrint) return;
    await doPrint(orderId, printType);
  }, [printerSettings]);

  // Keep autoPrintRef pointed at the latest autoPrint so fetchOrders
  // (deps=[]) can fire it without tearing down the 4s poll interval
  // every time printerSettings changes. Luigi 2026-06-01.
  useEffect(() => {
    autoPrintRef.current = autoPrint;
  }, [autoPrint]);

  // Keep printerSettingsRef in sync — read by the reservation auto-
  // print branch which sits inside a useEffect with deps=[activeTab].
  useEffect(() => {
    printerSettingsRef.current = printerSettings;
  }, [printerSettings]);

  /** Direct-printer path: fetch ESC/POS bytes from server, send to
   *  printer via native plugin. Used when the kitchen operator
   *  configured a Direct LAN printer in NativePrinterSetup.
   *
   *  Errors get user-friendly copy via nativePrinterErrorCopy() so
   *  the kitchen staff sees "Printer didn't respond — check Wi-Fi"
   *  rather than a stack trace. */
  /** Fetch + print a single receipt type (kitchen OR customer) via
   *  the native plugin. Caller is responsible for sequencing when
   *  both are requested. */
  const doPrintDirectOne = async (orderId: string, type: "kitchen" | "customer") => {
    if (!isNativePrinterAvailable()) throw new Error("Native plugin missing");
    const cfg = getDirectPrinterConfig();
    if (!cfg) throw new Error("Direct printer not configured");
    const res = await fetch(`/api/kitchen/print-job/${orderId}?width=${cfg.paperWidth}&type=${type}`);
    if (!res.ok) throw new Error("Failed to fetch print job");
    const { bytes, lines } = await res.json();
    if (!bytes && !lines) throw new Error("Empty print payload");
    const paperWidthDots = cfg.paperWidth === 58 ? 384 : 576;
    await nativePrint({
      ip: cfg.ip,
      port: cfg.port,
      bytes,
      lines,
      paperWidthDots,
      timeoutMs: 15000,
    });
  };

  /** Print one or more receipt types in sequence. "both" prints kitchen
   *  first (chef needs to see it ASAP), then customer. */
  const doPrintDirect = async (orderId: string, type: "kitchen" | "customer" | "both" = "kitchen") => {
    try {
      if (type === "both" || type === "kitchen") {
        await doPrintDirectOne(orderId, "kitchen");
      }
      if (type === "both" || type === "customer") {
        await doPrintDirectOne(orderId, "customer");
      }
      toast.success("Receipt printed ✓");
    } catch (err: any) {
      const reason = (err?.code || err?.message || "") as string;
      const copy = nativePrinterErrorCopy(reason);
      toast.error(copy);
      throw err;
    }
  };

  const doPrint = async (orderId: string, type: "kitchen" | "customer" | "both") => {
    // Direct LAN printer takes precedence when configured. Falls back
    // to PrintNode only when direct printing isn't set up or fails.
    const direct = getDirectPrinterConfig();
    if (direct) {
      try {
        await doPrintDirect(orderId, type);
        return;
      } catch {
        // fall through to PrintNode if also configured
      }
    }
    if (!printerSettings?.printNodeConnected || !printerSettings.selectedPrinterId) {
      toast.error("No printer configured. Open Printer Setup to connect.");
      setShowPrinterSetup(true);
      throw new Error("No printer");
    }
    const res = await fetch("/api/kitchen/printnode/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, orderId }),
    });
    const data = await res.json().catch(() => ({ error: "Invalid response" }));
    if (!res.ok) throw new Error(data.error ?? "Print failed");
    toast.success("Sent to printer!");
  };

  const updateStatus = async (orderId: string, status: string, extra?: Record<string, unknown>) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Failed to update order");
    await fetchOrders();
    if (status === "accepted") autoPrint(orderId);
  };

  const confirmAccept = async () => {
    if (!prepModal) return;
    await updateStatus(prepModal, "accepted", { preparationTime: parseInt(prepTime) || 20 });
    toast.success("Order accepted!");
    setPrepModal(null);
  };

  // Test order — fires a real Order through the same path as a customer
  // order: server creates the row + sends customer-confirmation email
  // (to the owner's inbox so they see what real customers receive) + sends
  // staff notification through notifyStaff. We deliberately do NOT add the
  // new order ID to seenIdsRef before fetchOrders — that way fetchOrders'
  // own "newPending" detection picks it up identically to a real order,
  // which triggers the new-order toast and starts the continuous bell.
  const createTestOrder = async () => {
    setTestOrdering(true);
    try {
      const res = await fetch("/api/kitchen/test-order", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to create test order"); return; }
      setActiveTab("orders");
      // fetchOrders detects the new pending order, flips `alerting` on via
      // the pending-count effect, and the bell loop kicks in.
      await fetchOrders();
      toast.success(tk("testOrderCreated"), { icon: "🔔", duration: 6000 });
    } catch (e: any) {
      toast.error(e.message ?? "Error creating test order");
    } finally {
      setTestOrdering(false);
    }
  };

  // Clear history. EXCLUDES pending orders (Luigi 2026-05-30 live bug):
  // adding a pending order to the local cleared set hides it from the
  // tab but leaves it active in the DB, so `pendingCount` stays > 0 and
  // the bell keeps ringing from an order the staff can no longer see.
  // Pending orders must be explicitly Accepted or Rejected before they
  // can be cleared.
  //
  // Also flips `acknowledged` to true as a safety net — if a previous
  // Clear-on-pending got into this state before the deploy, hitting
  // Clear now also silences the looping bell.
  const handleClearOrders = () => {
    const allVisible = orders
      .filter((o) => !clearedOrders.has(o.id) && o.status !== "pending")
      .map((o) => o.id);
    if (allVisible.length === 0) {
      toast.error(
        "Nothing to clear — pending orders must be Accepted or Rejected first.",
      );
      setClearConfirm(null);
      return;
    }
    const next = new Set([...clearedOrders, ...allVisible]);
    setClearedOrders(next);
    saveSet("kds-cleared-orders", next);
    setSelectedId(null);
    setClearConfirm(null);
    setAcknowledged(true); // silence any stale bell from prior cleared-pending bug
  };

  const handleClearComplete = () => {
    const allVisible = orders
      .filter(o => COMPLETE_STATUSES.includes(o.status) && !clearedComplete.has(o.id))
      .map(o => o.id);
    const next = new Set([...clearedComplete, ...allVisible]);
    setClearedComplete(next);
    saveSet("kds-cleared-complete", next);
    setSelectedId(null);
    setClearConfirm(null);
  };

  // Tab data — Orders = permanent history (all statuses), In Progress = operational, Complete = done
  const ordersTabItems = orders.filter(o => !clearedOrders.has(o.id));
  // In-progress tab. In Simple mode (GloriaFood-style) we also apply a
  // date filter so the tab doesn't accumulate orders forever — since
  // simple-mode orders never transition out of "accepted" except via
  // the daily auto-complete cron, without this filter the In Progress
  // tab would grow indefinitely between cron runs. The filter shows:
  //   - orders created today (regardless of scheduledFor)
  //   - orders scheduled for today or tomorrow
  // Tracking mode keeps the full unfiltered list because the kitchen
  // explicitly moves orders out via the state buttons.
  const inProgressItems = (() => {
    const base = orders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));
    if (workflowMode !== "simple") return base;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfterTomorrow = new Date(todayStart);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    return base.filter(o => {
      const created = o.createdAt ? new Date(o.createdAt) : null;
      const scheduled = (o as any).scheduledFor ? new Date((o as any).scheduledFor) : null;
      if (created && created >= todayStart) return true;
      if (scheduled && scheduled >= todayStart && scheduled < dayAfterTomorrow) return true;
      return false;
    });
  })();
  const completeItems = orders.filter(o => COMPLETE_STATUSES.includes(o.status) && !clearedComplete.has(o.id));

  const tabOrders: Order[] =
    activeTab === "orders" ? ordersTabItems :
    activeTab === "inprogress" ? inProgressItems :
    completeItems;

  const tabCounts = {
    orders: ordersTabItems.length,
    inprogress: inProgressItems.length,
    complete: completeItems.length,
    reservations: reservations.filter(r => r.status === "pending" || r.status === "confirmed").length,
  };

  // pendingCount is declared above next to `alerting`.
  const selectedOrder = orders.find(o => o.id === selectedId) ?? null;
  // Direct LAN printer takes precedence — when configured, it's the
  // primary print path and the header should reflect ITS status, not
  // a leftover PrintNode setting from before the switch. Falls back
  // to PrintNode status only if Direct isn't configured at all.
  const directCfg = getDirectPrinterConfig();
  const directReady = !!directCfg;
  const printNodeReady = !!(printerSettings?.printNodeConnected && printerSettings.selectedPrinterId);
  const printerReady = directReady || printNodeReady;
  const printerLabel = directReady
    ? `Direct: ${directCfg!.ip}`
    : printNodeReady
    ? (printerSettings!.selectedPrinterName ?? "Connected")
    : null;

  return (
    <div className={`h-screen flex flex-col ${t.base}`}>
      {/* ── Header ── */}
      <header className={`${t.header} px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between flex-shrink-0 gap-2`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ChefHat className="w-6 h-6 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className={`font-bold text-sm sm:text-base ${t.text} leading-tight truncate`}>{restaurant?.name ?? "Kitchen"}</div>
            {/* Subtitle hidden on phones — they're already on the kitchen page, the chef-hat
                + restaurant name is enough orientation. Frees ~14px vertical for the tabs. */}
            <div className={`text-xs ${t.muted} hidden sm:block`}>Kitchen Display</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pending-orders badge doubles as a one-tap "silence" button.
              While alerting: pulses orange, label "X new — tap to silence".
              While silenced: static dim badge, label "X waiting — tap to re-arm".
              Disappears when no orders are pending. */}
          {pendingCount > 0 && (
            <button
              onClick={() => alerting ? silenceAlert() : setAcknowledged(false)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition cursor-pointer ${
                alerting
                  ? "bg-emerald-500 text-white animate-pulse hover:bg-emerald-600"
                  : "bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30"
              }`}
              title={alerting ? "Tap to silence the alarm" : "Tap to re-arm the alarm"}
              aria-label={alerting ? "Silence alarm" : "Re-arm alarm"}
            >
              {alerting ? <Bell className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline sm:inline">{pendingCount} new</span>
              <span className="xs:hidden sm:hidden">{pendingCount}</span>
            </button>
          )}

          <button onClick={fetchOrders} className={`p-2 rounded-lg ${t.btn} ${t.muted}`} title={tk("inProgress")}>
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Sound settings — opens volume/mute panel. Icon reflects state:
              muted → red bell-off, low → amber, healthy → green. */}
          <button
            onClick={() => setShowSoundSettings(true)}
            className={`relative p-2 rounded-lg ${t.btn} transition ${
              alertMuted || alertVolume === 0
                ? "text-red-500"
                : alertVolume < 0.5
                  ? "text-amber-500"
                  : "text-green-600"
            }`}
            title="Alert sound settings"
            aria-label="Alert sound settings"
          >
            {alertMuted || alertVolume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            {/* Pulse dot when bell is actively ringing. */}
            {alerting && !alertMuted && alertVolume > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" aria-hidden="true" />
            )}
          </button>

          <button
            onClick={() => setThemeMode(m => m === "light" ? "dark" : "light")}
            className={`p-2 rounded-lg ${t.btn} ${t.muted}`}
            title={themeMode === "light" ? tk("darkMode") : tk("lightMode")}
          >
            {themeMode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              // Routing logic for the printer setup button:
              //   1. Running in native app → Direct WiFi/LAN setup
              //      (main path, mDNS auto-discovery)
              //   2. Running in browser AND admin has enabled PrintNode
              //      backup → PrintNode setup (legacy/backup path)
              //   3. Running in browser AND PrintNode NOT enabled →
              //      Direct setup modal too, which surfaces the "install
              //      the native app" hint
              if (isNativePrinterAvailable()) {
                setShowDirectPrinterSetup(true);
              } else if (printNodeEnabled) {
                setShowPrinterSetup(true);
              } else {
                setShowDirectPrinterSetup(true);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              printerReady ? "border-green-500/40 text-green-600" : "border-emerald-500/40 text-emerald-600"
            } ${t.btn}`}
            title={tk("printerSetup")}
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {printerLabel ?? tk("printerSetup")}
            </span>
          </button>

          {/* Delivery dispatch toggle — only renders for restaurants on
              "both" mode (own + ShipDay), where staff can swap which
              source new orders dispatch to. Hidden for own-only or
              shipday-only restaurants (those are admin-controlled). */}
          <DispatchModeToggle themeBtnClass={t.btn} />

          {/* Test Order — fires a real order through the full pipeline
              (DB row + customer-confirmation email to owner inbox + staff
              notification fan-out + kitchen bell + auto-print on accept).
              Prominent purple pill, visible on every screen size so owners
              can validate the end-to-end flow at any time. */}
          <button
            onClick={createTestOrder}
            disabled={testOrdering}
            className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 sm:py-2 rounded-lg font-bold transition disabled:opacity-60 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm"
            title={tk("testOrder")}
            aria-label={tk("testOrder")}
          >
            {testOrdering
              ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              : <FlaskConical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span>{tk("testOrder")}</span>
          </button>

          <button
            onClick={() => signOut({ callbackUrl: "/kitchen/login" })}
            className={`p-2 rounded-lg ${t.btn} ${t.muted}`}
            title={tk("logOut")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Low-volume / muted warning ──
           Shown only when there's a pending order AND the bell is silenced
           or quieter than 50%. Kitchens that miss orders lose money, so
           this is intentionally loud (red) and a one-tap fix. */}
      {alerting && (alertMuted || alertVolume < 0.5) && (
        <div
          className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-red-500 text-white text-xs sm:text-sm font-semibold cursor-pointer hover:bg-red-600 transition"
          onClick={() => setShowSoundSettings(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowSoundSettings(true); }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 min-w-0">
            {alertMuted || alertVolume === 0
              ? "Alert sound is OFF — you may miss new orders. Tap to fix."
              : `Alert volume is low (${Math.round(alertVolume * 100)}%) — you may miss new orders. Tap to fix.`}
          </span>
        </div>
      )}

      {/* ── Tabs ── flex-1 tabs share width so all four fit on a 375px phone.
           The clear-history action collapses to an icon-only trash button on
           mobile so it doesn't push the reservations tab off-screen. */}
      <div className={`${t.tabs} flex items-stretch flex-shrink-0`}>
        <div className="flex flex-1 min-w-0">
          {(["orders", "inprogress", "complete", "reservations"] as KTab[]).map(tab => {
            const labels: Record<KTab, string> = {
              orders: tk("allOrders"),
              inprogress: tk("inProgress"),
              complete: tk("complete"),
              reservations: tk("reservations"),
            };
            const count = tabCounts[tab];
            const isActive = activeTab === tab;
            const styles = (themeMode === "dark" ? TAB_STYLES_DARK : TAB_STYLES_LIGHT)[tab];
            const Icon = styles.Icon;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-0 px-1.5 sm:px-5 py-2.5 sm:py-3 text-[11px] sm:text-sm font-semibold flex items-center justify-center sm:justify-start gap-1 sm:gap-2 border-b-2 transition touch-manipulation cursor-pointer whitespace-nowrap ${
                  isActive
                    ? `${styles.activeBorder} ${styles.activeText} ${styles.activeBg}`
                    : `border-transparent ${themeMode === "dark" ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`
                }`}
              >
                {/* Per-tab icon — colored even when inactive so each tab
                    has a unique scannable identity. */}
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isActive ? styles.activeText : styles.inactiveIcon}`} />
                <span className="truncate">{labels[tab]}</span>
                {/* Count badge: full pill on tablet+, mobile shows only a small
                    colored dot so the full tab label has room to render.
                    Color matches the per-tab identity. */}
                {count > 0 && (
                  <>
                    <span className={`hidden sm:inline text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 ${styles.badge}`}>
                      {count}
                    </span>
                    <span className={`sm:hidden inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.badge}`} aria-hidden="true" />
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Clear history button — shown only for the relevant tabs. Icon-only on
            mobile, icon + "Clear orders" label on tablet/desktop. */}
        {((activeTab === "orders" && tabCounts.orders > 0) ||
          (activeTab === "complete" && tabCounts.complete > 0)) && (
          <button
            type="button"
            onClick={() => setClearConfirm(activeTab === "orders" ? "orders" : "complete")}
            aria-label={tk("clearOrders")}
            title={tk("clearOrders")}
            className={`flex-shrink-0 my-1.5 mx-1.5 sm:mr-3 flex items-center gap-1.5 text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 active:bg-red-500/20 transition touch-manipulation cursor-pointer`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tk("clearOrders")}</span>
          </button>
        )}
      </div>

      {/* Render a reservation card, reused on both Reservations tab and Orders tab. */}
      {/* (defined as a const so the JSX below can reference it) */}

      {/* ── Reservations panel (replaces the order list when this tab is active) ── */}
      {activeTab === "reservations" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reservations.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-20 ${t.muted}`}>
              <Clock className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{tk("noReservations")}</p>
            </div>
          ) : reservations.map(r => (
            <ReservationCard
              key={r.id}
              r={r}
              t={t}
              onStatusChange={updateReservationStatus}
              onPrint={printReservation}
            />
          ))}
        </div>
      )}

      {/* ── Main content (orders / in-progress / complete) ── */}
      {activeTab !== "reservations" && (
      <div className="flex-1 flex overflow-hidden">
        {/* Order list */}
        <div className={`${selectedOrder ? "hidden md:flex" : "flex"} flex-col w-full md:w-2/5 lg:w-1/3 border-r ${t.border} overflow-y-auto`}>
          {/* Reservations strip — only on the Orders tab */}
          {activeTab === "orders" && reservations.length > 0 && (
            <div className={`px-3 py-3 border-b ${t.border} space-y-2 bg-opacity-50`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider ${t.muted} px-1`}>
                {tk("reservations")} · {reservations.length}
              </div>
              {reservations.slice(0, 6).map(r => (
                <ReservationCard key={r.id} r={r} t={t} onStatusChange={updateReservationStatus} onPrint={printReservation} compact />
              ))}
              {reservations.length > 6 && (
                <button
                  onClick={() => setActiveTab("reservations")}
                  className={`w-full text-xs font-semibold py-1.5 rounded-lg ${t.muted} hover:${t.text} transition`}
                >
                  + {reservations.length - 6} more — see all
                </button>
              )}
            </div>
          )}

          {tabOrders.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-20 ${t.muted}`}>
              <Package className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{tk("noOrders")}</p>
            </div>
          ) : (
            tabOrders.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                selected={selectedId === order.id}
                onClick={() => {
                  setSelectedId(order.id);
                  if (order.status === "pending") setPrepModal(order.id);
                }}
                t={t}
                now={now}
              />
            ))
          )}
        </div>

        {/* Order detail */}
        {selectedOrder ? (
          <div className="flex-1 relative overflow-hidden">
            <OrderDetail
              order={selectedOrder}
              t={t}
              onClose={() => setSelectedId(null)}
              onUpdate={async (id, status, extra) => {
                if (status === "accepted") setPrepModal(id);
                else await updateStatus(id, status, extra);
              }}
              onPrint={doPrint}
              printerReady={printerReady}
              workflowMode={workflowMode}
            />
          </div>
        ) : (
          <div className={`hidden md:flex flex-1 items-center justify-center ${t.muted}`}>
            <div className="text-center">
              <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{tk("openOrder")}</p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Accept + prep time modal ── */}
      {prepModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className={`${t.modal} rounded-2xl w-full max-w-sm p-6`}>
            <h3 className={`text-xl font-bold ${t.text} mb-4`}>Accept Order</h3>
            <label className={`text-sm ${t.muted} block mb-2`}>Preparation time (minutes)</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {["10", "15", "20", "25", "30", "45", "60"].map(tm => (
                <button
                  key={tm}
                  onClick={() => setPrepTime(tm)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                    prepTime === tm ? "bg-emerald-500 text-white" : `${t.btn} ${t.muted}`
                  }`}
                >
                  {tm}
                </button>
              ))}
            </div>
            <input
              type="number" min="1" max="240"
              className={`w-full rounded-xl px-3 py-2 border ${t.input} text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-emerald-500`}
              value={prepTime}
              onChange={e => setPrepTime(e.target.value)}
            />
            <p className={`text-xs ${t.muted} mb-4`}>
              Customer will see estimated ready time based on this.
            </p>
            {printerSettings?.autoPrint && printerReady && (
              <p className="text-xs text-emerald-500 mb-4 flex items-center gap-1">
                <Printer className="w-3 h-3" /> Receipt will print automatically.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={confirmAccept}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition"
              >
                <CheckCircle className="w-4 h-4 inline mr-1.5" />Confirm
              </button>
              <button
                onClick={() => setPrepModal(null)}
                className={`flex-1 ${t.btn} py-3 rounded-xl font-semibold transition`}
              >
                Cancel
              </button>
            </div>

            {/* Don't want to accept? One tap opens the shared reject flow.
                We close the Accept prompt first, then open the reject
                modal — they're z-stacked so this also keeps focus
                management sane. */}
            <button
              onClick={() => {
                const id = prepModal;
                setPrepModal(null);
                if (id) setRejectFromPrep(id);
              }}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-3 rounded-xl transition"
            >
              <XCircle className="w-4 h-4" /> {tk("reject")}
            </button>
          </div>
        </div>
      )}

      {/* Reject modal triggered from the Accept Order prompt. The version
          rendered inside OrderDetail is separate (different open state). */}
      <RejectOrderModal
        open={!!rejectFromPrep}
        order={orders.find((o) => o.id === rejectFromPrep) ?? null}
        t={t}
        onClose={() => setRejectFromPrep(null)}
        onConfirm={async (reason) => {
          if (!rejectFromPrep) return;
          await updateStatus(rejectFromPrep, "rejected", { rejectionReason: reason });
          toast.success("Order rejected — customer notified");
        }}
      />

      {/* ── Clear history confirmation modal ── */}
      {clearConfirm === "orders" && (
        <ConfirmModal
          t={t}
          title="Clear Order History"
          message="Remove non-pending orders from the Orders tab? Pending orders MUST be Accepted or Rejected first — they can't be cleared while still waiting for staff action. In-progress orders remain in the In Progress tab. New orders will still appear here. This cannot be undone."
          confirmLabel="Yes, Clear History"
          onConfirm={handleClearOrders}
          onCancel={() => setClearConfirm(null)}
        />
      )}
      {clearConfirm === "complete" && (
        <ConfirmModal
          t={t}
          title="Clear Completed History"
          message="Remove all completed orders from the Complete tab? This cannot be undone."
          confirmLabel="Yes, Clear History"
          onConfirm={handleClearComplete}
          onCancel={() => setClearConfirm(null)}
        />
      )}

      {/* ── Alert Sound Settings Modal ──
           Volume slider + mute toggle + test button. The intent is for the
           default to be MAX volume and for restaurants to actively turn it
           down — anything quieter triggers the red banner above so a
           manager walking past sees the warning. */}
      {showSoundSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className={`${t.modal} rounded-2xl w-full max-w-sm p-6 shadow-2xl`}>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-emerald-500" />
              <h3 className={`text-lg font-bold ${t.text}`}>Alert Sound</h3>
            </div>
            <p className={`text-sm ${t.muted} mb-5`}>
              The bell rings whenever a new order is waiting. Spaced out at
              first, then escalates to rapid in the final 30 seconds before
              the order is auto-rejected. Keep it loud so you never miss one.
            </p>

            {/* Sound picker. The 3rd "Custom Sound" option is only
                rendered when the owner uploaded a file in /admin/profile
                — otherwise the picker stays 2-wide (GloriaFood + Classic
                Bell). Each option is exclusive — picking one means the
                others never play, even on load failure. */}
            <div className="mb-5">
              <label className={`text-sm font-semibold ${t.text} block mb-2`}>
                Alert sound
              </label>
              <div className={`grid gap-2 ${customSoundUrl ? "grid-cols-3" : "grid-cols-2"}`}>
                {([
                  {
                    id: "gloriafood",
                    label: "GloriaFood Ding",
                    sub: "Default",
                  },
                  {
                    id: "synth",
                    label: "Classic Bell",
                    sub: "Synthesized",
                  },
                  ...(customSoundUrl ? [{
                    id: "custom" as const,
                    label: "Custom Sound",
                    sub: "Owner-uploaded",
                  }] : []),
                ] as Array<{ id: AlertSoundChoice; label: string; sub: string }>).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setAlertSound(opt.id)}
                    className={`text-left py-2 px-3 rounded-xl border-2 transition ${
                      alertSound === opt.id
                        ? "border-emerald-500 bg-emerald-500/10"
                        : `border-transparent ${t.btn}`
                    }`}
                  >
                    <div className={`text-sm font-bold ${t.text}`}>{opt.label}</div>
                    <div className={`text-[11px] ${t.muted} mt-0.5`}>{opt.sub}</div>
                  </button>
                ))}
              </div>
              <p className={`text-[11px] ${t.muted} mt-2`}>
                {customSoundUrl
                  ? "Upload or replace your custom ring from /admin/profile."
                  : "Want a custom sound? Upload one from /admin/profile."}
                {" "}Use the test button below to preview your selection.
              </p>
            </div>

            {/* Volume slider */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-semibold ${t.text}`}>Volume</label>
                <span className={`text-sm font-mono ${t.muted}`}>
                  {alertMuted ? "Muted" : `${Math.round(alertVolume * 100)}%`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <VolumeX className={`w-4 h-4 flex-shrink-0 ${t.muted}`} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(alertVolume * 100)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) / 100;
                    setAlertVolume(v);
                    if (v > 0) setAlertMuted(false);
                  }}
                  className="flex-1 accent-emerald-500 cursor-pointer"
                  aria-label="Alert volume"
                />
                <Volume2 className={`w-4 h-4 flex-shrink-0 ${t.muted}`} />
              </div>
              {/* Quick presets */}
              <div className="flex gap-2 mt-3">
                {[
                  { label: "25%", v: 0.25 },
                  { label: "50%", v: 0.5 },
                  { label: "75%", v: 0.75 },
                  { label: "Max", v: 1.0 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setAlertVolume(p.v); setAlertMuted(false); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                      !alertMuted && Math.abs(alertVolume - p.v) < 0.01
                        ? "bg-emerald-500 text-white"
                        : `${t.btn} ${t.muted}`
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Low-volume warning inside the modal */}
            {!alertMuted && alertVolume > 0 && alertVolume < 0.5 && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Volume is below 50%. We recommend keeping it at maximum
                  so your team never misses an order during a busy rush.
                </span>
              </div>
            )}
            {(alertMuted || alertVolume === 0) && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-600 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Alert sound is OFF. New orders will appear visually only —
                  you may not notice them in a noisy kitchen.
                </span>
              </div>
            )}

            {/* Silence current alarm — only when actually ringing. Stops
                the bell until the next new pending order arrives. This is
                what owners are usually looking for when they open this
                modal mid-rush. Put first so it's the obvious answer. */}
            {alerting && (
              <button
                onClick={() => {
                  silenceAlert();
                  setShowSoundSettings(false);
                }}
                className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-red-500 hover:bg-red-600 text-white transition"
              >
                <VolumeX className="w-4 h-4" /> Silence current alarm
              </button>
            )}

            {/* Mute toggle — permanently silences ALL bells (across reloads)
                until manually unmuted. Different from Silence above, which
                only quiets the current alarm. */}
            <button
              onClick={() => setAlertMuted((m) => !m)}
              className={`w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition ${
                alertMuted
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : `${t.btn} ${t.text}`
              }`}
            >
              {alertMuted ? (
                <><VolumeX className="w-4 h-4" /> Sound muted — tap to unmute</>
              ) : (
                <><Volume2 className="w-4 h-4" /> Sound on — tap to mute permanently</>
              )}
            </button>

            {/* Test sound — plays ONE strike so the owner can hear the
                tone at the current volume. Disabled when muted or volume
                is zero. (If the real alarm is ringing right now, that's
                what they're actually hearing — the Silence button above
                stops it.) */}
            <button
              onClick={testAlertSound}
              disabled={alertMuted || alertVolume === 0}
              className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
            >
              <Bell className="w-4 h-4" /> Play test sound (1 ring)
            </button>

            <button
              onClick={() => setShowSoundSettings(false)}
              className={`w-full ${t.btn} py-2.5 rounded-xl font-semibold text-sm transition`}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Printer Setup: Direct LAN (primary, native app only) ── */}
      {showDirectPrinterSetup && (
        <NativePrinterSetup onClose={() => setShowDirectPrinterSetup(false)} />
      )}

      {/* ── Printer Setup: PrintNode (legacy / browser / Windows bridge) ──
          Direct LAN printing via the native app is the recommended
          path. This modal stays available as a backup for restaurants
          who can't (or don't want to) install the native app + for
          existing PrintNode-configured setups. */}
      {showPrinterSetup && (
        <PrinterSetupModal
          onClose={() => setShowPrinterSetup(false)}
          onSettingsSaved={saved => setPrinterSettings(saved)}
          themeMode={themeMode}
        />
      )}

      {/* First-run guided tour. Renders nothing if the operator has
          previously skipped or completed it on this device for this
          restaurant. Scoped per restaurant.id so chain staff who pick
          a different location see the tour fresh. */}
      <KitchenFirstRunTour restaurantId={restaurant?.id ?? null} />
    </div>
  );
}
