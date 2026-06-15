"use client";
import { useEffect, useState } from "react";
import {
  X, Phone, Mail, MapPin, Clock, CheckCircle, XCircle, ChefHat,
  Package, CreditCard, Printer, UtensilsCrossed, RefreshCw, Loader2,
  ReceiptText, User, Plus, Timer, MoreHorizontal, ChevronDown, ChevronUp, ArrowLeft, Navigation,
} from "lucide-react";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { formatDueLabel } from "@/lib/format-time";
import toast from "react-hot-toast";
import type { T, Order } from "./kitchen-types";
import { paymentStatusLabel } from "./kitchen-types";
import { useTranslations } from "next-intl";
import { RejectOrderModal } from "./RejectOrderModal";

interface Props {
  order: Order;
  t: T;
  onClose: () => void;
  onUpdate: (orderId: string, status: string, extra?: Record<string, unknown>) => Promise<void>;
  onPrint: (orderId: string, type: "kitchen" | "customer" | "both") => Promise<void>;
  printerReady: boolean;
  /** Kitchen workflow mode — drives whether the Preparing/Ready/
   *  Complete buttons render after Accept. In "simple" mode (default,
   *  GloriaFood-style) the kitchen only accepts/rejects orders; no
   *  further transitions are surfaced. In "tracking" mode the full
   *  state machine is visible. */
  workflowMode?: "simple" | "tracking";
  /** True when this order was opened from the In Progress tab. In Simple mode
   *  the "Mark Complete" button only shows here — never when the same order is
   *  opened from the All tab. */
  fromInProgress?: boolean;
  /** Restaurant 12h/24h preference for the order timestamps shown here. */
  hoursFormat?: "12h" | "24h";
  /** ISO 4217 currency code for the money shown here (order/item totals). */
  currency?: string;
  /** Reserve-then-order: change the linked table booking's status (seat /
   *  no-show / correct a mistake) from the order detail. Luigi 2026-06-08. */
  onReservationStatusChange?: (reservationId: string, status: string) => void;
}

/**
 * Reservation floor-status switcher — used in the booking detail AND on a
 * pre-order's order detail. A pending booking shows Accept/Reject; once it's
 * past that, every floor state (Confirmed / Seated / No-show / Completed) is a
 * tappable button with the current one highlighted, so staff can move it
 * forward OR fix a mistake (e.g. tap Confirmed to un-seat). Luigi 2026-06-08.
 */
export function ReservationStatusControls({
  status, onChange, t, busy,
}: {
  status: string;
  onChange: (status: string) => void;
  t: T;
  busy?: boolean;
}) {
  const tk = useTranslations("kitchen");
  if (status === "pending") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange("confirmed")} disabled={busy}
          className="flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
          {tk("accept")}
        </button>
        <button type="button" onClick={() => onChange("rejected")} disabled={busy}
          className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
          {tk("reject")}
        </button>
      </div>
    );
  }
  if (status === "rejected" || status === "cancelled") return null;
  const STATES: Array<{ key: string; label: string; active: string }> = [
    { key: "confirmed", label: tk("confirmed"), active: "bg-blue-500 text-white" },
    { key: "seated", label: tk("seated"), active: "bg-emerald-500 text-white" },
    { key: "no_show", label: tk("noShow"), active: "bg-red-500 text-white" },
    { key: "completed", label: tk("completed"), active: "bg-gray-600 text-white" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {STATES.map((s) => {
        const isActive = status === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => { if (!isActive) onChange(s.key); }}
            disabled={busy}
            className={`py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
              isActive ? s.active : `border ${t.border} ${t.btn}`
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "New Order",
  accepted: "Accepted",
  preparing: "In Progress",
  ready: "Ready",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function fmtTime(d: string | Date | null | undefined, hoursFormat: "12h" | "24h" = "12h") {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: hoursFormat === "24h" ? "h23" : "h12" });
}

/** Time only (no date) — used for the ASAP "received at" line. */
function fmtTimeOnly(d: string | Date | null | undefined, hoursFormat: "12h" | "24h" = "12h") {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hourCycle: hoursFormat === "24h" ? "h23" : "h12" });
}

/** Full weekday + date + time — used for the scheduled "order for later" line. */
function fmtDateTime(d: string | Date | null | undefined, hoursFormat: "12h" | "24h" = "12h") {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: hoursFormat === "24h" ? "h23" : "h12" });
}

export function OrderDetail({ order, t, onClose, onUpdate, onPrint, printerReady, workflowMode = "simple", fromInProgress = false, hoursFormat = "12h", currency = "usd", onReservationStatusChange }: Props) {
  const formatCurrency = (n: number) => fmtCurrency(n, currency);
  const isSimpleMode = workflowMode === "simple";
  const tk = useTranslations("kitchen");
  const tc = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tReceipt = useTranslations("receipt.orderTypes");
  // Reuse the already-translated receipt labels (all 38 locales) for the
  // relabeled reprint buttons — Kitchen Receipt / Customer Receipt / Both.
  const tReceipts = useTranslations("admin.receipts");
  const tFees = useTranslations("admin.serviceFees");
  const [showReject, setShowReject] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // "Manage order" actions (Cancel / Refund) — always reachable on every order
  // behind one toggle, no matter the order status or payment method. Luigi
  // 2026-06-08: Cancel was disappearing on finished orders and Refund only
  // showed on card orders, so staff couldn't find them.
  const [showActions, setShowActions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<string | null>(null);
  // ── Delay / Extend Prep Time modal state ──────────────────────────
  // Hits POST /api/orders/[id]/delay which:
  //   1. Bumps estimatedReady by N minutes
  //   2. Appends an audit line to Order.notes
  //   3. Emails the customer the new ETA
  // We don't optimistically mutate the local Order here — instead we
  // let the parent's poll (every 4s) refresh state. Avoids the
  // "two-sources-of-truth" trap when the customer is also watching
  // the same status page.
  const [showDelay, setShowDelay] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState<number>(10);
  const [delayReason, setDelayReason] = useState("");
  const [delaying, setDelaying] = useState(false);
  // ── Refund (Refund Offer) state ──────────────────────────────────────
  // Card (Stripe) orders that are captured ("paid") can be partially or
  // fully refunded from here. Hits POST /api/orders/[id]/refund which runs
  // on the restaurant's own Stripe key. Parent poll refreshes the badge.
  const [showRefund, setShowRefund] = useState(false);
  const [refundMode, setRefundMode] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refunding, setRefunding] = useState(false);
  const alreadyRefunded = order.refundedAmount ?? 0;
  const refundRemaining = Math.max(0, order.total - alreadyRefunded);
  const canRefund =
    order.paymentMethod === "card" &&
    (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") &&
    refundRemaining > 0.005;
  // When refund isn't possible, say WHY (so staff aren't left wondering why the
  // button is greyed out). Stripe can only refund a captured card payment.
  const refundDisabledReason =
    order.paymentMethod !== "card" ? tk("refundCardOnly")
    : refundRemaining <= 0.005 ? tk("refundAlreadyFull")
    : tk("refundNotCaptured");

  // ── Live countdown to estimatedReady ──────────────────────────────
  // Re-render once per second while the order is `accepted` so the
  // staff can see how long they have left. We DO NOT auto-complete on
  // the client — the cron handles that server-side. The countdown is
  // purely informational; "Ready" still appears as soon as the server
  // poll picks up the status flip.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (order.status !== "accepted") return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [order.status]);
  // Due time: prefer the customer's scheduled slot (scheduledFor) over the
  // kitchen's estimatedReady, so a Thursday pickup counts down to THURSDAY, not
  // to a now+prep estimate. Matches the kitchen list-row logic. Luigi 2026-06-05.
  const dueRaw = (order as any).scheduledFor ?? order.estimatedReady;
  const dueMs = dueRaw ? new Date(dueRaw).getTime() : null;
  // Unambiguous label, capped at 24h → weekday name ("Thursday"); ≤ 24h shows
  // "2h 05m" / "14:31"; past due → "00:00". (formatDueLabel.)
  const countdownInfo = dueMs == null ? null : formatDueLabel(dueMs, nowTick);

  const submitDelay = async () => {
    const minutes = Math.max(1, Math.min(240, Math.round(delayMinutes || 0)));
    if (!minutes) return;
    setDelaying(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes, reason: delayReason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delay failed");
      toast.success(`Delayed by ${minutes} min — customer notified`);
      setShowDelay(false);
      setDelayMinutes(10);
      setDelayReason("");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't apply delay");
    } finally {
      setDelaying(false);
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const submitRefund = async () => {
    const isPartial = refundMode === "partial";
    const amt = isPartial ? parseFloat(refundAmount) : refundRemaining;
    if (isPartial && (!Number.isFinite(amt) || amt <= 0)) {
      toast.error(tk("refundInvalidAmount"));
      return;
    }
    if (amt > refundRemaining + 0.005) {
      toast.error(tk("refundExceeds"));
      return;
    }
    setRefunding(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPartial ? { amount: amt } : { full: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || tk("refundFailed"));
        return;
      }
      toast.success(tk("refundSuccess"));
      setShowRefund(false);
      setRefundAmount("");
      setRefundMode("full");
    } catch {
      toast.error(tk("refundFailed"));
    } finally {
      setRefunding(false);
    }
  };

  const print = async (type: "kitchen" | "customer" | "both") => {
    if (!printerReady) {
      toast.error("No printer configured. Open Printer Setup first.");
      return;
    }
    setPrinting(type);
    try {
      await onPrint(order.id, type);
    } catch (err: any) {
      toast.error(err?.message ?? "Print failed");
    } finally {
      setPrinting(null);
    }
  };

  const StatusBadge = () => {
    const cls: Record<string, string> = {
      pending: "bg-yellow-500 text-white",
      accepted: "bg-blue-500 text-white",
      preparing: "bg-emerald-500 text-white",
      ready: "bg-green-500 text-white",
      completed: "bg-gray-500 text-white",
      rejected: "bg-red-500 text-white",
      cancelled: "bg-red-500 text-white",
    };
    // "Missed" vs "Rejected": an order the TIMER auto-rejected (the kitchen
    // never acted) reads "Missed" — distinct from one the restaurant actively
    // Rejected. Both the client auto-reject and the server cron stamp
    // rejectionReason with the "Auto-rejected:" prefix, so that's the marker.
    // Shown in ORANGE (not red) so a timed-out "Missed" is visually distinct
    // from a manual "Rejected". Reseller report cmq3k0m4d (FABRIZIO). Luigi
    // 2026-06-09.
    const isMissed =
      order.status === "rejected" &&
      (order.rejectionReason?.startsWith("Auto-rejected") ?? false);
    const label = isMissed ? tk("missed") : (STATUS_LABEL[order.status] ?? order.status);
    return (
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isMissed ? "bg-orange-500 text-white" : (cls[order.status] ?? "bg-gray-500 text-white")}`}>
        {label}
      </span>
    );
  };

  return (
    <div className={`flex flex-col h-full ${t.detail}`}>
      {/* Header — paddingTop respects the device notch / status bar so the
          back arrow + order number never clip under it (Fabrizio safe-area
          report, Luigi 2026-06-15). */}
      <div
        className={`flex items-center gap-3 px-5 py-4 border-b ${t.border} flex-shrink-0`}
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        {/* Back to the order list (full-screen detail). Always visible now that
            the detail opens over the whole screen. Luigi 2026-06-08. */}
        <button onClick={onClose} className={`p-1.5 rounded-lg ${t.btn} flex-shrink-0`} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className={`font-bold text-lg ${t.text}`}>{tk("orderNumber")}{order.orderNumber}</div>
          <div className={`text-xs ${t.muted}`}>{fmtTime(order.createdAt, hoursFormat)}</div>
        </div>
        <StatusBadge />
        {order.viaMarketplace && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300">
            MARKETPLACE
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Reserve-then-order: this order arrived WITH a table booking. Flag
              it up top so the kitchen treats the food + the table as one unit.
              Luigi 2026-06-08. */}
          {order.reservation && (
            <div className="rounded-xl px-4 py-3 text-white" style={{ backgroundColor: "#7c3aed" }}>
              <div className="font-bold flex items-center gap-2 text-sm">
                🪑 {tk("tableReservation")} · {tk("preOrder")}
              </div>
              <div className="text-sm opacity-95 mt-0.5">
                {tk("partyOf", { n: order.reservation.partySize })}
                {" · "}
                {order.reservation.date} {fmtTimeOnly(`${order.reservation.date}T${order.reservation.time}`, hoursFormat)}
                {" · #"}{order.reservation.confirmationCode}
              </div>
            </div>
          )}

          {/* Seat / no-show the table from the pre-order's order detail — the
              booking has no separate tile, so the floor controls live here.
              Tap any state to move it forward OR fix a mistake. Luigi 2026-06-08.
              HIDDEN while the order is still pending: a pre-order is ONE unit, so
              it has ONE Accept/Reject — the ORDER's, up top — and accepting it
              confirms the table too (the order PATCH syncs the booking). Showing
              the booking's own Accept/Reject here as well gave the tile TWO
              accept/reject pairs. Once accepted (booking no longer pending) this
              becomes the Seated / No-show / Completed switcher. Luigi 2026-06-09. */}
          {order.reservation && onReservationStatusChange && order.reservation.status !== "pending" && (
            <div className="space-y-2">
              <div className={`text-xs font-bold uppercase tracking-wider ${t.muted}`}>{tk("tableReservation")}</div>
              <ReservationStatusControls
                status={order.reservation.status}
                onChange={(s) => onReservationStatusChange(order.reservation!.id, s)}
                t={t}
              />
            </div>
          )}

          {/* Customer Info */}
          <Section title={tk("customer")} t={t}>
            <div className="space-y-2">
              <Row icon={<User className="w-4 h-4" />} t={t}>{order.customerName}</Row>
              {order.customerPhone && <Row icon={<Phone className="w-4 h-4" />} t={t}>{order.customerPhone}</Row>}
              {order.customerEmail && <Row icon={<Mail className="w-4 h-4" />} t={t}>{order.customerEmail}</Row>}
            </div>
          </Section>

          {/* Delivery/Pickup */}
          <Section title={order.type === "delivery" ? tc("deliveryAddress") : tk("orderType")} t={t}>
            <div className="space-y-1">
              <div className={`flex items-center gap-2 text-sm font-semibold ${t.text}`}>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${order.type === "delivery" ? "bg-blue-500 text-white" : "bg-emerald-500 text-white"}`}>
                  {(() => { try { return tReceipt(order.type); } catch { return order.type.toUpperCase(); } })()}
                </span>
              </div>
              {order.deliveryAddress && (
                <Row icon={<MapPin className="w-4 h-4" />} t={t}>
                  {order.deliveryAddress}{order.deliveryCity ? `, ${order.deliveryCity}` : ""}
                </Row>
              )}
              {/* Drive distance + live-traffic ETA + directions (reseller report
                  cmq3kv70d). Fetched once when the detail opens. */}
              {order.type === "delivery" && order.deliveryAddress && (
                <DeliveryEta orderId={order.id} t={t} />
              )}
              {/* Out-of-zone heads-up — shown here next to the address (only
                  visible once an order is opened), not on the list tile.
                  Luigi 2026-06-08. */}
              {(order as any).outsideDeliveryZone && (
                <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300">
                  ⚠ {tk("outsideZoneNote")}
                </div>
              )}
            </div>
          </Section>

          {/* ASAP vs ORDER FOR LATER — prominent so staff instantly know
              whether to make it now or hold it for a scheduled slot. Two lines:
              the label, then the date/time. Luigi 2026-06-05. */}
          {(() => {
            const schedMs = (order as any).scheduledFor ? new Date((order as any).scheduledFor).getTime() : NaN;
            const isLater = Number.isFinite(schedMs) && schedMs > Date.now();
            // For an ASAP order the big number should be the READY time, not
            // when the order came in — that's what the kitchen acts on once a
            // prep time is punched in (order at 7:00 + 20 min → "Ready 7:20").
            // Falls back to the received time only before any ready estimate
            // exists. Luigi 2026-06-11.
            const erMs = order.estimatedReady ? new Date(order.estimatedReady).getTime() : NaN;
            const hasReady = !isLater && Number.isFinite(erMs);
            return (
              <div className={`rounded-xl px-4 py-3 ${isLater ? "bg-sky-500/10 border border-sky-500/30" : "bg-emerald-500/10 border border-emerald-500/30"}`}>
                <div className={`text-xs font-extrabold uppercase tracking-wide ${isLater ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                  {isLater ? tk("orderForLater") : tk("asap")}
                </div>
                <div className={`text-lg font-bold mt-0.5 ${t.text}`}>
                  {isLater
                    ? fmtDateTime((order as any).scheduledFor, hoursFormat)
                    : hasReady
                      ? `${tk("ready")} ${fmtTimeOnly(order.estimatedReady, hoursFormat)}`
                      : fmtTimeOnly(order.createdAt, hoursFormat)}
                </div>
              </div>
            );
          })()}

          {/* Timing */}
          {(order.acceptedAt || order.estimatedReady || order.completedAt) && (
            <Section title={tk("estimatedTime")} t={t}>
              <div className="space-y-1.5">
                {order.acceptedAt && <Row icon={<CheckCircle className="w-4 h-4 text-green-500" />} t={t}>{tk("accepted")}: {fmtTime(order.acceptedAt, hoursFormat)}</Row>}
                {order.estimatedReady && <Row icon={<Clock className="w-4 h-4 text-blue-500" />} t={t}>{tk("ready")}: {fmtTime(order.estimatedReady, hoursFormat)}</Row>}
                {order.preparationTime && <Row icon={<Clock className="w-4 h-4" />} t={t}>{tk("preparationTime")}: {order.preparationTime} {tk("minAway", { minutes: "" })}</Row>}
                {order.completedAt && <Row icon={<Package className="w-4 h-4 text-gray-500" />} t={t}>{tk("completed")}: {fmtTime(order.completedAt, hoursFormat)}</Row>}
              </div>

              {/* Live countdown — ticks once per second once the order is
                  accepted, until either we hit estimatedReady or the
                  server flips status to completed. Clamps at 0:00 with
                  normal styling (Luigi 2026-06-02): no red, no
                  pulsation, no "overdue by" label. Hidden for terminal
                  states. */}
              {order.status === "accepted" && countdownInfo && (
                <div className="mt-3 rounded-lg px-3 py-2.5 border flex items-center justify-between gap-2 bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4" />
                    {/* "Ready Thursday" for day-out slots; "Ready in 14:31" for
                        same-day countdowns. */}
                    <span className="text-sm font-semibold">
                      {countdownInfo.kind === "day" ? tk("ready") : tk("readyIn")}
                    </span>
                  </div>
                  <span className={`font-mono font-bold tabular-nums ${countdownInfo.kind === "day" ? "text-xl" : "text-2xl"}`}>
                    {countdownInfo.text}
                  </span>
                </div>
              )}

              {/* Add Prep Time / Delay button — only relevant while the
                  order is still in-progress. Once it's completed or
                  rejected, delaying makes no sense. Per-restaurant
                  setting could gate this later; for now it's on for all. */}
              {order.status === "accepted" && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowDelay(true)}
                    className={`w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed text-sm font-semibold transition ${t.btn}`}
                  >
                    <Plus className="w-4 h-4" /> Add prep time / delay
                  </button>
                </div>
              )}
            </Section>
          )}

          {/* Notes */}
          {order.notes && (
            <Section title={tCommon("notes")} t={t}>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
                {order.notes}
              </div>
            </Section>
          )}

          {/* Items */}
          <Section title={tk("items")} t={t}>
            <div className="space-y-3">
              {order.items.map((item) => {
                // Promo Type 8 / 13 bundle line item — render parent +
                // indented children. `bundleItems` is a JSON column on
                // OrderItem; Prisma returns it as `unknown`.
                const bundle = Array.isArray((item as any).bundleItems)
                  ? ((item as any).bundleItems as Array<{
                      name: string;
                      variantName?: string | null;
                      modifiers?: Array<{ name: string; priceAdjustment?: number }>;
                      notes?: string | null;
                      specialityFee?: number;
                    }>)
                  : null;
                return (
                  <div key={item.id} className={`border-b ${t.border} pb-3 last:border-0 last:pb-0`}>
                    <div className="flex justify-between">
                      <span className={`font-semibold text-sm ${t.text}`}>{item.quantity}× {item.name}</span>
                      <span className={`text-sm font-medium ${t.text}`}>{formatCurrency(item.subtotal)}</span>
                    </div>
                    {item.variantName && <div className={`text-xs ${t.muted} pl-3`}>{item.variantName}</div>}
                    {bundle && bundle.length > 0 && (
                      <div className={`mt-1 pl-3 border-l-2 ${t.border} space-y-0.5`}>
                        {bundle.map((child, i) => (
                          <div key={i} className={`text-xs ${t.muted}`}>
                            • 1× {child.name}
                            {child.variantName ? ` (${child.variantName})` : ""}
                            {child.specialityFee && child.specialityFee > 0
                              ? ` (+${formatCurrency(child.specialityFee)})`
                              : ""}
                            {Array.isArray(child.modifiers) && child.modifiers.length > 0 && (
                              <div className={`pl-3 ${t.muted}`}>
                                {child.modifiers.map((m, mi) => (
                                  <div key={mi}>+ {m.name}</div>
                                ))}
                              </div>
                            )}
                            {child.notes && <div className="pl-3 italic text-yellow-600">{child.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.modifiers.map((m, i) => (
                      <div key={i} className={`text-xs ${t.muted} pl-3`}>
                        + {m.name}{m.priceAdjustment !== 0 && ` (${m.priceAdjustment > 0 ? "+" : ""}${formatCurrency(m.priceAdjustment)})`}
                      </div>
                    ))}
                    {item.notes && <div className="text-xs text-yellow-600 pl-3 italic">{item.notes}</div>}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Promo highlight box — kitchen needs to see EXACTLY which
              promos fired on this order so they understand the discount
              math + can flag any abuse. Rendered as a labelled emerald
              block above the totals. Parses Order.appliedPromos JSON
              snapshot (Phase 2 marketing suite). Free-delivery entries
              carry the saved delivery fee as their `discount`. */}
          {(() => {
            const raw = (order as any).appliedPromos as string | null | undefined;
            if (!raw) return null;
            try {
              const promos = JSON.parse(raw) as Array<{
                name: string; type: string; discount: number; couponCode?: string;
              }>;
              if (!Array.isArray(promos) || promos.length === 0) return null;
              return (
                <Section title="🎉 Promos applied" t={t}>
                  <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2 space-y-1">
                    {promos.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium truncate">
                          <span aria-hidden>✓</span>
                          <span className="truncate uppercase">{p.name}</span>
                          {p.couponCode && (
                            <span className="font-mono bg-white border border-emerald-300 text-emerald-700 rounded px-1.5 py-0.5 ml-1">
                              {p.couponCode}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-emerald-800 whitespace-nowrap ml-2">
                          {p.discount > 0 ? `−${formatCurrency(p.discount)}` : "FREE"}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              );
            } catch { return null; }
          })()}

          {/* Totals */}
          <Section title={tCommon("total")} t={t}>
            <div className="space-y-1.5">
              <TotalRow label={tCommon("subtotal")} value={formatCurrency(order.subtotal)} t={t} />
              {(order.couponDiscount ?? 0) > 0 && <TotalRow label={tc("discount")} value={`-${formatCurrency(order.couponDiscount!)}`} t={t} />}
              {(order.promoDiscount ?? 0) > 0 && <TotalRow label={tc("discount")} value={`-${formatCurrency(order.promoDiscount!)}`} t={t} />}
              {/* Delivery line: when free-delivery promo fired (parsed
                  above), the original fee is in the snapshot. Show it
                  inline as "FREE (was $X)" mirroring the customer
                  receipt — kitchen needs to know what was waived. */}
              {(() => {
                const raw = (order as any).appliedPromos as string | null | undefined;
                let savedDeliveryFee = 0;
                if (raw) {
                  try {
                    const promos = JSON.parse(raw) as Array<{ type: string; discount: number }>;
                    const fd = Array.isArray(promos) ? promos.find((p) => p.type === "free_delivery") : null;
                    if (fd && fd.discount > 0) savedDeliveryFee = fd.discount;
                  } catch { /* ignore */ }
                }
                if (savedDeliveryFee > 0) {
                  return (
                    <TotalRow
                      label={tc("delivery")}
                      value={`FREE (was ${formatCurrency(savedDeliveryFee)})`}
                      t={t}
                    />
                  );
                }
                if (order.deliveryFee > 0) {
                  return <TotalRow label={tc("delivery")} value={formatCurrency(order.deliveryFee)} t={t} />;
                }
                return null;
              })()}
              <TotalRow label={tc("tax")} value={formatCurrency(order.taxAmount)} t={t} />
              {(order.tip ?? 0) > 0 && <TotalRow label={tc("tip")} value={formatCurrency(order.tip!)} t={t} />}
              <div className={`flex justify-between font-bold text-sm pt-1.5 border-t ${t.border} ${t.text}`}>
                <span>{tCommon("total").toUpperCase()}</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </Section>

          {/* Payment */}
          <Section title={tc("paymentMethod")} t={t}>
            <div className="space-y-1">
              <Row icon={<CreditCard className="w-4 h-4" />} t={t}>
                {order.paymentMethod === "card" ? tc("payWithCard") : order.paymentMethod === "cash" ? tc("payInCashPickup") : order.paymentMethod}
              </Row>
              <div className="flex items-center gap-2">
                {(() => {
                  const ps = paymentStatusLabel(order.paymentStatus);
                  const toneClass = {
                    green:  "bg-green-500/20 text-green-600",
                    blue:   "bg-blue-500/20 text-blue-600",
                    yellow: "bg-yellow-500/20 text-yellow-700",
                    red:    "bg-red-500/20 text-red-600",
                    gray:   "bg-gray-300/30 text-gray-700",
                  }[ps.tone];
                  return (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${toneClass}`}>
                      {ps.label}
                    </span>
                  );
                })()}
                {order.refundStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    order.refundStatus === "refunded" ? "bg-blue-500/20 text-blue-600" :
                    order.refundStatus === "partial" ? "bg-blue-500/20 text-blue-600" :
                    order.refundStatus === "pending" ? "bg-yellow-500/20 text-yellow-700" :
                    "bg-red-500/20 text-red-600"
                  }`}>
                    REFUND: {order.refundStatus.toUpperCase()}
                  </span>
                )}
              </div>
              {alreadyRefunded > 0 && (
                <div className={`text-xs ${t.muted}`}>
                  {tk("refundedSoFar", { amount: formatCurrency(alreadyRefunded) })}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Action buttons — paddingBottom clears the Android gesture/nav bar so
          Accept / Reject are never hidden behind it (Fabrizio safe-area report,
          Luigi 2026-06-15). */}
      <div
        className={`border-t ${t.border} p-4 flex-shrink-0 space-y-3`}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* Status actions */}
        <div className="grid grid-cols-2 gap-2">
          {order.status === "pending" && (
            <>
              <button
                onClick={() => act(() => onUpdate(order.id, "accepted", { preparationTime: 20 }))}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" /> {tk("accept")}
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> {tk("reject")}
              </button>
            </>
          )}
          {/* Transition buttons after Accept — only render in "tracking"
              workflow mode. In "simple" mode (default, GloriaFood-style)
              the kitchen just accepts and is done; the order stays in
              "In Progress" with no further state changes until end-of-
              day cleanup. Restaurants choose their mode in admin
              Services & Hours settings. */}
          {!isSimpleMode && order.status === "accepted" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "preparing"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <ChefHat className="w-4 h-4" /> {tk("preparing")}
            </button>
          )}
          {!isSimpleMode && order.status === "preparing" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "ready"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <Package className="w-4 h-4" /> {tk("markReady")}
            </button>
          )}
          {!isSimpleMode && order.status === "ready" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "completed"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> {tk("markComplete")}
            </button>
          )}
          {/* Simple mode: a single "Mark Complete" that moves THIS order out of
              In Progress and into Complete immediately (sets manuallyClearedAt),
              instead of waiting for the end-of-day roll to move them all.
              Shown only for an order opened FROM the In Progress tab — never
              from the All tab — and not once it's already been cleared.
              Available ANY time after accept — the due-time gate was removed
              (reseller report cmqa73m5b, Fabrizio 2026-06-12): on a busy night
              food is often ready before the countdown, and GloriaFood lets
              staff check those off immediately. Completion stays MANUAL only —
              passing the ready time must still never auto-complete an order
              (Luigi 2026-06-07/08).
              "completed" is included so an order the old auto-sweep already
              flipped (and which is now stranded in In Progress) can still be
              cleared into Complete by hand. */}
          {isSimpleMode && fromInProgress
            && ["accepted", "preparing", "ready", "completed"].includes(order.status)
            && !(order as any).manuallyClearedAt && (
            <button
              onClick={() => act(() => onUpdate(order.id, "completed"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> {tk("markComplete")}
            </button>
          )}
        </div>

        {/* Reprint buttons moved INTO "Manage order" below (Luigi 2026-06-15) —
            auto-print is on when a printer's configured, so the tile stays clean
            and reprint is one tap away under Manage order when actually needed. */}

        {/* Manage order — reprint receipts + Cancel + Refund. HIDDEN while the order is still
            PENDING (not yet accepted): a pending order can only be Rejected,
            never Cancelled — Reject (above) is the single exit and handles the
            money. Once it's accepted this appears (Cancel + Refund), and it
            stays reachable on finished orders too — after a Reject the status
            becomes "rejected" (no longer pending) so Refund is available again.
            Luigi 2026-06-08. */}
        {order.status !== "pending" && (
        <div className={`border-t ${t.border} pt-3`}>
          <button
            onClick={() => setShowActions((v) => !v)}
            className={`w-full flex items-center justify-center gap-1.5 ${t.btn} font-semibold py-2 rounded-xl text-sm transition`}
          >
            <MoreHorizontal className="w-4 h-4" /> {tk("manageOrder")}
            {showActions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showActions && (
            <div className="mt-2 space-y-2">
              {/* Reprint — Kitchen / Customer / Both receipts, each with a
                  printer icon. Auto-print already fires on accept; this is the
                  manual re-run. Luigi 2026-06-15. */}
              <div className="grid grid-cols-3 gap-1.5">
                <PrintBtn label={tReceipts("kitchenReceipt")} icon={<Printer className="w-3.5 h-3.5" />} onClick={() => print("kitchen")} loading={printing === "kitchen"} t={t} />
                <PrintBtn label={tReceipts("customerReceipt")} icon={<Printer className="w-3.5 h-3.5" />} onClick={() => print("customer")} loading={printing === "customer"} t={t} />
                <PrintBtn label={tFees("both")} icon={<Printer className="w-3.5 h-3.5" />} onClick={() => print("both")} loading={printing === "both"} t={t} />
              </div>
              {/* Refund (full/partial) */}
              <button
                onClick={() => { if (canRefund) { setRefundMode("full"); setRefundAmount(""); setShowRefund(true); } }}
                disabled={!canRefund}
                title={!canRefund ? refundDisabledReason : undefined}
                className={`w-full flex items-center justify-center gap-1.5 border ${t.border} ${t.btn} hover:text-blue-600 font-semibold py-2 rounded-xl text-sm transition disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <RefreshCw className="w-4 h-4" /> {tk("refund")}
                {alreadyRefunded > 0.005 && (
                  <span className="text-[11px] font-normal opacity-70">
                    ({formatCurrency(alreadyRefunded)} {tk("refunded")})
                  </span>
                )}
              </button>
              {!canRefund && (
                <p className={`text-[11px] text-center ${t.muted}`}>{refundDisabledReason}</p>
              )}
              {/* Cancel — always available, even on finished orders */}
              <button
                onClick={() => setShowCancel(true)}
                className="w-full flex items-center justify-center gap-1.5 border border-red-500/40 text-red-500 hover:bg-red-500/10 font-semibold py-2 rounded-xl text-sm transition"
              >
                <XCircle className="w-4 h-4" /> {tCommon("cancel")}
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Reject modal — shared component used from both here and the
          Accept Order prep prompt in KitchenDisplay. */}
      <RejectOrderModal
        open={showReject}
        order={order}
        t={t}
        onClose={() => setShowReject(false)}
        onConfirm={async (reason) => {
          await onUpdate(order.id, "rejected", { rejectionReason: reason });
        }}
      />


      {/* Cancel modal */}
      {showCancel && (
        <Modal title={tCommon("cancel")} t={t} onClose={() => setShowCancel(false)}>
          <label className={`text-sm ${t.muted} block mb-2`}>{tk("rejectionReason")}</label>
          <textarea
            className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-red-500 mb-4`}
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={() => act(async () => { await onUpdate(order.id, "cancelled", { rejectionReason: cancelReason || "Cancelled by restaurant" }); setShowCancel(false); })}
              disabled={busy}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              {busy ? tCommon("loading") : tCommon("cancel")}
            </button>
            <button onClick={() => setShowCancel(false)} className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}>
              {tCommon("back")}
            </button>
          </div>
        </Modal>
      )}

      {/* Delay / Extend Prep Time modal. Quick-pick chips for the common
          deltas (+5/+10/+15/+20/+30) plus a free-numeric field. Submit
          hits the dedicated /delay endpoint which bumps estimatedReady
          and fires a customer email with the new ETA. */}
      {showDelay && (
        <Modal title="Add prep time" t={t} onClose={() => setShowDelay(false)}>
          <p className={`text-sm ${t.muted} mb-3`}>
            Bump this order&apos;s estimated ready time. The customer gets an
            email with the new ETA.
          </p>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {[5, 10, 15, 20, 30].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDelayMinutes(m)}
                className={`py-2 rounded-lg text-sm font-bold transition ${
                  delayMinutes === m
                    ? "bg-blue-500 text-white"
                    : t.btn
                }`}
              >
                +{m}m
              </button>
            ))}
          </div>
          <label className={`text-xs ${t.muted} block mb-1`}>Custom (1–240 min)</label>
          <input
            type="number"
            min={1}
            max={240}
            step={1}
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(parseInt(e.target.value, 10) || 0)}
            className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3`}
          />
          <label className={`text-xs ${t.muted} block mb-1`}>Reason (optional — shown to customer)</label>
          <textarea
            rows={2}
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            placeholder="Kitchen running busy, out of an ingredient, etc."
            className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4`}
            maxLength={200}
          />
          <div className="flex gap-3">
            <button
              onClick={submitDelay}
              disabled={delaying || !delayMinutes}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              {delaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {delaying ? "Saving…" : `Delay by ${delayMinutes || 0} min`}
            </button>
            <button onClick={() => setShowDelay(false)} className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}>
              {tCommon("back")}
            </button>
          </div>
        </Modal>
      )}

      {/* Refund modal — full or partial refund of a captured card order.
          Runs on the restaurant's own Stripe key (key-only model). */}
      {showRefund && (
        <Modal title={tk("refund")} t={t} onClose={() => setShowRefund(false)}>
          <div className={`text-sm ${t.muted} mb-3 space-y-0.5`}>
            <div className="flex justify-between"><span>{tCommon("total")}</span><span className={t.text}>{formatCurrency(order.total)}</span></div>
            {alreadyRefunded > 0 && (
              <div className="flex justify-between"><span>{tk("refundedSoFarShort")}</span><span className={t.text}>−{formatCurrency(alreadyRefunded)}</span></div>
            )}
            <div className="flex justify-between font-semibold"><span>{tk("refundRemaining")}</span><span className={t.text}>{formatCurrency(refundRemaining)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setRefundMode("full")}
              className={`py-2 rounded-lg text-sm font-bold transition ${refundMode === "full" ? "bg-blue-500 text-white" : t.btn}`}
            >
              {tk("refundFull")}
            </button>
            <button
              type="button"
              onClick={() => setRefundMode("partial")}
              className={`py-2 rounded-lg text-sm font-bold transition ${refundMode === "partial" ? "bg-blue-500 text-white" : t.btn}`}
            >
              {tk("refundPartial")}
            </button>
          </div>
          {refundMode === "partial" && (
            <div className="mb-4">
              <label className={`text-xs ${t.muted} block mb-1`}>{tk("refundAmountLabel")}</label>
              <input
                type="number"
                min={0.01}
                max={refundRemaining}
                step={0.01}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={refundRemaining.toFixed(2)}
                className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={submitRefund}
              disabled={refunding}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              {refunding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {refunding ? tCommon("loading") : tk("refundConfirm")}
            </button>
            <button onClick={() => setShowRefund(false)} className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}>
              {tCommon("back")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, children, t }: { title: string; children: React.ReactNode; t: T }) {
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wider ${t.muted} mb-2`}>{title}</div>
      {children}
    </div>
  );
}

function Row({ icon, children, t }: { icon?: React.ReactNode; children: React.ReactNode; t: T }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${t.text}`}>
      {icon && <span className={t.muted}>{icon}</span>}
      {children}
    </div>
  );
}

/**
 * Drive distance + live-traffic ETA + "Open in Maps" for a delivery order
 * (reseller report cmq3kv70d). Fetched once per detail open from
 * /api/kitchen/orders/[id]/eta. The maps button always shows (works without a
 * Distance Matrix key); distance + ETA chips show only when the API returned
 * them. Never blocks the kitchen — a failed/absent estimate just hides chips.
 */
function DeliveryEta({ orderId, t }: { orderId: string; t: T }) {
  const tk = useTranslations("kitchen");
  const [data, setData] = useState<
    | { mapsUrl: string; estimate: { ok: boolean; distanceText?: string; durationInTrafficText?: string } }
    | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/kitchen/orders/${orderId}/eta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { /* network hiccup — silent */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderId]);

  if (loading) {
    return (
      <div className={`mt-1 flex items-center gap-1.5 text-xs ${t.muted}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tk("calculatingEta")}
      </div>
    );
  }
  if (!data) return null;
  const est = data.estimate;

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {est?.ok && est.distanceText && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300">
          <MapPin className="w-3.5 h-3.5" /> {est.distanceText}
        </span>
      )}
      {est?.ok && est.durationInTrafficText && (
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300"
          title={tk("etaTrafficNote")}
        >
          <Clock className="w-3.5 h-3.5" /> {est.durationInTrafficText}
        </span>
      )}
      <a
        href={data.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition"
      >
        <Navigation className="w-3.5 h-3.5" /> {tk("openInMaps")}
      </a>
    </div>
  );
}

function TotalRow({ label, value, t }: { label: string; value: string; t: T }) {
  return (
    <div className={`flex justify-between text-sm ${t.muted}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function PrintBtn({ label, icon, onClick, loading, t }: { label: string; icon: React.ReactNode; onClick: () => void; loading: boolean; t: T }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-xs ${t.btn} ${t.muted} hover:text-emerald-500 transition disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Modal({ title, children, t, onClose }: { title: string; children: React.ReactNode; t: T; onClose: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-end md:items-center justify-center z-10 p-4">
      <div className={`${t.modal} rounded-2xl w-full max-w-sm p-5`}>
        <div className={`flex items-center justify-between mb-4`}>
          <h4 className={`font-bold text-base ${t.text}`}>{title}</h4>
          <button onClick={onClose} className={`${t.btn} p-1.5 rounded-lg`}><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
