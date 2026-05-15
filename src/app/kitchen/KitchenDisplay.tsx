"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  Bell, Printer, RefreshCw, LogOut, ChefHat, Sun, Moon,
  Package, Clock, Truck, ShoppingBag, CheckCircle, Trash2,
  FlaskConical, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { signOut } from "next-auth/react";
import { PrinterSetupModal } from "./PrinterSetupModal";
import { OrderDetail } from "./OrderDetail";
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
function Countdown({ createdAt, now }: { createdAt: string; now: number }) {
  // Stable placeholder until the client mounts (now === 0) to avoid hydration mismatch.
  if (!now) return <span className="text-xs font-mono text-gray-400">--:--</span>;
  const ms = 3 * 60 * 1000 - (now - new Date(createdAt).getTime());
  if (ms <= 0) return <span className="text-xs font-bold text-red-500 animate-pulse">URGENT</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const color = ms < 60000 ? "text-red-500 font-bold" : "text-orange-500 font-semibold";
  return <span className={`text-xs ${color} font-mono`}>{m}:{s.toString().padStart(2, "0")}</span>;
}

// ── Order row ─────────────────────────────────────────────────────────────────
function OrderRow({ order, selected, onClick, t, now }: {
  order: Order; selected: boolean; onClick: () => void; t: T; now: number;
}) {
  const tk = useTranslations("kitchen");
  // `now === 0` means the client hasn't mounted yet (see useNow). Render
  // stable, time-independent values during SSR/first paint to match hydration.
  const isNew = !!now && order.status === "pending" && (now - new Date(order.createdAt).getTime()) < 30000;
  const rowClass = selected ? t.rowSelected : isNew ? `${t.rowNew} cursor-pointer` : t.row;
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
          isTest ? "bg-purple-500/20" :
          order.type === "delivery" ? "bg-blue-500/20" : "bg-orange-500/20"
        }`}>
          {isTest
            ? <FlaskConical className="w-4 h-4 text-purple-500" />
            : order.type === "delivery"
              ? <Truck className="w-4 h-4 text-blue-500" />
              : <ShoppingBag className="w-4 h-4 text-orange-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${t.text}`}>#{order.orderNumber}</span>
            <StatusBadge status={order.status} t={t} />
            {order.status === "pending" && <Countdown createdAt={order.createdAt} now={now} />}
            {isTest && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-500">TEST</span>}
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

  // Poll upcoming reservations whenever the Reservations OR Orders tab is open
  // (Orders tab shows reservations alongside the order list).
  useEffect(() => {
    if (activeTab !== "reservations" && activeTab !== "orders") return;
    let cancelled = false;
    const fetchRes = async () => {
      try {
        const res = await fetch("/api/admin/reservations/upcoming");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setReservations(data);
      } catch {}
    };
    fetchRes();
    const id = setInterval(fetchRes, 30000);
    return () => { cancelled = true; clearInterval(id); };
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
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings | null>(null);
  const [alerting, setAlerting] = useState(false);
  const [prepModal, setPrepModal] = useState<string | null>(null);
  const [prepTime, setPrepTime] = useState("20");
  const [testOrdering, setTestOrdering] = useState(false);

  // Clear history sets (localStorage-persisted).
  // Start empty on both server and client so hydration matches, then load
  // from localStorage in an effect after the first render.
  const [clearedOrders, setClearedOrders] = useState<Set<string>>(() => new Set());
  const [clearedComplete, setClearedComplete] = useState<Set<string>>(() => new Set());
  const [clearConfirm, setClearConfirm] = useState<"orders" | "complete" | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set(initialOrders.map(o => o.id)));
  const autoPrintedRef = useRef<Set<string>>(new Set());
  const now = useNow();

  useEffect(() => { localStorage.setItem("kds-theme", themeMode); }, [themeMode]);

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
      const fresh: Order[] = await res.json();

      const newPending = fresh.filter(o => o.status === "pending" && !seenIdsRef.current.has(o.id));
      if (newPending.length > 0) {
        setAlerting(true);
        toast(`🔔 ${newPending.length} new order${newPending.length > 1 ? "s" : ""}!`, { icon: "🍕", duration: 6000 });
        newPending.forEach(o => seenIdsRef.current.add(o.id));
      }

      setOrders(fresh);
    } catch {}
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchOrders, 4000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Alert sound on pending orders
  useEffect(() => {
    const pending = orders.filter(o => o.status === "pending").length;
    setAlerting(pending > 0);
  }, [orders]);

  useEffect(() => {
    if (!alerting) return;
    const interval = setInterval(() => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "square";
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [alerting]);

  const autoPrint = useCallback(async (orderId: string) => {
    if (!printerSettings?.autoPrint || !printerSettings.printNodeConnected || !printerSettings.selectedPrinterId) return;
    if (autoPrintedRef.current.has(orderId)) return;
    autoPrintedRef.current.add(orderId);
    const type = printerSettings.printKitchen && printerSettings.printCustomer ? "both"
      : printerSettings.printKitchen ? "kitchen"
      : printerSettings.printCustomer ? "customer"
      : null;
    if (!type) return;
    await doPrint(orderId, type);
  }, [printerSettings]);

  const doPrint = async (orderId: string, type: "kitchen" | "customer" | "both") => {
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

  // Test order
  const createTestOrder = async () => {
    setTestOrdering(true);
    try {
      const res = await fetch("/api/kitchen/test-order", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to create test order"); return; }
      // Add to seen IDs so it doesn't trigger the generic "new order" detection on poll
      // but we do want to trigger the alert once here
      seenIdsRef.current.add(data.id);
      await fetchOrders();
      setAlerting(true);
      setActiveTab("orders");
      toast("🧪 Test order created — appears as new pending order!", { icon: "🔔", duration: 6000 });
    } catch (e: any) {
      toast.error(e.message ?? "Error creating test order");
    } finally {
      setTestOrdering(false);
    }
  };

  // Clear history
  const handleClearOrders = () => {
    const allVisible = orders.filter(o => !clearedOrders.has(o.id)).map(o => o.id);
    const next = new Set([...clearedOrders, ...allVisible]);
    setClearedOrders(next);
    saveSet("kds-cleared-orders", next);
    setSelectedId(null);
    setClearConfirm(null);
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
  const inProgressItems = orders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));
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

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const selectedOrder = orders.find(o => o.id === selectedId) ?? null;
  const printerReady = !!(printerSettings?.printNodeConnected && printerSettings.selectedPrinterId);

  return (
    <div className={`h-screen flex flex-col ${t.base}`}>
      {/* ── Header ── */}
      <header className={`${t.header} px-4 py-3 flex items-center justify-between flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-500" />
          <div>
            <div className={`font-bold text-base ${t.text} leading-tight`}>{restaurant?.name ?? "Kitchen"}</div>
            <div className={`text-xs ${t.muted}`}>Kitchen Display</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {alerting && (
            <div className="flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
              <Bell className="w-3.5 h-3.5" />
              {pendingCount} new
            </div>
          )}

          <button onClick={fetchOrders} className={`p-2 rounded-lg ${t.btn} ${t.muted}`} title={tk("inProgress")}>
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setThemeMode(m => m === "light" ? "dark" : "light")}
            className={`p-2 rounded-lg ${t.btn} ${t.muted}`}
            title={themeMode === "light" ? tk("darkMode") : tk("lightMode")}
          >
            {themeMode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowPrinterSetup(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              printerReady ? "border-green-500/40 text-green-600" : "border-orange-500/40 text-orange-600"
            } ${t.btn}`}
            title={tk("printerSetup")}
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {printerReady ? (printerSettings!.selectedPrinterName ?? tk("printerConnected")) : tk("printerSetup")}
            </span>
          </button>

          <button
            onClick={createTestOrder}
            disabled={testOrdering}
            className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition disabled:opacity-50 border-purple-500/40 text-purple-600 ${t.btn}`}
            title={tk("testPrint")}
          >
            {testOrdering
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FlaskConical className="w-3.5 h-3.5" />}
            {tk("testPrint")}
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

      {/* ── Tabs ── */}
      <div className={`${t.tabs} flex items-center flex-shrink-0`}>
        {(["orders", "inprogress", "complete", "reservations"] as KTab[]).map(tab => {
          const labels: Record<KTab, string> = { orders: tk("newOrders"), inprogress: tk("inProgress"), complete: tk("completed"), reservations: tk("reservations") };
          const count = tabCounts[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${activeTab === tab ? t.tabActive : t.tabInactive}`}
            >
              {labels[tab]}
              {count > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  tab === "orders" && pendingCount > 0 ? "bg-orange-500 text-white" :
                  tab === "inprogress" ? "bg-blue-500 text-white" :
                  "bg-gray-200 text-gray-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Clear history buttons */}
        {activeTab === "orders" && tabCounts.orders > 0 && (
          <button
            onClick={() => setClearConfirm("orders")}
            className={`ml-auto mr-3 my-1.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition`}
          >
            <Trash2 className="w-3.5 h-3.5" /> {tk("done")}
          </button>
        )}
        {activeTab === "complete" && tabCounts.complete > 0 && (
          <button
            onClick={() => setClearConfirm("complete")}
            className={`ml-auto mr-3 my-1.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition`}
          >
            <Trash2 className="w-3.5 h-3.5" /> {tk("done")}
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
                    prepTime === tm ? "bg-orange-500 text-white" : `${t.btn} ${t.muted}`
                  }`}
                >
                  {tm}
                </button>
              ))}
            </div>
            <input
              type="number" min="1" max="240"
              className={`w-full rounded-xl px-3 py-2 border ${t.input} text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-orange-500`}
              value={prepTime}
              onChange={e => setPrepTime(e.target.value)}
            />
            <p className={`text-xs ${t.muted} mb-4`}>
              Customer will see estimated ready time based on this.
            </p>
            {printerSettings?.autoPrint && printerReady && (
              <p className="text-xs text-orange-500 mb-4 flex items-center gap-1">
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
          </div>
        </div>
      )}

      {/* ── Clear history confirmation modal ── */}
      {clearConfirm === "orders" && (
        <ConfirmModal
          t={t}
          title="Clear Order History"
          message="Remove all orders from the Orders tab? In-progress orders remain in the In Progress tab. New orders will still appear here. This cannot be undone."
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

      {/* ── Printer Setup Modal ── */}
      {showPrinterSetup && (
        <PrinterSetupModal
          onClose={() => setShowPrinterSetup(false)}
          onSettingsSaved={saved => setPrinterSettings(saved)}
          themeMode={themeMode}
        />
      )}
    </div>
  );
}
