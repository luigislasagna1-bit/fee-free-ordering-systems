"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  Bell, Printer, RefreshCw, LogOut, ChefHat, Sun, Moon,
  Package, Clock, Truck, ShoppingBag, CheckCircle, Trash2,
  FlaskConical, Loader2, Volume2, VolumeX, AlertTriangle, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { signOut } from "next-auth/react";
import { PrinterSetupModal } from "./PrinterSetupModal";
import { OrderDetail } from "./OrderDetail";
import { RejectOrderModal } from "./RejectOrderModal";
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
            {order.viaMarketplace && (
              // Marketplace channel attribution — purple to differentiate
              // from direct widget/walk-up orders. Staff sees at a glance
              // which orders came from /marketplace discovery.
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300">
                MARKETPLACE
              </span>
            )}
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);

  // Load saved volume / mute on mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem("kds-alert-volume");
      if (v !== null) {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) setAlertVolume(Math.max(0, Math.min(1, n)));
      }
      const m = localStorage.getItem("kds-alert-muted");
      if (m === "1") setAlertMuted(true);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("kds-alert-volume", String(alertVolume)); } catch {}
  }, [alertVolume]);
  useEffect(() => {
    try { localStorage.setItem("kds-alert-muted", alertMuted ? "1" : "0"); } catch {}
  }, [alertMuted]);

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
   * Synthesize one bell strike. We stack four sine partials at classic
   * struck-bell harmonic ratios (1, 2.756, 5.404, 8.933) with an
   * exponential decay envelope — produces a much warmer, more "alarm bell"
   * sound than a single square wave.
   */
  const ringBellOnce = useCallback((volumeOverride?: number) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new Ctx();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const vol = Math.max(0, Math.min(1, volumeOverride ?? alertVolume));
      if (vol <= 0) return;

      const t0 = ctx.currentTime;
      const fundamental = 880; // A5 — bright, attention-grabbing
      const partials: Array<{ ratio: number; gain: number }> = [
        { ratio: 1.000, gain: 0.50 },
        { ratio: 2.756, gain: 0.30 },
        { ratio: 5.404, gain: 0.15 },
        { ratio: 8.933, gain: 0.08 },
      ];

      const master = ctx.createGain();
      // Scale 0.0–1.0 slider → final amplitude. 0.6 peak at full volume
      // is loud-but-safe over typical kitchen tablets / TVs.
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
  }, [alertVolume]);

  // Derived. `alerting` is true only while there's at least one pending
  // order AND the user hasn't silenced the current alarm. Computed each
  // render so the bell can never get "stuck" — when pending drops to 0
  // or `acknowledged` flips true, the very next render kills the loop.
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const alerting = pendingCount > 0 && !acknowledged;

  // Silence the current alarm. Bell stops; the visual "X new" badge
  // stays so the kitchen still sees there's work waiting. Auto-cleared
  // when fetchOrders detects a brand-new pending order arrival.
  const silenceAlert = useCallback(() => {
    setAcknowledged(true);
  }, []);

  // Continuous ring loop while pending orders are unacknowledged.
  // ~1.5s between strikes ≈ GloriaFood cadence.
  useEffect(() => {
    if (!alerting || alertMuted || alertVolume <= 0) return;
    ringBellOnce();
    const id = setInterval(() => ringBellOnce(), 1500);
    return () => clearInterval(id);
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
        // A new pending order ALWAYS re-arms the alarm — even if it was
        // silenced for an earlier order, the kitchen must hear the bell
        // for every new arrival.
        setAcknowledged(false);
        toast(`🔔 ${newPending.length} new order${newPending.length > 1 ? "s" : ""}!`, { icon: "🍕", duration: 6000 });
        newPending.forEach(o => seenIdsRef.current.add(o.id));
      }

      setOrders(fresh);
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

  // pendingCount is declared above next to `alerting`.
  const selectedOrder = orders.find(o => o.id === selectedId) ?? null;
  const printerReady = !!(printerSettings?.printNodeConnected && printerSettings.selectedPrinterId);

  return (
    <div className={`h-screen flex flex-col ${t.base}`}>
      {/* ── Header ── */}
      <header className={`${t.header} px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between flex-shrink-0 gap-2`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ChefHat className="w-6 h-6 text-orange-500 flex-shrink-0" />
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
                  ? "bg-orange-500 text-white animate-pulse hover:bg-orange-600"
                  : "bg-orange-500/20 text-orange-600 hover:bg-orange-500/30"
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
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full animate-ping" aria-hidden="true" />
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

          {/* Test Order — fires a real order through the full pipeline
              (DB row + customer-confirmation email to owner inbox + staff
              notification fan-out + kitchen bell + auto-print on accept).
              Prominent purple pill, visible on every screen size so owners
              can validate the end-to-end flow at any time. */}
          <button
            onClick={createTestOrder}
            disabled={testOrdering}
            className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 sm:py-2 rounded-lg font-bold transition disabled:opacity-60 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-sm"
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
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-0 px-1.5 sm:px-5 py-2.5 sm:py-3 text-[11px] sm:text-sm font-semibold flex items-center justify-center sm:justify-start gap-1 sm:gap-2 border-b-2 transition touch-manipulation cursor-pointer whitespace-nowrap ${activeTab === tab ? t.tabActive : t.tabInactive}`}
              >
                <span className="truncate">{labels[tab]}</span>
                {/* Count badge: full pill on tablet+, mobile shows only a small
                    colored dot so the full tab label has room to render. */}
                {count > 0 && (
                  <>
                    <span className={`hidden sm:inline text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 ${
                      tab === "orders" && pendingCount > 0 ? "bg-orange-500 text-white" :
                      tab === "inprogress" ? "bg-blue-500 text-white" :
                      "bg-gray-200 text-gray-700"
                    }`}>
                      {count}
                    </span>
                    <span className={`sm:hidden inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      tab === "orders" && pendingCount > 0 ? "bg-orange-500" :
                      tab === "inprogress" ? "bg-blue-500" :
                      "bg-gray-400"
                    }`} aria-hidden="true" />
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

      {/* ── Alert Sound Settings Modal ──
           Volume slider + mute toggle + test button. The intent is for the
           default to be MAX volume and for restaurants to actively turn it
           down — anything quieter triggers the red banner above so a
           manager walking past sees the warning. */}
      {showSoundSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className={`${t.modal} rounded-2xl w-full max-w-sm p-6 shadow-2xl`}>
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-orange-500" />
              <h3 className={`text-lg font-bold ${t.text}`}>Alert Sound</h3>
            </div>
            <p className={`text-sm ${t.muted} mb-5`}>
              The bell rings continuously whenever a new order is waiting.
              Keep it loud so you never miss one.
            </p>

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
                  className="flex-1 accent-orange-500 cursor-pointer"
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
                        ? "bg-orange-500 text-white"
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
              className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
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
