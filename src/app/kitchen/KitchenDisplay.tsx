"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatTime, formatDueLabel } from "@/lib/format-time";
import {
  Bell, Printer, RefreshCw, LogOut, ChefHat, Sun, Moon,
  Package, Clock, Truck, ShoppingBag, CheckCircle, Trash2,
  FlaskConical, Loader2, Volume2, VolumeX, AlertTriangle, XCircle,
  CalendarDays, X, ChevronRight, ArrowLeft, CalendarClock, UtensilsCrossed,
  MoreVertical, Settings, ClipboardList,
} from "lucide-react";
import toast from "react-hot-toast";
import { signOut } from "next-auth/react";
import { PrinterSetupModal } from "./PrinterSetupModal";
import { RestaurantStatusModal } from "./RestaurantStatusModal";
import { EndOfDayModal } from "./EndOfDayModal";
import { DispatchModeToggle } from "./DispatchModeToggle";
import { OrderDetail, ReservationStatusControls } from "./OrderDetail";
import { RejectOrderModal } from "./RejectOrderModal";
import { KitchenFirstRunTour } from "./KitchenFirstRunTour";
import {
  isNativePrinterAvailable,
  nativePrint,
  nativePrinterErrorCopy,
} from "@/lib/native-printer";
import { registerKitchenPush } from "@/lib/native-push";
import { NativePrinterSetup, getDirectPrinterConfig } from "./NativePrinterSetup";
import { THEMES, type Order, type PrinterSettings, type ThemeMode, type T } from "./kitchen-types";
import { useTranslations, useLocale } from "next-intl";
import { StaffLanguageSwitcher } from "@/components/StaffLanguageSwitcher";

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
function ReservationStatusBadge({ status, t, rejectionReason }: { status: string; t: T; rejectionReason?: string | null }) {
  const tk = useTranslations("kitchen");
  const map: Record<string, { bg: string; key: string }> = {
    pending:   { bg: "bg-yellow-100 text-yellow-800",    key: "pending" },
    confirmed: { bg: "bg-blue-100 text-blue-800",        key: "confirmed" },
    seated:    { bg: "bg-emerald-100 text-emerald-800",  key: "seated" },
    no_show:   { bg: "bg-red-100 text-red-700",          key: "noShow" },
    completed: { bg: t.badgeCompleted ?? "bg-gray-100 text-gray-700", key: "done" },
    cancelled: { bg: "bg-gray-100 text-gray-500",        key: "cancelled" },
  };
  // A booking auto-declined for sitting un-accepted past its window is MISSED,
  // not a manual reject — the auto paths stamp rejectionReason "Auto-rejected:".
  // Relabel it "MISSED" in the same orange tone as a missed ORDER's badge so the
  // tile never looks like a staff REJECT. A genuine staff decline (no reason)
  // stays the plain "REJECTED". Same rule as the order StatusBadge. Luigi 2026-06-16.
  const isMissed = status === "rejected" && (rejectionReason?.startsWith("Auto-rejected") ?? false);
  const m = isMissed
    ? { bg: t.badgeMissed, key: "missed" }
    : (map[status] ?? { bg: "bg-gray-100 text-gray-700", key: "" });
  const label = m.key ? tk(m.key).toUpperCase() : status.toUpperCase();
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${m.bg}`}>{label}</span>;
}

function ReservationCard({
  r, t, onOpen, selected, compact, dayChip, hoursFormat = "24h", now,
}: {
  r: KitchenReservation;
  t: T;
  /** Tapping the tile opens the detail — the linked ORDER's detail for a
   *  pre-order booking, else the reservation detail. */
  onOpen: (r: KitchenReservation) => void;
  /** Highlights the tile while its detail panel is open. */
  selected?: boolean;
  compact?: boolean;
  /** Restaurant 12h/24h preference for the reservation time. */
  hoursFormat?: "12h" | "24h";
  /** When present (LATER group in the In Progress tab), a small
   *  day-of-week pill (TUE/FRI/…) is rendered next to the customer
   *  name so the kitchen can scan upcoming-day items at a glance,
   *  matching the GloriaFood KDS pattern. */
  dayChip?: string;
  /** Live clock (ms). When given AND no explicit dayChip is supplied, the card
   *  shows its own countdown-to-reservation chip — same formatDueLabel system
   *  orders use (weekday name when >24h out, HH:MM / MM:SS countdown when
   *  ≤24h). Luigi 2026-06-08. */
  now?: number;
}) {
  const tk = useTranslations("kitchen");
  const locale = useLocale();
  // Countdown to the booking time, shown only for still-active bookings
  // (pending / confirmed / seated) and only when the caller didn't already
  // pass a dayChip (the In Progress tab supplies its own). Past/terminal
  // bookings show no countdown. Parsed in the tablet's local time, which at
  // the restaurant matches the venue timezone — same basis as the order
  // countdowns. Luigi 2026-06-08.
  const isActiveBooking = r.status === "pending" || r.status === "confirmed" || r.status === "seated";
  const autoCountdown = (() => {
    if (dayChip || !now || !isActiveBooking) return null;
    const dueTs = new Date(`${r.date}T${r.time}:00`).getTime();
    if (!Number.isFinite(dueTs)) return null;
    const label = formatDueLabel(dueTs, now, locale);
    // Past its booking time → no chip at all (don't show a stale "00:00" on a
    // seated / no-show / expired booking). Luigi 2026-06-15.
    if (label.kind === "due") return null;
    return label.text;
  })();
  // Parked = booking placed while CLOSED; its kitchen alert is deferred to the
  // next opening. The tile still shows (highlighted) but stays calm — no flash,
  // and it's excluded from the ring counts — until alertAt passes, exactly like
  // a closed-placed order. Luigi 2026-06-14.
  const parked = !!(r.alertAt && now && new Date(r.alertAt).getTime() > now);
  const opensLabel = parked && now
    ? (() => { const l = formatDueLabel(new Date(r.alertAt!).getTime(), now, locale); return l.kind === "day" ? l.text.toUpperCase() : `OPENS IN ${l.text.toUpperCase()}`; })()
    : null;
  // Pending booking with no deposit owed → show the SAME accept countdown an
  // order uses (Luigi 2026-06-15 chose full order parity — it auto-declines when
  // it elapses). Confirmed/seated keep the table-time countdown; a deposit-owed
  // booking waits on the customer, so it gets no accept clock.
  const showAcceptCountdown = r.status === "pending" && r.depositAmount === 0;
  // A reservation tile carries NO action buttons — tapping it opens the
  // reservation detail panel where Accept / Reject (pending) and Seated /
  // No-show (confirmed) live, exactly like an order tile opens OrderDetail.
  // Luigi 2026-06-08.
  return (
    <button
      type="button"
      onClick={() => onOpen(r)}
      className={`w-full text-left ${r.status === "pending" ? t.rowNew : t.row} rounded-xl p-${compact ? "3" : "4"} border transition min-h-[80px] flex items-center ${
        selected ? "border-blue-500 ring-1 ring-blue-500" : `${t.border} hover:border-blue-400`
      } ${r.status === "pending" && !parked ? "kitchen-flash-new" : ""}`}
    >
      <div className="flex items-start gap-3 w-full">
        {/* Walk-up table reservation icon — indigo calendar, distinct from the
            fuchsia pre-order-reservation icon on order tiles. Luigi 2026-06-08. */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-500/15">
          <CalendarDays className="w-4 h-4 text-slate-500 dark:text-slate-300" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Lead line = customer name (only black text on the tile). */}
          <div className={`font-bold ${t.text} ${compact ? "text-base" : "text-lg"} leading-tight truncate`}>
            {r.customerName}
          </div>
          {/* Status chip + a single time cue below (GloriaFood-clean,
              Luigi 2026-06-15). Party size, table, deposit, notes, booking
              code + exact date/time now live in the detail (tap to open). */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <ReservationStatusBadge status={r.status} t={t} rejectionReason={r.rejectionReason} />
            {dayChip && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 tracking-wider">
                {dayChip}
              </span>
            )}
            {showAcceptCountdown ? (
              /* Pending → the order-style accept countdown (handles the parked
                 "OPENS IN" state internally). Auto-declines on elapse. */
              <Countdown
                notifiedAt={null}
                createdAt={r.createdAt}
                alertAt={r.alertAt}
                placedWhileClosed={!!r.alertAt}
                now={now ?? 0}
              />
            ) : (
              <>
                {autoCountdown && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                    <Clock className="w-3 h-3" /> {autoCountdown}
                  </span>
                )}
                {opensLabel && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300">
                    {opensLabel}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Reservation detail panel — opened from any reservation tile (All / In
// Progress / Reservations tab). Mirrors OrderDetail: the tile is just a
// summary and EVERY action button lives here, the same way an order's
// Accept / Reject live in OrderDetail rather than on the order row.
// Luigi 2026-06-08.
function ReservationDetail({
  r, t, onStatusChange, onPrint, onClose, hoursFormat = "24h", currency,
}: {
  r: KitchenReservation;
  t: T;
  onStatusChange: (id: string, status: string) => Promise<void> | void;
  onPrint: (id: string) => void;
  onClose: () => void;
  hoursFormat?: "12h" | "24h";
  /** Restaurant currency for the pre-order amount. */
  currency?: string;
}) {
  const tk = useTranslations("kitchen");
  const [busy, setBusy] = useState(false);
  const act = async (status: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onStatusChange(r.id, status);
      // Don't auto-close — the detail stays open so staff can immediately
      // correct a mistake (e.g. un-seat). A rejected/cancelled booking drops
      // out of the feed on the next poll, which closes the panel on its own.
      // Luigi 2026-06-08.
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`flex flex-col h-full ${t.detail}`}>
      <div
        className={`flex items-center gap-2 p-4 border-b ${t.border} flex-shrink-0`}
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button onClick={onClose} className={`p-1.5 rounded-lg ${t.btn} flex-shrink-0`} aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={`font-bold ${t.text} truncate`}>{r.customerName}</span>
          <ReservationStatusBadge status={r.status} t={t} rejectionReason={r.rejectionReason} />
          {r.depositPaid && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {tk("depositPaid").toUpperCase()}
            </span>
          )}
          {r.preOrderTotal > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {tk("preOrder").toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        <div className={`flex items-center gap-2 ${t.text}`}>
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold">{r.date} · {formatTime(r.time, hoursFormat)}</span>
        </div>
        <div className={`flex items-center gap-2 flex-wrap ${t.muted}`}>
          <Package className="w-4 h-4 flex-shrink-0" />
          <span>{tk("partyOf", { n: r.partySize })}</span>
          {r.table && <span>· {r.table.name}</span>}
        </div>
        {r.customerPhone && (
          <div className={`${t.muted}`}>📞 {r.customerPhone}</div>
        )}
        {r.notes && (
          <div className={`text-xs ${t.muted} italic border-l-2 ${t.border} pl-3`}>&quot;{r.notes}&quot;</div>
        )}
        {r.preOrderTotal > 0 && (
          <div className={`flex items-center justify-between rounded-xl border ${t.border} px-3 py-2`}>
            <span className={`flex items-center gap-1.5 font-semibold ${t.text}`}>
              <ShoppingBag className="w-4 h-4" /> {tk("preOrder")}
            </span>
            <span className={`font-bold ${t.text}`}>{formatCurrency(r.preOrderTotal, currency)}</span>
          </div>
        )}
        <div className="text-[10px] font-mono text-gray-400">#{r.confirmationCode}</div>
      </div>

      <div
        className={`border-t ${t.border} p-4 flex-shrink-0 space-y-2`}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* Pending → Accept/Reject; once accepted, a full floor-status switcher
            (Confirmed / Seated / No-show / Completed) lets staff move it forward
            OR fix a mistake. Luigi 2026-06-08. */}
        <ReservationStatusControls status={r.status} onChange={act} t={t} busy={busy} />
        <button onClick={() => onPrint(r.id)}
          className={`w-full flex items-center justify-center gap-1.5 border ${t.border} ${t.btn} font-semibold py-2 rounded-xl text-sm transition`}>
          <Printer className="w-4 h-4" /> {tk("print")}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status, t, rejectionReason }: { status: string; t: T; rejectionReason?: string | null }) {
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
  // An order auto-rejected by the unattended-timeout (the client countdown OR
  // the server cron backstop) is a MISSED order, not a manual rejection. Both
  // paths stamp a rejectionReason that starts with "Auto-rejected:" — use that
  // to relabel the (still red) badge "MISSED". A genuine staff reject — no
  // reason, or any non-"Auto-rejected" reason — stays "REJECTED". Same rule as
  // OrderDetail's badge so the tile and the detail view never disagree.
  // Luigi 2026-06-09.
  const isMissed = status === "rejected" && (rejectionReason?.startsWith("Auto-rejected") ?? false);
  const k = isMissed ? "missed" : keyMap[status];
  const label = k ? tk(k).toUpperCase() : status.toUpperCase();
  // MISSED gets its own (orange) tone so it never looks like a manual REJECT.
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isMissed ? t.badgeMissed : (cls[status] ?? t.badgeCompleted)}`}>
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
  const locale = useLocale();
  // Stable placeholder until the client mounts (now === 0) to avoid hydration mismatch.
  if (!now) return <span className="text-xs font-mono text-gray-400">--:--</span>;
  // If alertAt is set AND still in the future, the order is parked —
  // the countdown hasn't started yet. Show "waiting for open" badge.
  if (alertAt) {
    const alertMs = new Date(alertAt).getTime();
    if (alertMs > now) {
      // Cap at 24h → weekday name (e.g. "OPENS THURSDAY") so a scheduled order
      // days out never shows "OPENS IN 158H 0M". Luigi 2026-06-05.
      const label = formatDueLabel(alertMs, now, locale);
      const badge = label.kind === "day" ? label.text.toUpperCase() : `OPENS IN ${label.text.toUpperCase()}`;
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300 whitespace-nowrap"
          title={`Alert at ${new Date(alertAt).toLocaleString(locale || undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
        >
          {badge}
        </span>
      );
    }
  }
  // Countdown reference: prefer alertAt (when fired) so closed-placed
  // orders count from open time, not the middle-of-the-night createdAt.
  const reference = alertAt ?? notifiedAt ?? createdAt;
  // Closed-placed orders get a 15-minute initial buffer (staff may be
  // a few min late arriving after open). Normal orders keep 3 min.
  const totalMs = placedWhileClosed ? 15 * 60 * 1000 : ACCEPT_WINDOW_MS;
  const ms = totalMs - (now - new Date(reference).getTime());
  if (ms <= 0) return <span className="text-[10px] font-bold text-red-500 animate-pulse whitespace-nowrap">URGENT</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const color = ms < 60000 ? "text-red-500 font-bold" : "text-emerald-500 font-semibold";
  return <span className={`text-[10px] ${color} font-mono whitespace-nowrap`}>{m}:{s.toString().padStart(2, "0")}</span>;
}


// ── Order row ─────────────────────────────────────────────────────────────────
function OrderRow({ order, selected, onClick, t, now, dayChip, hideZeroCountdown, currency }: {
  order: Order; selected: boolean; onClick: () => void; t: T; now: number; currency: string;
  /** Optional day-of-week pill (MON/TUE/…) rendered alongside the
   *  order number. Used by the In Progress LATER section so the
   *  kitchen can spot which day each scheduled order is for. */
  dayChip?: string;
  /** When true, the right-column "ready in" countdown disappears once
   *  it reaches 00:00 instead of locking at zero. The All tab uses
   *  this so the list reads like GloriaFood's — past-due orders show
   *  no timer at all, current orders show a live countdown. The
   *  In Progress tab keeps the locked-at-zero display so the kitchen
   *  can still see the row hit its promised time — but the styling
   *  is quiet (no red, no "overdue" label) per Luigi 2026-06-02. */
  hideZeroCountdown?: boolean;
}) {
  const tk = useTranslations("kitchen");
  const locale = useLocale();
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
  const totalCountdownMs = order.placedWhileClosed ? 15 * 60 * 1000 : ACCEPT_WINDOW_MS;
  const msLeft = now && !alertParked
    ? totalCountdownMs - (now - new Date(countdownReference).getTime())
    : Number.POSITIVE_INFINITY;
  const isUrgent = isPending && !alertParked && msLeft <= 30 * 1000;
  // Background highlight keys off the PENDING state alone (Luigi 2026-06-14 —
  // every unaccepted order must stand out at a glance, even one parked while
  // closed). The flash / urgent pulse + ring stay gated on !alertParked, so a
  // parked order is highlighted-but-calm (no pulsing, no sound) until it goes live.
  const baseRowClass = selected ? t.rowSelected : isPending ? `${t.rowNew} cursor-pointer` : t.row;
  const flashClass = isUrgent ? "kitchen-flash-urgent" : "kitchen-flash-new";
  const rowClass = isPending && !alertParked ? `${baseRowClass} ${flashClass}` : baseRowClass;
  // Live countdown to the order's promised ready time. We prefer
  // scheduledFor (customer-chosen slot) over estimatedReady (kitchen's
  // accept-time promise). Once the moment passes the chip locks at
  // "00:00" instead of disappearing — matches how the under-icon chip
  // in the In Progress tab behaves, and means the list never goes
  // mute on the orders the kitchen most needs to see.
  //
  // Format (see formatDueCountdown — unambiguous hours vs minutes):
  //   ≥ 1 hour → "2h 05m"  (explicit units)
  //   < 1 hour → "14:31"   (MM:SS ticking)
  //   past due  → "00:00"
  const dueTs = (() => {
    const scheduled = (order as any).scheduledFor ? new Date((order as any).scheduledFor).getTime() : NaN;
    if (Number.isFinite(scheduled)) return scheduled;
    const er = (order as any).estimatedReady ? new Date((order as any).estimatedReady).getTime() : NaN;
    if (Number.isFinite(er)) return er;
    return NaN;
  })();
  const readyCountdown = (!now || !Number.isFinite(dueTs)) ? null : formatDueLabel(dueTs, now, locale);
  const countdownIsPast = readyCountdown?.kind === "due";

  const isTest = order.customerName.startsWith("[TEST]");
  // Show the address as the lead line ONLY for address-bearing order types.
  // Some legacy orders were saved with a stray deliveryAddress on a pickup/
  // dine-in (write-path bug fixed 2026-06-13); gating on type here keeps those
  // tiles correct — a pickup always leads with the NAME, never an address.
  const showAddress =
    (order.type === "delivery" || order.type === "catering") && !!order.deliveryAddress;

  return (
    <div onClick={onClick} className={`px-4 py-3 min-h-[80px] flex items-center transition-colors ${rowClass}`}>
      <div className="flex items-start gap-3 w-full">
        {/* Icon column + chip underneath (Luigi 2026-06-02 GloriaFood
            parity). The chip is either a live countdown to the order's
            due time (today's items) or a day-of-week abbreviation
            (LATER section items waiting for their day). Position kept
            tight under the icon so a kitchen at a glance can read
            "bag, 00:00 = pickup that's due now" without scanning. */}
        <div className="flex-shrink-0 flex flex-col items-center w-9">
          {(() => {
            // A distinct icon + colour per order type so the kitchen can tell
            // them apart at a glance. A pre-order-with-reservation gets its own
            // (fuchsia calendar) icon, separate from a plain dine-in. Luigi
            // 2026-06-08.
            // Icon SHAPE still distinguishes the order type at a glance, but the
            // colour is now a single neutral grey for ALL tiles (Luigi 2026-06-18
            // — wanted the left-of-name icons uniform, not multi-coloured).
            const ic = isTest
              ? { Icon: FlaskConical }
              : order.reservation
                ? { Icon: CalendarClock }
                : order.type === "delivery"
                  ? { Icon: Truck }
                  : order.type === "take_out"
                    ? { Icon: Package }
                    : order.type === "dine_in"
                      ? { Icon: UtensilsCrossed }
                      : order.type === "catering"
                        ? { Icon: ChefHat }
                        : { Icon: ShoppingBag }; // pickup
            const Icon = ic.Icon;
            return (
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-500/15">
                <Icon className="w-4 h-4 text-slate-500 dark:text-slate-300" />
              </div>
            );
          })()}
          {dayChip && (
            <span
              className={`text-[9px] mt-0.5 font-semibold tabular-nums whitespace-nowrap leading-none ${
                /^\d/.test(dayChip)
                  ? t.muted // countdown digits — neutral grey, same vibe as GloriaFood
                  : "text-sky-700" // future-day chip — sky like before
              }`}
            >
              {dayChip}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* Lead line = WHO / WHERE — the only black text on the tile.
              Delivery / catering show the ADDRESS; everything else the NAME. */}
          <div className={`font-bold text-[1.15rem] leading-tight ${t.text} truncate`}>
            {showAddress
              ? order.deliveryAddress
              : order.customerName.replace("[TEST] ", "")}
          </div>
          {/* Status chip on its own line directly below (GloriaFood-clean,
              Luigi 2026-06-15). Everything else — order #, item count,
              marketplace / first-order / reservation flags — now lives in the
              detail view (tap to open), so the tile stays uncluttered. The
              pending accept-countdown is the one time-critical cue we keep. */}
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <StatusBadge status={order.status} t={t} rejectionReason={order.rejectionReason} />
            {order.status === "pending" && (
              <Countdown
                notifiedAt={order.notifiedAt}
                createdAt={order.createdAt}
                alertAt={order.alertAt}
                placedWhileClosed={order.placedWhileClosed}
                now={now}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <div className={`font-bold text-sm ${t.text}`}>{formatCurrency(order.total, currency)}</div>
          {/* Live countdown to the promised ready time (Luigi 2026-06-02
              kitchen-card revamp). Larger + lower than the static "20 m"
              prep number it replaced; ticks every second; locks at 00:00
              when the time passes.
              Luigi 2026-06-02 polish: countdown stays in NORMAL text
              colour at 00:00 (no red "overdue" highlight) and the
              "overdue" label is dropped — when the digits hit 00:00
              the "ready in" caption also disappears so the row is
              quiet, not loud. */}
          {readyCountdown && !["pending", "rejected", "cancelled", "completed", "refunded", "no_show"].includes(order.status) && !(order as any).manuallyClearedAt && !(hideZeroCountdown && countdownIsPast) && (
            <div className="mt-1 text-right">
              <div
                // ALL countdowns — minute timers included — render in the same
                // sky tone as the day-of-week chips so the "ready in" time reads
                // one consistent colour. (Luigi 2026-06-17: match the timer to
                // the day-of-week colour.)
                className="text-base font-semibold tabular-nums leading-none whitespace-nowrap text-sky-600 dark:text-sky-300"
                title="Promised ready time"
              >
                {/* Day-of-week labels (>24h out) in block capitals — "GIOVEDÌ" —
                    keeping the sky colour; numeric countdowns left as-is. */}
                {readyCountdown.kind === "day" ? readyCountdown.text.toUpperCase() : readyCountdown.text}
              </div>
              {!countdownIsPast && (
                <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${t.muted}`}>
                  ready in
                </div>
              )}
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
  /** "Auto-rejected: ..." when a pending booking was auto-declined for not being
   *  accepted in time → the badge reads "MISSED" (orange), like a missed order.
   *  Null/absent on a manual staff decline → plain "REJECTED". Luigi 2026-06-16. */
  rejectionReason?: string | null;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  date: string;
  time: string;
  notes: string | null;
  preOrderTotal: number;
  depositPaid: boolean;
  depositAmount: number;
  /** Deferred kitchen-alert time — set when the booking was placed while the
   *  restaurant was CLOSED, so it doesn't ring until opening. Luigi 2026-06-14. */
  alertAt: string | null;
  /** Reserve-then-order: set when this booking was placed WITH a food order.
   *  Tapping such a booking opens the linked ORDER's full detail (food +
   *  reservation banner), and the booking is NOT shown as its own tile in the
   *  All / In-Progress tabs — the order tile represents it. Luigi 2026-06-08. */
  orderId: string | null;
  table: { name: string; number: number | null } | null;
  /** Per-tab clear flags — a walk-up booking is clearable from the All and
   *  Complete tabs too, each independently, just like an order. */
  clearedFromReservationsAt?: string | null;
  clearedFromAllAt?: string | null;
  clearedFromCompleteAt?: string | null;
  /** When the reservation row was inserted in our DB. Used so the
   *  All / In Progress tabs can interleave reservations with orders
   *  in the same "newest first" order as the orders list — sorted
   *  by when the kitchen heard about them, NOT by when the booking
   *  is FOR (Luigi 2026-06-01: previously a reservation for next
   *  week was sorting to the very top because we used date+time). */
  createdAt: string;
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
// Loudness boost for the WebAudio gain-node alarm sounds (synth bell + the
// band-limited ding samples). They play quieter than the full-spectrum
// GloriaFood alarm track, which made the ring "sometimes low, sometimes
// higher". Boosting them up levels every alarm sound to a uniform,
// as-loud-as-possible volume (gain nodes can exceed unity; a touch of clip on
// an alarm only adds cut-through). Module-scope so the useCallback([]) sound
// fns can read it without a dep. Luigi 2026-06-09.
const RING_BOOST = 1.6;
// Amplification for the full-length GloriaFood alert TRACK. An HTMLAudio element
// caps at its own recorded level (volume = 1), which Luigi found too quiet, so
// we route the track through a gain node + a brick-wall limiter: the gain pushes
// it WAY past the file level, the limiter pins the peaks just under 0 dBFS so it
// gets much louder WITHOUT clipping or distorting (same clip, same quality).
// Luigi 2026-06-09.
const LONG_ALERT_BOOST = 6;
// Accept/auto-reject window for a normal (open-restaurant) pending order. Set to
// the length of the GloriaFood alert TRACK (~245 s) so the full alert plays
// as the countdown — its built-in louder/faster final stretch lands right as the
// time runs out — and the order auto-rejects exactly as the audio finishes, with
// no mid-track cut and no loop restart. Luigi 2026-06-09. (Orders placed while
// closed keep the longer 15-min buffer.)
const ACCEPT_WINDOW_MS = 245 * 1000;

export function KitchenDisplay({ restaurant, initialOrders }: { restaurant: any; initialOrders: Order[] }) {
  const tk = useTranslations("kitchen");
  const locale = useLocale();
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
  // 12h/24h display preference for reservation + order times in the kitchen.
  const hoursFmt: "12h" | "24h" = restaurant?.hoursFormat === "12h" ? "12h" : "24h";
  // Restaurant's currency for all on-screen money (order totals, item prices).
  const moneyCurrency: string = (restaurant as any)?.currency ?? "usd";
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

  // Auto-print bookkeeping for AUTO-CONFIRMED reservations. A booking that
  // arrives already "confirmed" (auto-accept ON) never passes through the
  // manual Accept that prints, so we print it on arrival here. These two refs
  // make that reliable + safe:
  //   • autoPrintedReservationsRef — print each booking at most once.
  //   • kitchenSessionStartRef — only print bookings created AFTER this kitchen
  //     session started, so we never reprint history on load / reload (and the
  //     "fresh"-detection seeding race below can't swallow a brand-new one).
  // Luigi 2026-06-08: "auto accept should still print".
  const autoPrintedReservationsRef = useRef<Set<string>>(new Set());
  const kitchenSessionStartRef = useRef<number>(Date.now());

  // Poll upcoming reservations whenever the Reservations OR Orders tab is open
  // (Orders tab shows reservations alongside the order list). Also drives
  // the kitchen ring/toast for NEW reservation arrivals — manual-accept
  // (status "pending") re-arms the alarm loop the same way a new order
  // does; auto-accept (status "confirmed") shows a single toast so staff
  // know a booking just landed without the alarm cadence.
  // Native push: register this device's FCM/APNs token on launch so a new
  // order rings even with the screen off / app backgrounded. No-op on the web
  // (only acts inside the Capacitor app shell). Luigi 2026-06-15.
  useEffect(() => {
    registerKitchenPush();
  }, []);

  useEffect(() => {
    // Poll on EVERY tab. Bookings now appear in In Progress (confirmed/seated)
    // and Complete (finished) as well as the Reservations / All tabs, and an
    // auto-confirmed booking must ring + auto-print no matter which tab the
    // kitchen is sitting on. This was previously gated to the reservations /
    // orders tabs, so a booking placed while the kitchen sat on In Progress
    // didn't ring, print, or update any count until staff tapped over to one
    // of those tabs. Mirrors the always-on order poll. Luigi 2026-06-08.
    let cancelled = false;
    const fetchRes = async () => {
      try {
        // Cache-bust + no-store — same iOS WKWebView stale-GET issue as the
        // orders poll; without it new reservations never surfaced on iPhone.
        const res = await fetch(`/api/admin/reservations/upcoming?t=${Date.now()}`, { cache: "no-store" });
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
              // (Auto-PRINTING of confirmed bookings is handled by the robust
              // pass below — it runs every poll and can't be swallowed by the
              // first-poll seeding race the way this `fresh` branch can.)
            }
            fresh.forEach((r) => seen.add(r.id));
          }
        }
        // ── Robust auto-print for AUTO-CONFIRMED bookings ────────────────────
        // A booking that arrives already "confirmed" skips the manual Accept
        // (which is what prints), so print it here. Runs every poll over the
        // full list — NOT gated on the seeding/"fresh" race above — guarded so
        // it prints each booking at most once (autoPrintedReservationsRef) and
        // never reprints history (only bookings created after this kitchen
        // session started). Pre-orders print via their linked ORDER, so they're
        // skipped. Same printer preference as orders: direct LAN first, then
        // PrintNode fallback. Luigi 2026-06-08.
        for (const r of data) {
          if (r.orderId) continue;
          if (r.status !== "confirmed") continue;
          if (autoPrintedReservationsRef.current.has(r.id)) continue;
          const created = r.createdAt ? new Date(r.createdAt).getTime() : 0;
          // Mark-and-skip anything from before this session so it never prints
          // again on a reload, and skip rows with no createdAt.
          if (!created || created <= kitchenSessionStartRef.current) {
            autoPrintedReservationsRef.current.add(r.id);
            continue;
          }
          autoPrintedReservationsRef.current.add(r.id);
          const directCfg = getDirectPrinterConfig();
          if (directCfg) {
            doPrintDirectReservation(r.id).catch((err) => {
              console.warn("[kds reservation auto-print direct] failed, trying PrintNode", err);
              if (
                printerSettingsRef.current?.printNodeConnected &&
                printerSettingsRef.current.selectedPrinterId
              ) {
                fetch("/api/kitchen/printnode/print", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reservationId: r.id }),
                }).catch((e) => console.warn("[kds reservation auto-print printnode]", e));
              }
            });
          } else if (
            printerSettingsRef.current?.printNodeConnected &&
            printerSettingsRef.current.selectedPrinterId
          ) {
            fetch("/api/kitchen/printnode/print", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reservationId: r.id }),
            }).catch((err) => console.warn("[kds reservation auto-print] failed:", err));
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

  /** Print a reservation receipt. Mirrors the order print logic:
   *    1. Try direct LAN printer first when configured — fastest, no
   *       third-party dependency.
   *    2. Fall back to PrintNode when the direct path isn't set up
   *       (or fails) AND PrintNode is connected.
   *    3. Nothing configured → toast + open printer setup modal.
   *  Luigi 2026-06-01: reservations now have the same dual-path
   *  setup as orders. */
  const printReservation = async (id: string) => {
    const direct = getDirectPrinterConfig();
    if (direct) {
      try {
        await doPrintDirectReservation(id);
        toast.success("Reservation printed ✓");
        return;
      } catch (err) {
        // Fall through to PrintNode if available, else surface a
        // user-friendly error and stop. Mirrors doPrint().
        console.warn("[reservation print] direct printer failed, trying PrintNode", err);
        if (!printerSettings?.printNodeConnected || !printerSettings.selectedPrinterId) {
          const reason = (err as any)?.code || (err as any)?.message || "";
          toast.error(nativePrinterErrorCopy(reason));
          return;
        }
      }
    }
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
    // Remember the prior status so we only print on the ACCEPT transition, not
    // when "Confirmed" is tapped to un-seat / correct a mistake. Luigi 2026-06-08.
    const prevStatus = reservations.find((r) => r.id === id)?.status;
    await fetch(`/api/admin/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    // Print a booking confirmation only when the kitchen ACCEPTS a brand-new
    // (pending) walk-up reservation, mirroring the auto-print on order accept.
    // Pre-order bookings print via their order's auto-print instead.
    // Guarded on an actually-configured printer, same as the auto-confirmed
    // booking path above: printReservation()'s no-printer fallback opens the
    // full Printer Setup modal, which must never interrupt an Accept tap on a
    // printer-less kitchen (reseller report cmqa7ci9q). Manual Print buttons
    // keep that helpful fallback.
    if (status === "confirmed" && prevStatus === "pending") {
      const hasPrinter =
        !!getDirectPrinterConfig() ||
        (!!printerSettings?.printNodeConnected && !!printerSettings.selectedPrinterId);
      if (hasPrinter) {
        printReservation(id).catch((e) => console.error("[reservation accept print]", e));
      }
    }
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The reservation whose detail panel is open. Mutually exclusive with
  // selectedId (an order detail) — opening one clears the other. Luigi 2026-06-08.
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  // Two separate printer setup modals — DirectPrinter (LAN, primary)
  // and PrintNode (legacy / Windows-bridge / backup). One settings
  // button in the header opens the right one based on platform; the
  // user can switch between them from within either modal.
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  const [showDirectPrinterSetup, setShowDirectPrinterSetup] = useState(false);
  // Restaurant Status modal — pause services + mark items out of
  // stock. Luigi 2026-06-01. Pulls fresh restaurant pause-state +
  // refetches orders/menu when changes are saved so the kitchen
  // tablet reflects the new status without a manual reload.
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEndOfDayModal, setShowEndOfDayModal] = useState(false);
  const [restaurantPauses, setRestaurantPauses] = useState<{
    pickup: string | null; delivery: string | null; dineIn: string | null;
    catering: string | null; takeOut: string | null; reservations: string | null;
  }>({
    pickup: (restaurant as any)?.pickupPausedUntil ?? null,
    delivery: (restaurant as any)?.deliveryPausedUntil ?? null,
    dineIn: (restaurant as any)?.dineInPausedUntil ?? null,
    catering: (restaurant as any)?.cateringPausedUntil ?? null,
    takeOut: (restaurant as any)?.takeOutPausedUntil ?? null,
    reservations: (restaurant as any)?.reservationsPausedUntil ?? null,
  });
  const refreshRestaurantPauses = useCallback(async () => {
    try {
      // no-store + cache-bust — iOS WKWebView would otherwise show stale
      // pause/open-closed state after the first load.
      const r = await fetch(`/api/kitchen/restaurant-status?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setRestaurantPauses({
        pickup: d.pickupPausedUntil ?? null,
        delivery: d.deliveryPausedUntil ?? null,
        dineIn: d.dineInPausedUntil ?? null,
        catering: d.cateringPausedUntil ?? null,
        takeOut: d.takeOutPausedUntil ?? null,
        reservations: d.reservationsPausedUntil ?? null,
      });
    } catch { /* noop */ }
  }, []);
  const anyServicePaused = (() => {
    const now = Date.now();
    return Object.values(restaurantPauses).some(
      (v) => v && new Date(v).getTime() > now,
    );
  })();
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

  // iOS WebView blocks audio until a user gesture; the kitchen sits idle waiting
  // for orders, so without a tap the alarm is SILENT for the first order (Luigi
  // hit this on iPhone). Show a one-tap "enable sound" gate on iOS until the
  // audio is unlocked. Web fix, no rebuild. Luigi 2026-06-19.
  const [soundGateOpen, setSoundGateOpen] = useState(false);
  // TEMP diagnostic (gated to one restaurant in the JSX below): timestamp of the
  // last SUCCESSFUL orders poll, surfaced in an on-screen status readout to debug
  // the iOS phantom-ring / stale-state issue. Remove once the alarm is confirmed.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (isIOS && !audioUnlockedRef.current) setSoundGateOpen(true);
  }, []);

  // Full-length "GloriaFood" new-order alert (Luigi 2026-06-04): a ~4-minute
  // MP3 that plays ONCE per alerting period — until the kitchen accepts or the
  // track ends — instead of a short ding looped on a cadence. We stream it via
  // a plain HTMLAudioElement (NOT the Web Audio decoded-buffer path) because a
  // 4-minute file would otherwise hold ~tens of MB of decoded PCM in memory
  // and the cadence loop would restart it every couple seconds. The element is
  // created lazily + unlocked on the same first-gesture as the AudioContext.
  const longAlertRef = useRef<HTMLAudioElement | null>(null);
  const getLongAlert = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!longAlertRef.current) {
      const a = new Audio("/sounds/gloriafood-alert.mp3");
      a.preload = "auto";
      a.loop = false; // play once through, then stop ("until the time is up")
      longAlertRef.current = a;
    }
    return longAlertRef.current;
  }, []);

  // Route the long alert track through gain + limiter so it can play MUCH louder
  // than the raw file (which capped at element volume = 1) without clipping. The
  // gain amplifies past unity; the DynamicsCompressor, configured as a hard
  // limiter, pins peaks just under 0 dBFS so loudness goes up but the waveform
  // never distorts. A media element can only be tapped by ONE source node, so we
  // build the chain once and cache it. Returns false if Web Audio is
  // unavailable — the caller then just falls back to plain element volume.
  // Luigi 2026-06-09.
  const longAlertSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ensureLongAlertRouting = useCallback((): boolean => {
    const a = longAlertRef.current;
    if (!a) return false;
    if (longAlertSourceRef.current) return true; // already routed
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return false;
      let ctx = audioCtxRef.current;
      if (!ctx) { ctx = new Ctx(); audioCtxRef.current = ctx; }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const src = ctx.createMediaElementSource(a);
      const gain = ctx.createGain();
      gain.gain.value = LONG_ALERT_BOOST;
      const limiter = ctx.createDynamicsCompressor();
      const now = ctx.currentTime;
      limiter.threshold.setValueAtTime(-1.5, now); // limit just under 0 dBFS
      limiter.knee.setValueAtTime(0, now);         // hard knee
      limiter.ratio.setValueAtTime(20, now);       // ~brick-wall
      limiter.attack.setValueAtTime(0.002, now);
      limiter.release.setValueAtTime(0.12, now);
      src.connect(gain).connect(limiter).connect(ctx.destination);
      longAlertSourceRef.current = src;
      return true;
    } catch (e) {
      console.warn("[KDS] loud alert routing unavailable; using plain volume", e);
      return false;
    }
  }, []);

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
      // Any gesture also dismisses the iOS "tap to enable sound" gate.
      setSoundGateOpen(false);
      if (audioUnlockedRef.current) return;
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        audioUnlockedRef.current = true;
      } catch {}
      // Also unlock the long-alert <audio> element on the same gesture so the
      // 4-min new-order alert can autoplay later (browsers gate HTMLAudio
      // playback on a user gesture, separately from the AudioContext).
      //
      // CRITICAL: only "prime" the element (the muted play→pause dance) when
      // it is NOT already playing. On the native kitchen app autoplay is
      // allowed, so a new order's alert track can already be RINGING before
      // the staff's very first tap. If that first tap is on the ringing order
      // (the natural thing to do), priming would pause + rewind the live
      // alarm — and since the long-track effect's deps didn't change it never
      // restarts, so the order goes silent the instant it's opened. Guarding
      // on `a.paused` means: idle element → prime it for later; already
      // ringing → it's clearly unlocked, so leave it playing. Luigi 2026-06-09
      // ("clicking the order must NOT stop the ring").
      try {
        const a = getLongAlert();
        if (a && a.paused) {
          a.muted = true;
          a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
        }
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
      // Boosted to match the GloriaFood alarm track's loudness — the synth used
      // to peak at only 0.6 and read noticeably quieter than the other sounds.
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(RING_BOOST * vol, t0 + 0.005);
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
      // Boosted (RING_BOOST) to make up for the band-pass filtering above, which
      // trims energy and otherwise leaves the ding quieter than the alarm track.
      gain.gain.value = RING_BOOST * vol;
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
  // A closed-when-placed order rings for the FULL 15-min window (vs ~4 min for a
  // normal order). The gloriafood alert TRACK is only ~4 min long, so for these
  // the audio must LOOP or the kitchen goes silent 11 min early (Luigi
  // 2026-06-13). Normal orders keep play-once — the track is tuned to finish as
  // they auto-reject. True only while such an order is actively ringing (its
  // deferred alertAt has passed), so a still-parked closed order stays silent.
  const longRing = orders.some(
    (o) => o.status === "pending"
      && o.placedWhileClosed
      && !(o.alertAt && new Date(o.alertAt).getTime() > nowMs),
  );
  // Today / tomorrow as YYYY-MM-DD (restaurant-local via the tablet clock) —
  // used to tell "actionable" bookings apart from the ~30 days of history the
  // feed now carries for the persistent Reservations tab. Luigi 2026-06-08.
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayISO = isoOf(new Date());
  const tomorrowISO = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoOf(d); })();
  // Pending reservations (manual-accept mode arrivals not yet
  // accepted/declined by staff) re-arm the alarm right alongside
  // pending orders. The existing alarm-loop reads pendingCount, so
  // adding reservations here is the single hook that ties the
  // reservation-side ring to the order-side cadence — no duplicate
  // loop required. Luigi 2026-06-01: "the ring should be the same".
  // Only TODAY-or-future pendings ring — a stale past pending the feed still
  // carries for history must not ring the bell forever. Luigi 2026-06-08.
  const pendingReservationCount = reservations.filter(
    (r) => r.status === "pending" && r.date >= todayISO
      // Parked (placed while closed) bookings stay silent until alertAt passes —
      // mirrors the order pendingCount / longRing guards above. Luigi 2026-06-14.
      && !(r.alertAt && new Date(r.alertAt).getTime() > nowMs),
  ).length;
  const alerting = (pendingCount + pendingReservationCount) > 0 && !acknowledged;

  // Per-order ring hush (Luigi 2026-06-16, GloriaFood parity). Each pending
  // order/reservation rings on its OWN: opening one full-screen silences ONLY
  // that one — any OTHER still-pending order keeps ringing so staff are nagged to
  // back out and accept it too. The room only goes quiet when nothing pending is
  // left UNopened. Backing out re-arms (the open item rejoins the ring set);
  // reopening the app re-arms too (selectedId resets on mount). Implemented by
  // removing the currently-open item from the ringing set IF it's itself a live
  // pending (same pending + not-parked test as the counts above; at most one of
  // order/reservation is open at a time — they clear each other). Gates ONLY the
  // audio: the visual "X new" badge, the per-tile pulse, the live countdown, and
  // the server-side auto-reject + alert-call crons all key off `alerting` /
  // pendingCount / the DB and are deliberately left untouched. Reverses the older
  // "clicking must not stop the ring" guard.
  const openOrderIsPending =
    selectedId !== null &&
    orders.some(
      (o) => o.id === selectedId && o.status === "pending" && !(o.alertAt && new Date(o.alertAt).getTime() > nowMs),
    );
  const openReservationIsPending =
    selectedReservationId !== null &&
    reservations.some(
      (r) =>
        r.id === selectedReservationId && r.status === "pending" && r.date >= todayISO &&
        !(r.alertAt && new Date(r.alertAt).getTime() > nowMs),
    );
  const ringAudible =
    (pendingCount - (openOrderIsPending ? 1 : 0)) +
      (pendingReservationCount - (openReservationIsPending ? 1 : 0)) > 0 &&
    !acknowledged;

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
    if (!ringAudible || alertMuted || alertVolume <= 0) return;
    // "gloriafood" rings via the full-length uploaded alert TRACK (the
    // dedicated long-alert effect below), NOT this short-ding cadence — Luigi
    // wants his exact full-length GloriaFood alert at max volume, not a trimmed
    // ding. This cadence drives the synth / custom-sample sounds. Luigi
    // 2026-06-09.
    if (alertSound === "gloriafood") return;
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
  }, [ringAudible, alertMuted, alertVolume, ringBellOnce]);

  // Full-length GloriaFood alert track — the owner's uploaded
  // /sounds/gloriafood-alert.mp3, played at MAX volume and LOOPED until the
  // kitchen accepts/rejects (alerting → false) or the auto-reject cron kills
  // the order. This is the real "order is ringing" sound for the gloriafood
  // choice — Luigi wants his exact full-length alert, not a trimmed ding.
  // Luigi 2026-06-04 / restored + maxed 2026-06-09.
  useEffect(() => {
    const a = getLongAlert();
    if (!a) return;
    const shouldPlay = ringAudible && alertSound === "gloriafood" && !alertMuted && alertVolume > 0;
    if (shouldPlay) {
      // Route through the gain+limiter chain so the track plays WAY louder than
      // the file's own level (without clipping). volume = 1 feeds the chain at
      // full input; the gain does the loudness. Falls back to plain volume = 1
      // if Web Audio routing isn't available.
      ensureLongAlertRouting();
      // The track is tuned to the ~4-min NORMAL accept window: for those, play
      // it ONCE so its louder/faster finish lands as the order auto-rejects
      // (Luigi 2026-06-09: "do not adjust the audio, it's that length for a
      // reason"). BUT a closed-when-placed order rings for the full 15-min
      // window — the ~4-min track would leave 11 min of silence — so LOOP it for
      // those until the kitchen accepts/rejects or the 15-min auto-reject fires
      // (Luigi 2026-06-13).
      a.loop = longRing;
      a.volume = 1;
      if (a.paused) {
        try { a.currentTime = 0; } catch {}
        a.play().catch(() => { /* autoplay blocked until a gesture — unlock effect handles it */ });
      }
    } else {
      a.loop = false;
      if (!a.paused) a.pause();
      try { a.currentTime = 0; } catch {}
    }
  }, [ringAudible, longRing, alertSound, alertMuted, alertVolume, getLongAlert, ensureLongAlertRouting]);

  // ── Re-arm audio when the app returns to the foreground (Luigi 2026-06-07) ──
  // Android (and backgrounded browser tabs) SUSPEND the AudioContext and pause
  // media when the kitchen app loses focus. The alarm effects above only fire
  // on a STATE change — so an order that arrives while the app is backgrounded
  // (e.g. staff placed it from another device) has its play() blocked once and
  // is never re-attempted on return, leaving the display silent until someone
  // taps (which is why Mute→Unmute "fixed" it — the tap resumed audio).
  //
  // This listener fires on every visibility/focus regain: it resumes the
  // AudioContext (allowed without a fresh gesture once the page has been
  // unlocked) and re-kicks the alarm if an order is still waiting — so a
  // pending order rings the instant the kitchen comes back into view, with no
  // tap and no button.
  useEffect(() => {
    const rearm = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try { audioCtxRef.current?.resume?.().catch?.(() => {}); } catch {}
      if (!ringAudible || alertMuted || alertVolume <= 0) return;
      // gloriafood resumes its full-length track; other sounds fire one ding
      // (the cadence effect keeps them going). Luigi 2026-06-09.
      if (alertSound === "gloriafood") {
        ensureLongAlertRouting();
        const a = longAlertRef.current;
        if (a) { a.volume = 1; if (a.paused) a.play().catch(() => {}); }
      } else {
        ringBellOnce();
      }
    };
    document.addEventListener("visibilitychange", rearm);
    window.addEventListener("focus", rearm);
    window.addEventListener("pageshow", rearm);
    return () => {
      document.removeEventListener("visibilitychange", rearm);
      window.removeEventListener("focus", rearm);
      window.removeEventListener("pageshow", rearm);
    };
  }, [ringAudible, alertMuted, alertVolume, alertSound, ringBellOnce, ensureLongAlertRouting]);

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
  // Cleared-orders / cleared-complete state lived in localStorage here
  // before Luigi 2026-06-02. It's now server-side
  // (Order.clearedFromKitchenAt) so every device that signs in to the
  // same kitchen sees the same list — no more "I cleared on the iPad
  // but the laptop still shows them" mismatches.
  //
  // We keep an empty noop ref of the old setters so the legacy migration
  // useEffect below can wipe the historical localStorage entries
  // without breaking. Drop the migration block in a follow-up once
  // every kitchen device has loaded the new build at least once.
  const [clearConfirm, setClearConfirm] = useState<"orders" | "complete" | "reservations" | null>(null);
  // Top-right 3-dot quick-actions menu (Luigi 2026-06-15). Holds Test Order,
  // Clear current tab, Language, Log out — declutters the header. Full settings
  // live on the bottom bar's gear.
  const [showQuickMenu, setShowQuickMenu] = useState(false);

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

  // ── Client-side auto-reject when the 4-min countdown elapses ──────────
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
      const totalMs = order.placedWhileClosed ? 15 * 60 * 1000 : ACCEPT_WINDOW_MS;
      const elapsed = now - new Date(reference).getTime();
      // 5-second grace past the countdown — lets the URGENT pulse render
      // for a beat before we kill the row.
      if (elapsed < totalMs + 5_000) continue;
      autoRejectingRef.current.add(order.id);
      const reason = `Auto-rejected: not accepted within ${order.placedWhileClosed ? 15 : 4} minutes.`;
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

  // ── Client-side auto-decline when a PENDING reservation's accept countdown
  // elapses (Luigi 2026-06-15 chose full order parity). Mirrors the order
  // trigger above; the auto-reject-stale-orders cron is the 5-min backstop.
  // Deposit-owed bookings are skipped (they wait on the customer's payment).
  const autoRejectingResRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!now) return;
    for (const r of reservations) {
      if (r.status !== "pending" || r.depositAmount > 0) continue;
      if (autoRejectingResRef.current.has(r.id)) continue;
      if (r.alertAt && new Date(r.alertAt).getTime() > now) continue; // parked — not ringing yet
      const reference = r.alertAt ?? r.createdAt;
      const totalMs = r.alertAt ? 15 * 60 * 1000 : ACCEPT_WINDOW_MS;
      if (now - new Date(reference).getTime() < totalMs + 5_000) continue; // 5s grace
      autoRejectingResRef.current.add(r.id);
      fetch(`/api/admin/reservations/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // autoMissed:true → the route stamps the "Auto-rejected:" marker so this
        // un-accepted booking reads "MISSED", not a manual "REJECTED". Luigi 2026-06-16.
        body: JSON.stringify({ status: "rejected", autoMissed: true }),
      })
        .then(async (resp) => {
          if (!resp.ok && resp.status !== 409 && resp.status !== 400) {
            const body = await resp.text().catch(() => "");
            console.warn(`[kds auto-reject reservation] ${r.id} PATCH failed:`, resp.status, body.slice(0, 200));
          }
        })
        .catch((e) => console.warn(`[kds auto-reject reservation] ${r.id} network error:`, e));
    }
    const pendingResIds = new Set(reservations.filter((r) => r.status === "pending").map((r) => r.id));
    for (const id of Array.from(autoRejectingResRef.current)) {
      if (!pendingResIds.has(id)) autoRejectingResRef.current.delete(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, now]);

  // Migration: scrub the historical localStorage cleared-sets the very
  // first time this build mounts. They're authoritative server-side
  // now (Order.clearedFromKitchenAt), so leaving the keys around would
  // just confuse anyone inspecting the device's storage later.
  useEffect(() => {
    try {
      localStorage.removeItem("kds-cleared-orders");
      localStorage.removeItem("kds-cleared-complete");
    } catch { /* SSR / private mode — fine to ignore */ }
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
      // Cache-bust + no-store. iOS WKWebView aggressively caches same-URL GET
      // polls, so after the first load every 4s poll returned the STALE cached
      // response — new orders never appeared (and never rang, since new-order
      // detection runs off this data). A unique ?t= per poll + no-store
      // guarantees a fresh fetch each tick. Android's WebView didn't cache the
      // same way, so this only broke on iPhone. Luigi 2026-06-19.
      const res = await fetch(`/api/kitchen/orders?t=${Date.now()}`, { cache: "no-store" });
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
      setLastSyncAt(Date.now());
      setWorkflowMode(mode);
      setPrintNodeEnabled(pnEnabled);
    } catch {}
  }, []);

  // Mirror fetchOrders into a ref so non-reactive call sites
  // (server-side clear handlers, etc.) can trigger an immediate refresh
  // without re-binding their closures on every render.
  const fetchOrdersRef = useRef<typeof fetchOrders | null>(null);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

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

  // Screen Wake Lock — a kitchen display must stay awake. When the tablet
  // dims / sleeps to save battery, the OS throttles (or suspends) the 4s
  // order-poll timer, so a new order doesn't show or ring until the screen is
  // touched again — exactly what Luigi hit (a cash, auto-accepted order didn't
  // chime/print on the In Progress tab until he tapped over to All Orders, and
  // the tap is what woke the throttled timer). Holding a screen wake lock keeps
  // the display on so polling keeps its cadence. Re-acquired whenever the page
  // becomes visible again (the lock auto-releases when the page is hidden).
  // No-op on browsers / WebViews without the API. Luigi 2026-06-08.
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const nav = navigator as unknown as { wakeLock?: { request?: (t: string) => Promise<{ release?: () => Promise<void>; addEventListener?: (e: string, cb: () => void) => void }> } };
        if (!nav.wakeLock?.request) return;
        const sentinel = await nav.wakeLock.request("screen");
        lock = sentinel;
        sentinel.addEventListener?.("release", () => { lock = null; });
      } catch { /* denied / unsupported — fine, the visibility/focus wakes still catch up */ }
    };
    const onVis = () => { if (document.visibilityState === "visible" && !lock) request(); };
    request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try { void lock?.release?.(); } catch { /* noop */ }
    };
  }, []);

  // Resync orders the instant the active tab changes. On mobile WebViews a tab
  // tap is a user interaction that should immediately refresh rather than wait
  // for the (possibly throttled) next poll tick — so switching tabs always
  // shows the latest orders right away. Cheap idempotent GET. Luigi 2026-06-08.
  useEffect(() => {
    fetchOrders();
  }, [activeTab, fetchOrders]);

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
    let supersededHandled = false;
    const beat = async () => {
      try {
        const res = await fetch("/api/kitchen/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceHash }),
        });
        // Single-active-session enforcement: the server returns 401 +
        // code "session_superseded" when another device has logged in
        // as this restaurant's kitchen. We show a one-time toast and
        // sign out so the customer sees "you've been signed out
        // because the kitchen was opened somewhere else", matching the
        // GloriaFood behaviour Luigi asked for (2026-06-02).
        if (res.status === 401 && !supersededHandled) {
          const body = await res.json().catch(() => null);
          if (body?.code === "session_superseded") {
            supersededHandled = true;
            try {
              window.alert(
                "This kitchen has been opened on another device — you've been signed out here. Sign back in if you need to use this device instead.",
              );
            } catch { /* SSR guard */ }
            try {
              const { signOut } = await import("next-auth/react");
              await signOut({ redirect: true, callbackUrl: "/kitchen/login" });
            } catch {
              window.location.href = "/kitchen/login";
            }
          }
        }
      } catch { /* network blip — try again next interval */ }
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
    // Default BOTH copies when the saved preferences aren't loaded. `printer
    // Settings` starts null and only fills in after the /printnode/settings
    // fetch — so a slow/failed fetch, the PWA offline shell, or simply no row
    // yet would otherwise make this fall through to "kitchen" and SILENTLY drop
    // the customer copy on auto-accept (manual "Both" is hardcoded, so it kept
    // working — exactly the split Luigi hit 2026-06-16). The DB default for
    // printKitchen/printCustomer is TRUE, so "unknown" must mean both, not
    // kitchen-only. Only an EXPLICIT false now suppresses a copy.
    const wantKitchen = printerSettings?.printKitchen ?? true;
    const wantCustomer = printerSettings?.printCustomer ?? true;
    const printType: "kitchen" | "customer" | "both" =
      wantKitchen && wantCustomer ? "both"
      : wantCustomer ? "customer"
      : "kitchen"; // chef always wants the ticket

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

  /** Direct LAN print for a RESERVATION receipt. Mirrors doPrintDirectOne
   *  but hits the parallel `/api/kitchen/print-job/reservation/[id]` route
   *  and uses the buildReservationReceipt[Lines] builders. Lets a kitchen
   *  on a direct-LAN-only printer setup get reservation receipts without
   *  configuring PrintNode. Luigi 2026-06-01 — full parity with order
   *  printing setup methods. */
  const doPrintDirectReservation = async (reservationId: string) => {
    if (!isNativePrinterAvailable()) throw new Error("Native plugin missing");
    const cfg = getDirectPrinterConfig();
    if (!cfg) throw new Error("Direct printer not configured");
    const res = await fetch(`/api/kitchen/print-job/reservation/${reservationId}?width=${cfg.paperWidth}`);
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

  /** Print receipts directly to the LAN printer, honoring the per-restaurant
   *  COPY COUNTS (PrinterSettings.kitchenCopies / customerCopies — the same
   *  "Print copies" the admin Receipts page sets) so the Order App matches the
   *  PrintNode path. "both" prints kitchen first (chef needs it ASAP) then
   *  customer. A short settle delay between consecutive jobs stops Star TSP
   *  printers dropping a job fired immediately after the previous one (the
   *  back-to-back buffer drop Luigi hit 2026-06-16). Copies default to 1 when
   *  settings haven't loaded (so the customer copy is never silently dropped);
   *  0 skips that type. */
  const doPrintDirect = async (orderId: string, type: "kitchen" | "customer" | "both" = "kitchen", opts?: { single?: boolean }) => {
    // opts.single → exactly ONE of each requested type. Manual reprints are
    // "extras" so they print a single copy; only the acceptance auto-print uses
    // the configured per-restaurant copy counts. Luigi 2026-06-16.
    const clampCopies = (n: number | null | undefined) =>
      opts?.single ? 1 : Math.min(Math.max(0, Math.round(Number(n ?? 1))), 5);
    const kN = type === "both" || type === "kitchen" ? clampCopies(printerSettings?.kitchenCopies) : 0;
    const cN = type === "both" || type === "customer" ? clampCopies(printerSettings?.customerCopies) : 0;
    const jobs: Array<"kitchen" | "customer"> = [];
    for (let i = 0; i < kN; i++) jobs.push("kitchen");
    for (let i = 0; i < cN; i++) jobs.push("customer");
    if (jobs.length === 0) return;
    try {
      for (let i = 0; i < jobs.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 600)); // settle between jobs
        await doPrintDirectOne(orderId, jobs[i]);
      }
      toast.success("Receipt printed ✓");
    } catch (err: any) {
      const reason = (err?.code || err?.message || "") as string;
      const copy = nativePrinterErrorCopy(reason);
      toast.error(copy);
      throw err;
    }
  };

  const doPrint = async (orderId: string, type: "kitchen" | "customer" | "both", opts?: { single?: boolean }) => {
    // Direct LAN printer takes precedence when configured. Falls back
    // to PrintNode only when direct printing isn't set up or fails.
    const direct = getDirectPrinterConfig();
    if (direct) {
      try {
        await doPrintDirect(orderId, type, opts);
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
      body: JSON.stringify({ type, orderId, single: opts?.single === true }),
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
    // For scheduled orders the customer already picked when they
    // want the order. The kitchen accept doesn't need a separate
    // prep-time input — we derive preparationTime as the minutes
    // between now and scheduledFor so downstream consumers (status
    // page ETA, customer email, auto-complete cron) keep working
    // exactly as they do for ASAP orders. If the scheduled time has
    // already passed (rare edge case where staff opens the prompt
    // late) we fall back to 20 min so the order still moves forward.
    // Luigi 2026-06-01 GloriaFood-parity.
    const order = orders.find((o) => o.id === prepModal);
    const scheduledForRaw = (order as any)?.scheduledFor as string | null | undefined;
    const scheduledAt = scheduledForRaw ? new Date(scheduledForRaw) : null;
    let prep: number;
    if (scheduledAt && Number.isFinite(scheduledAt.getTime())) {
      const minutes = Math.round((scheduledAt.getTime() - Date.now()) / 60_000);
      prep = minutes > 0 ? minutes : 20;
    } else {
      prep = parseInt(prepTime) || 20;
    }
    await updateStatus(prepModal, "accepted", { preparationTime: prep });
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
  // Both clear handlers now hit the server (Luigi 2026-06-02). The DB
  // owns the cleared flag (Order.clearedFromKitchenAt) so every device
  // that polls /api/kitchen/orders sees the same hidden set. Optimistic
  // local update + refresh keeps the UI snappy; the next poll
  // reconciles in case the server count differs.
  const callClear = async (tab: "all" | "complete", orderIds: string[]) => {
    if (orderIds.length === 0) return;
    try {
      const res = await fetch("/api/kitchen/orders/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Per-tab clear: hide these exact orders FROM THIS TAB ONLY. The
        // server sets the matching per-tab flag, so the same order stays
        // visible in the other tabs. (Luigi 2026-06-04)
        body: JSON.stringify({ tab, orderIds }),
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => null);
        if (body?.code === "session_superseded") {
          // Single-session enforcement caught this device — let the
          // heartbeat's signOut handler do the redirect work.
          return;
        }
        toast.error("Not signed in — please log in again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to clear orders.");
        return;
      }
      // Force a fresh fetch so the cleared rows disappear immediately
      // instead of waiting for the next 4s poll.
      fetchOrdersRef.current?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Network error clearing orders.");
    }
  };

  // `visible` = the orders currently shown in the tab being cleared. We only
  // ever clear THOSE (minus any still-pending order, which must be
  // accepted/rejected first), so a clear on one tab never touches another.
  // Per-tab booking clear — stamps the matching flag (all / complete /
  // reservations) so a walk-up booking disappears from THAT tab only, exactly
  // like an order's per-tab clear. Optimistic + server, with the same
  // stale-session handling as the order clear. Luigi 2026-06-08.
  const callClearReservations = (tab: "all" | "complete" | "reservations", ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const stamp = new Date().toISOString();
    const patch =
      tab === "all"      ? { clearedFromAllAt: stamp } :
      tab === "complete" ? { clearedFromCompleteAt: stamp } :
                           { clearedFromReservationsAt: stamp };
    setReservations((prev) =>
      prev.map((r) => (idSet.has(r.id) ? { ...r, ...patch } : r)),
    );
    (async () => {
      try {
        const res = await fetch("/api/kitchen/reservations/clear", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reservationIds: ids, tab }),
        });
        if (res.status === 401) {
          const body = await res.json().catch(() => null);
          if (body?.code === "session_superseded") return;
          toast.error("Not signed in — please log in again.");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          toast.error(body?.error ?? "Failed to clear reservations.");
          return;
        }
        fetchOrdersRef.current?.();
      } catch (e: any) {
        toast.error(e?.message ?? "Network error clearing reservations.");
      }
    })();
  };

  const handleClearOrders = (visible: Order[]) => {
    const eligible = visible.filter(
      (o) => o.status !== "pending" && !(o as any).clearedFromAllAt,
    );
    // Walk-up bookings shown in the All tab clear too — but NOT pending ones,
    // which (like a pending order) still need an accept/decline first.
    const resvIds = allTabReservations.filter((r) => r.status !== "pending").map((r) => r.id);
    if (eligible.length === 0 && resvIds.length === 0) {
      toast.error(
        "Nothing to clear — pending orders must be Accepted or Rejected first.",
      );
      setClearConfirm(null);
      return;
    }
    setSelectedId(null);
    setClearConfirm(null);
    setAcknowledged(true); // silence any stale bell from prior cleared-pending bug
    if (eligible.length > 0) callClear("all", eligible.map((o) => o.id));
    callClearReservations("all", resvIds);
  };

  const handleClearComplete = (visible: Order[]) => {
    setSelectedId(null);
    setClearConfirm(null);
    const orderIds = visible.filter((o) => !(o as any).clearedFromCompleteAt).map((o) => o.id);
    if (orderIds.length > 0) callClear("complete", orderIds);
    callClearReservations("complete", completeTabReservations.map((r) => r.id));
  };

  // Clear the Reservations tab — hides those bookings from THIS tab only
  // (In Progress + All + Complete keep showing them). Mirrors the per-tab clear.
  const handleClearReservations = (visible: KitchenReservation[]) => {
    setClearConfirm(null);
    callClearReservations(
      "reservations",
      visible.filter((r) => !r.clearedFromReservationsAt).map((r) => r.id),
    );
  };

  // Tab data. PER-TAB clear (Luigi 2026-06-04): each tab hides only the
  // orders cleared FROM THAT TAB, so clearing one tab never empties another.
  // The In Progress tab has no clear button → no flag → always shows.
  const ordersTabItems = orders.filter((o) => !(o as any).clearedFromAllAt);
  // In-progress tab (Luigi 2026-06-02 v3, full GloriaFood parity):
  //
  //   Every order that was accepted TODAY stays in In Progress all day,
  //   even after its prep-time countdown hits 00:00. They only roll out
  //   when the next calendar day begins — at which point the natural
  //   "createdAt was today" filter excludes them and they move to the
  //   Complete tab. Rejected / cancelled orders never appear here.
  //
  //   This matches GloriaFood: a busy kitchen wants to keep glancing
  //   at "what came in today" without items vanishing mid-service.
  //
  //   Future-day scheduled orders also appear, grouped into the LATER
  //   section with a day-of-week chip (TUE / WED / THU…). When their
  //   day arrives the chip becomes a live HH:MM countdown.
  //
  //   Tracking mode keeps the unfiltered set (the kitchen is using the
  //   full state machine and decides themselves when to clear).
  const SHOWS_IN_PROGRESS_SIMPLE = ["accepted", "preparing", "ready", "completed"];
  const inProgressItems = (() => {
    const base = orders.filter(o =>
      workflowMode === "simple"
        // Manually moved to Ready/Complete → it has left In Progress (it now
        // lives in the Complete tab). Tracking mode ignores this flag.
        ? SHOWS_IN_PROGRESS_SIMPLE.includes(o.status) && !(o as any).manuallyClearedAt
        : IN_PROGRESS_STATUSES.includes(o.status),
    );
    if (workflowMode !== "simple") return base;
    const todayStart = (() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })();
    return base.filter(o => {
      const created = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      const scheduled = (o as any).scheduledFor ? new Date((o as any).scheduledFor).getTime() : NaN;
      // A future-scheduled order (any day) is always relevant in the
      // In Progress tab — it sits in LATER until its day arrives.
      if (!Number.isNaN(scheduled) && scheduled >= todayStart) return true;
      // An order that was accepted today stays visible all day,
      // including AFTER the auto-complete cron flips it to "completed"
      // — the kitchen wants to keep seeing today's work until tomorrow.
      if (!Number.isNaN(created) && created >= todayStart) return true;
      return false;
    });
  })();
  // Reservations the kitchen has already accepted (status confirmed or
  // seated). The In Progress tab shows these alongside accepted orders
  // grouped by TODAY / LATER. Pending reservations (not yet accepted)
  // stay in the All tab + Reservations tab so they aren't "in progress"
  // until the kitchen acts on them.
  // PRE-ORDER bookings (orderId set) are EXCLUDED here — they're represented by
  // their (flagged) order tile, so they don't double up as a second tile. They
  // still live in the dedicated Reservations tab. Luigi 2026-06-08.
  // DATE-GUARDED to today/tomorrow: the feed now keeps ~30 days of history for
  // the Reservations tab, but In Progress is the live floor view — a confirmed
  // booking from last week (never marked completed) must NOT linger here. Only
  // today's + tomorrow's active bookings are "in progress". Luigi 2026-06-08.
  const inProgressReservations = reservations.filter(
    r => !r.orderId && (r.status === "confirmed" || r.status === "seated")
      && (r.date === todayISO || r.date === tomorrowISO),
  );
  // Reservations tab list — the persistent ledger. Shows EVERY booking the feed
  // returns (all statuses, ~30 days + all future), hiding ONLY what staff
  // cleared FROM this tab (clearedFromReservationsAt). Nothing else removes a
  // booking from here. Sorted soonest-first for the floor view (the feed itself
  // comes back newest-first for safe truncation). Luigi 2026-06-08.
  const reservationsTabItems = reservations
    .filter((r) => !r.clearedFromReservationsAt)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
  // Walk-up bookings that belong in the All / Complete tabs — they appear there
  // alongside orders (a pre-order booking is already represented by its ORDER
  // tile, so orderId bookings are excluded). Each tab hides only what was
  // cleared FROM that tab, exactly like an order. Luigi 2026-06-08.
  const TERMINAL_RESERVATION_STATUSES = ["completed", "no_show", "cancelled", "rejected"];
  const allTabReservations = reservations.filter(
    (r) => !r.orderId && !r.clearedFromAllAt,
  );
  const completeTabReservations = reservations.filter(
    (r) => !r.orderId && TERMINAL_RESERVATION_STATUSES.includes(r.status) && !r.clearedFromCompleteAt,
  );
  // Complete tab visibility rule (Luigi 2026-06-02 spec):
  //   "Orders only show in Complete once they DISAPPEAR from In Progress
  //    — i.e. at end-of-day. When the clock goes 11:59 → 12:00, today's
  //    accepted/completed orders roll from In Progress into Complete and
  //    stay there until cleared. The only orders that stay in In Progress
  //    are the new day's orders and future scheduled orders."
  //
  // The auto-complete sweep still flips status accepted → completed at
  // +15min past estimatedReady so the customer-facing status page +
  // email reflect "ready/complete" in real time. But the kitchen tablet
  // visually keeps today's completed orders pinned in In Progress until
  // midnight, then they appear in Complete instead.
  //
  // Implementation: today's "completed" orders are excluded from the
  // Complete tab (they're already visible in In Progress per the same
  // todayStart gate above). Rejected + cancelled are terminal negative
  // states that have always belonged in Complete from the moment they
  // happen — Luigi's spec doesn't call those "active" — so they're
  // shown immediately regardless of date.
  const completeTodayStart = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const completeItems = orders.filter(o => {
    const manual = !!(o as any).manuallyClearedAt;
    // Show terminal statuses (completed / rejected / cancelled) OR anything the
    // kitchen MANUALLY moved to Ready/Complete (Simple mode) — the latter may
    // still be "ready" status but has left In Progress.
    if (!COMPLETE_STATUSES.includes(o.status) && !manual) return false;
    // Hide only what was cleared from the Complete tab itself.
    if ((o as any).clearedFromCompleteAt) return false;
    // A NON-manually-completed order (i.e. the end-of-day roll flipped it, not
    // staff) stays pinned in In Progress and OUT of Complete for as long as it
    // belongs to TODAY's In Progress view. "Belongs to today" is decided by the
    // order's OWN day — created today, or scheduled for today/later — NOT by
    // when the roll happened to flip it (the roll stamps completedAt = now, so
    // keying off completedAt would wrongly hide a prior-day order that rolled
    // this morning). Mirrors the inProgressItems gate so the two tabs never
    // disagree and an order can't fall between them. Manually-completed orders
    // skip this entirely — they appear in Complete immediately. Luigi 2026-06-08.
    if (workflowMode === "simple" && o.status === "completed" && !manual) {
      const created = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      const scheduled = (o as any).scheduledFor ? new Date((o as any).scheduledFor).getTime() : NaN;
      const belongsToToday =
        (!Number.isNaN(created) && created >= completeTodayStart) ||
        (!Number.isNaN(scheduled) && scheduled >= completeTodayStart);
      if (belongsToToday) return false;
    }
    return true;
  });

  const tabOrders: Order[] =
    activeTab === "orders" ? ordersTabItems :
    activeTab === "inprogress" ? inProgressItems :
    completeItems;

  // Rows ACTUALLY shown per tab (orders + the bookings that tab displays).
  // Feeds the clear-history button's "tab has content" gate below — NOT the
  // tab badges anymore.
  const tabCounts = {
    orders: ordersTabItems.length + allTabReservations.length,
    inprogress: inProgressItems.length + inProgressReservations.length,
    complete: completeItems.length + completeTabReservations.length,
    reservations: reservationsTabItems.length,
  };
  // Tab BADGE = "how many need attention", not the ledger size (Fabrizio
  // cmqaosva5 2026-06-12: "the number is only useful for In progress").
  // All / Complete are unbounded history ledgers — their row totals carry
  // no signal, so no badge. In Progress keeps its live-work count.
  // Reservations shows only bookings still awaiting confirmation — pending
  // walk-ups are NOT part of the In Progress bucket (it only holds
  // confirmed/seated), so this badge is that tab's one actionable cue.
  const tabBadges: Record<KTab, number> = {
    orders: 0,
    inprogress: tabCounts.inprogress,
    complete: 0,
    reservations: reservationsTabItems.filter((r) => r.status === "pending").length,
  };

  // pendingCount is declared above next to `alerting`.
  const selectedOrder = orders.find(o => o.id === selectedId) ?? null;
  const selectedReservation = reservations.find(r => r.id === selectedReservationId) ?? null;
  // Opening a reservation clears any open order detail (and vice-versa) so the
  // shared right-hand panel only ever shows one thing. Luigi 2026-06-08.
  // Tapping a booking: if it was placed WITH a food order (pre-order), open the
  // linked ORDER's full detail — food + a reservation banner, identical to the
  // All-orders tab — instead of the bare booking view. Walk-up bookings (no
  // order) open the reservation detail. Falls back to the reservation detail if
  // the linked order isn't in the current feed. Luigi 2026-06-08.
  const openReservation = (r: KitchenReservation) => {
    const linkedOrder = r.orderId ? orders.find((o) => o.id === r.orderId) : null;
    if (linkedOrder) {
      setSelectedId(linkedOrder.id);
      setSelectedReservationId(null);
    } else {
      setSelectedReservationId(r.id);
      setSelectedId(null);
    }
  };
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
    <div className={`h-[100dvh] flex flex-col overflow-hidden ${t.base}`}>
      {/* iOS "tap to enable sound" gate. iOS blocks audio until a user gesture,
          so an order arriving before staff tap anything would be SILENT. Tapping
          fires the window pointerdown unlock (resumes the AudioContext + primes
          the long-alert <audio>) and dismisses this. iOS-only — Android autoplays. */}
      {soundGateOpen && (
        <button
          type="button"
          onClick={() => setSoundGateOpen(false)}
          aria-label={tk("soundGateTitle")}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-gray-900/95 px-8 text-center select-none cursor-pointer"
        >
          <span className="flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 animate-pulse">
            <Bell className="w-12 h-12 text-white" />
          </span>
          <span className="text-white text-2xl font-bold">{tk("soundGateTitle")}</span>
          <span className="text-gray-300 text-base max-w-sm">{tk("soundGateSubtitle")}</span>
        </button>
      )}
      {/* TEMP alarm-state readout — gated to Luigi's restaurant only, to debug
          the iOS phantom-ring / delayed-ring. Codes (no prose, so no i18n):
          o=orders loaded, pend=ringing/total-pending, res=reservations/ringing,
          ring=alarm armed, long=looping ring, ack=silenced, au=audio unlocked,
          gate=sound-gate open, sync=secs since last successful poll. Remove after. */}
      {restaurant?.id === "cmp7xhd3900000al2jz0db5vi" && (
        <div
          className="fixed bottom-0 left-0 z-[300] bg-black/80 text-[10px] leading-tight font-mono text-emerald-300 px-2 py-0.5 pointer-events-none select-none"
          style={{ paddingBottom: "max(2px, env(safe-area-inset-bottom))" }}
        >
          {`o${orders.length} pend${pendingCount}/${orders.filter((o) => o.status === "pending").length} `}
          {`res${reservations.length}/${pendingReservationCount} ring${ringAudible ? 1 : 0} long${longRing ? 1 : 0} `}
          {`ack${acknowledged ? 1 : 0} au${audioUnlockedRef.current ? 1 : 0} gate${soundGateOpen ? 1 : 0} `}
          {`sync${lastSyncAt ? Math.round((nowMs - lastSyncAt) / 1000) : "-"}s`}
        </div>
      )}
      {/* ── Header ── */}
      <header
        className={`${t.header} px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between flex-shrink-0 gap-2`}
        // Clear the Android status bar / notch so the title + menu never clip
        // the "safe area" (Fabrizio feedback 2026-06-15).
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <ChefHat className="w-6 h-6 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className={`font-bold text-sm sm:text-base ${t.text} leading-tight truncate`}>{restaurant?.name ?? "Kitchen"}</div>
            {/* Subtitle hidden on phones — they're already on the kitchen page, the chef-hat
                + restaurant name is enough orientation. Frees ~14px vertical for the tabs. */}
            <div className={`text-xs ${t.muted} hidden sm:block`}>Kitchen Order App</div>
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

          {/* Quick-actions menu (Luigi 2026-06-15 header declutter) — the
              squished Test Order / Language / Log-out buttons now live behind a
              single 3-dot button, GloriaFood-style. The full in-depth settings
              hub moved to the bottom bar's gear. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQuickMenu((v) => !v)}
              className={`p-2 rounded-lg ${t.btn} ${t.muted}`}
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={showQuickMenu}
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showQuickMenu && (
              <>
                {/* click-away backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setShowQuickMenu(false)} aria-hidden="true" />
                <div className={`absolute right-0 mt-1.5 w-60 rounded-xl border ${t.border} ${t.modal} shadow-xl z-50 py-1.5`}>
                  <button
                    type="button"
                    onClick={() => { setShowQuickMenu(false); createTestOrder(); }}
                    disabled={testOrdering}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium ${t.text} hover:bg-gray-500/10 disabled:opacity-60 transition text-left`}
                  >
                    {testOrdering
                      ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      : <FlaskConical className="w-4 h-4 flex-shrink-0 text-amber-500" />}
                    <span>{tk("testOrder")}</span>
                  </button>
                  {(activeTab === "orders" || activeTab === "complete") && (
                    <button
                      type="button"
                      onClick={() => { setShowQuickMenu(false); setClearConfirm(activeTab === "orders" ? "orders" : "complete"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition text-left"
                    >
                      <Trash2 className="w-4 h-4 flex-shrink-0" />
                      <span>{tk("clearOrders")}</span>
                    </button>
                  )}
                  <div className={`my-1 border-t ${t.border}`} />
                  {/* Per-staff console language (kitchen tablets rarely touch admin). */}
                  <div className="px-3 py-1.5"><StaffLanguageSwitcher /></div>
                  {/* Dispatch-source toggle — self-hides unless the restaurant is on "both". */}
                  <DispatchModeToggle themeBtnClass={t.btn} />
                  <div className={`my-1 border-t ${t.border}`} />
                  <button
                    type="button"
                    onClick={() => { setShowQuickMenu(false); signOut({ callbackUrl: "/kitchen/login" }); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium ${t.text} hover:bg-gray-500/10 transition text-left`}
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <span>{tk("logOut")}</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
          {/* 3 tabs only (GloriaFood parity, Luigi 2026-06-15). The dedicated
              Reservations tab was removed — bookings still appear in All and In
              Progress exactly as before, so nothing is missed. */}
          {(["orders", "inprogress", "complete"] as KTab[]).map(tab => {
            const labels: Record<KTab, string> = {
              orders: tk("allOrders"),
              inprogress: tk("inProgress"),
              complete: tk("complete"),
              reservations: tk("reservations"),
            };
            const count = tabBadges[tab];
            const isActive = activeTab === tab;
            const styles = (themeMode === "dark" ? TAB_STYLES_DARK : TAB_STYLES_LIGHT)[tab];
            const Icon = styles.Icon;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-0 px-1.5 sm:px-5 py-2.5 sm:py-3 text-[11px] sm:text-[13px] font-medium flex items-center justify-center sm:justify-start gap-1 sm:gap-2 border-b-2 transition touch-manipulation cursor-pointer whitespace-nowrap ${
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

        {/* Clear history now lives in the top-right 3-dot menu (Luigi 2026-06-15).
            The always-visible trash button was removed so the tab bar stays clean. */}
      </div>

      {/* Render a reservation card, reused on both Reservations tab and Orders tab. */}
      {/* (defined as a const so the JSX below can reference it) */}

      {/* ── Reservations panel (replaces the order list when this tab is active) ──
          Split list + detail, same as the order tabs: tap a booking on the left
          to open its detail (with Accept / Reject / Seated / No-show) on the
          right. Luigi 2026-06-08. */}
      {/* Reservations tab — full-width list. Tapping a booking opens the
          full-screen detail overlay (rendered once, below). Luigi 2026-06-08. */}
      {/* ── Main content (orders / in-progress / complete) ──
          Full-width list. Tapping any order/reservation opens the full-screen
          detail overlay (rendered once, below) — no split view. Luigi 2026-06-08. */}
      <div className="flex-1 flex overflow-hidden">
        {/* Order list — full width */}
        <div className="flex flex-col w-full overflow-y-auto">
          {/* Unified order + reservation list (Luigi 2026-06-01 v3,
              GloriaFood parity).

              ALL tab        — orders + ALL reservations, interleaved
                                strictly by arrival time (createdAt
                                desc, newest first). Reservations no
                                longer pin to the top; they appear in
                                the order the kitchen received them,
                                same as orders.

              IN PROGRESS tab — accepted orders + accepted
                                (confirmed/seated) reservations +
                                future-scheduled orders. Split into
                                TODAY and LATER groups (matching
                                GloriaFood's KDS layout). Inside each
                                group, sort by due time ascending —
                                soonest first — so the next thing
                                that needs attention is on top. LATER
                                items get a tiny day-of-week chip
                                (MON/TUE/…) below the item icon.

              COMPLETE tab    — orders only, newest first. No
                                reservation merge (reservations don't
                                hit a "complete" state worth showing
                                here yet).
          */}
          {(() => {
            // ── Helpers ────────────────────────────────────────────
            const dueTimeOfOrder = (o: Order): number => {
              const scheduled = (o as any).scheduledFor ? new Date((o as any).scheduledFor).getTime() : NaN;
              if (!Number.isNaN(scheduled)) return scheduled;
              const ready = (o as any).estimatedReady ? new Date((o as any).estimatedReady).getTime() : NaN;
              if (!Number.isNaN(ready)) return ready;
              const created = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
              return created;
            };
            const dueTimeOfReservation = (r: KitchenReservation): number => {
              const ts = new Date(`${r.date}T${r.time}:00`).getTime();
              return Number.isNaN(ts) ? Date.now() : ts;
            };
            const startOfDay = (ms: number) => {
              const d = new Date(ms);
              return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            };
            const nowMs = now > 0 ? now : Date.now();
            const todayStartMs = startOfDay(nowMs);
            const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000;

            type Mixed =
              | { kind: "order"; sortTs: number; order: Order }
              | { kind: "reservation"; sortTs: number; r: KitchenReservation };

            // ── ALL tab: orders + walk-up bookings, chronological ─
            // Walk-up table bookings appear here alongside orders, just like a
            // regular order, and are cleared by THIS tab's trash button (their
            // clearedFromAllAt flag). Pre-order bookings are already represented
            // by their ORDER tile, so they're excluded from allTabReservations.
            // Luigi 2026-06-08.
            if (activeTab === "orders") {
              const items: Mixed[] = [];
              for (const o of tabOrders) {
                const arrived = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
                items.push({ kind: "order", sortTs: arrived, order: o });
              }
              for (const r of allTabReservations) {
                // Sort by arrival (createdAt), not the booking date — otherwise a
                // booking for next week jumps to the top of "newest first".
                const arrived = r.createdAt ? new Date(r.createdAt).getTime() : Date.now();
                items.push({ kind: "reservation", sortTs: arrived, r });
              }
              items.sort((a, b) => b.sortTs - a.sortTs);

              if (items.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-20 ${t.muted}`}>
                    <Package className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">{tk("noOrders")}</p>
                  </div>
                );
              }
              return items.map((it) => renderRow(it));
            }

            // ── IN PROGRESS tab: TODAY / LATER groups ─────────────
            if (activeTab === "inprogress") {
              const items: Mixed[] = [];
              for (const o of tabOrders) {
                items.push({ kind: "order", sortTs: dueTimeOfOrder(o), order: o });
              }
              for (const r of inProgressReservations) {
                items.push({ kind: "reservation", sortTs: dueTimeOfReservation(r), r });
              }
              const today: Mixed[] = [];
              const later: Mixed[] = [];
              for (const it of items) {
                if (it.sortTs < tomorrowStartMs) today.push(it);
                else later.push(it);
              }
              // Soonest first inside each group — matches GloriaFood.
              today.sort((a, b) => a.sortTs - b.sortTs);
              later.sort((a, b) => a.sortTs - b.sortTs);

              if (today.length === 0 && later.length === 0) {
                return (
                  <div className={`flex flex-col items-center justify-center py-20 ${t.muted}`}>
                    <Package className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">{tk("noOrders")}</p>
                  </div>
                );
              }
              const sectionHeader = (label: string) => (
                <div
                  key={`hdr-${label}`}
                  className={`px-4 py-1.5 text-[10px] font-bold tracking-widest ${t.muted} ${
                    themeMode === "dark" ? "bg-gray-900/40" : "bg-gray-50"
                  } border-b ${t.border}`}
                >
                  {label}
                </div>
              );
              // Chip / countdown rendered UNDER the icon (Luigi 2026-06-02
              // GloriaFood parity). Three shapes:
              //
              //   - Future day (LATER) → day-of-week abbreviation
              //     (MON / TUE / WED…). When the day arrives the item
              //     falls into the today bucket and the chip flips to
              //     a live HH:MM countdown.
              //
              //   - Same-day, > 1 hour out → "HH:MM" (e.g. 03:24).
              //   - Same-day, ≤ 1 hour out → "MM:SS" (e.g. 14:31).
              //   - Past the due time → "00:00" (stays visible, doesn't
              //     vanish; the order remains in In Progress all day).
              //
              // The chip text is what gets passed via OrderRow's dayChip
              // prop (the prop name is kept for back-compat — the
              // component decides styling based on whether the first
              // character is a digit, so a countdown reads in neutral
              // grey and a day chip reads in sky-blue).
              const chipFor = (sortTs: number): string | undefined => {
                if (!Number.isFinite(sortTs)) return undefined;
                // > 24h away → weekday name ("Thursday"); ≤ 24h → unambiguous
                // hours/minutes countdown. Single source: formatDueLabel.
                return formatDueLabel(sortTs, nowMs, locale).text;
              };
              return (
                <>
                  {today.length > 0 && sectionHeader(tk("today") || "TODAY")}
                  {today.map((it) => renderRow(it, chipFor(it.sortTs), false))}
                  {later.length > 0 && sectionHeader(tk("later") || "LATER")}
                  {later.map((it) => renderRow(it, chipFor(it.sortTs), false))}
                </>
              );
            }

            // ── COMPLETE tab: finished orders + finished bookings ─────
            // Finished WALK-UP bookings (completed / no-show / cancelled /
            // rejected) appear here alongside completed orders and are cleared
            // by THIS tab's trash button (their clearedFromCompleteAt flag).
            // Pre-orders show as their order tile. Luigi 2026-06-08.
            const items: Mixed[] = [];
            for (const o of tabOrders) {
              const arrived = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();
              items.push({ kind: "order", sortTs: arrived, order: o });
            }
            for (const r of completeTabReservations) {
              const arrived = r.createdAt ? new Date(r.createdAt).getTime() : Date.now();
              items.push({ kind: "reservation", sortTs: arrived, r });
            }
            items.sort((a, b) => b.sortTs - a.sortTs);
            if (items.length === 0) {
              return (
                <div className={`flex flex-col items-center justify-center py-20 ${t.muted}`}>
                  <Package className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">{tk("noOrders")}</p>
                </div>
              );
            }
            return items.map((it) => renderRow(it));

            // ── Row renderer (shared) ─────────────────────────────
            //
            // hideZeroCountdown defaults to the tab semantics Luigi
            // 2026-06-02 asked for: All + Complete tabs hide the
            // right-side countdown once it reaches 00:00 (GloriaFood
            // parity — past-due rows show no timer). In Progress
            // explicitly opts in to keeping the locked-at-zero display
            // so the kitchen can glance at the row and see it's at
            // its promised time — styled quietly (no red highlight,
            // no "overdue" label) per Luigi's polish.
            function renderRow(it: Mixed, dayChip?: string, hideZeroCountdown = true) {
              if (it.kind === "order") {
                return (
                  <OrderRow
                    key={`o-${it.order.id}`}
                    order={it.order}
                    selected={selectedId === it.order.id}
                    onClick={() => {
                      // Clicking any order — including a new/ringing pending one
                      // — opens it in the right detail panel. The Accept / Reject
                      // buttons live IN that panel; the prep-time modal only
                      // appears after the staff taps Accept (and the reject-reason
                      // modal after Reject). Luigi 2026-06-08: no more pop-up the
                      // instant you click a new order.
                      setSelectedId(it.order.id);
                      setSelectedReservationId(null);
                    }}
                    t={t}
                    now={now}
                    dayChip={dayChip}
                    hideZeroCountdown={hideZeroCountdown}
                    currency={moneyCurrency}
                  />
                );
              }
              return (
                <ReservationCard
                  key={`r-${it.r.id}`}
                  r={it.r}
                  t={t}
                  hoursFormat={hoursFmt}
                  onOpen={openReservation}
                  selected={selectedReservationId === it.r.id}
                  compact
                  dayChip={dayChip}
                  now={now}
                />
              );
            }
          })()}
        </div>

      </div>

      {/* ── Bottom bar (Luigi 2026-06-15, GloriaFood parity) ──
          Orders (back to the list / closes any open detail) + Settings (the
          full in-depth hub: pause services, item availability, sound, printer,
          day/night, end-of-day). flex-shrink-0 keeps it pinned at the bottom;
          safe-area-inset-bottom clears the Android nav bar. The Settings icon
          turns amber when a service is paused. */}
      <nav
        className={`flex-shrink-0 flex items-center justify-around border-t ${t.border} ${t.header}`}
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => { setSelectedId(null); setSelectedReservationId(null); }}
          className="flex flex-col items-center gap-0.5 px-8 py-2 text-orange-500"
          aria-label="Orders"
          title="Orders"
        >
          <ClipboardList className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => setShowStatusModal(true)}
          className={`relative flex flex-col items-center gap-0.5 px-8 py-2 ${anyServicePaused ? "text-amber-500" : t.muted}`}
          aria-label="Settings"
          title="Pause services, item availability, sound, day/night, printer, end-of-day"
        >
          <Settings className="w-6 h-6" />
          {anyServicePaused && <span className="absolute top-1 right-6 w-2 h-2 rounded-full bg-amber-500" />}
        </button>
      </nav>

      {/* ── Full-screen order / reservation detail overlay ──
          Tapping any tile (in any tab) opens its detail FULL-SCREEN over the
          tabs + list, with a back button in the detail header — instead of a
          side-by-side split. Shared by every tab. z-40 so the Accept/prep modal
          (z-50) still layers on top. Luigi 2026-06-08. */}
      {(selectedOrder || selectedReservation) && (
        <div className={`fixed inset-0 z-40 ${t.surface}`}>
          {selectedOrder ? (
            <OrderDetail
              order={selectedOrder}
              t={t}
              onClose={() => setSelectedId(null)}
              onUpdate={async (id, status, extra) => {
                if (status === "accepted") setPrepModal(id);
                else await updateStatus(id, status, extra);
              }}
              // Manual reprint from the order detail = a single extra of each
              // requested type (auto-print on accept already did the full count).
              onPrint={(id, type) => doPrint(id, type, { single: true })}
              printerReady={printerReady}
              workflowMode={workflowMode}
              currency={moneyCurrency}
              fromInProgress={activeTab === "inprogress"}
              hoursFormat={hoursFmt}
              onReservationStatusChange={updateReservationStatus}
            />
          ) : selectedReservation ? (
            <ReservationDetail
              r={selectedReservation}
              t={t}
              hoursFormat={hoursFmt}
              currency={moneyCurrency}
              onStatusChange={updateReservationStatus}
              onPrint={printReservation}
              onClose={() => setSelectedReservationId(null)}
            />
          ) : null}
        </div>
      )}

      {/* ── Accept modal ──
          Two shapes depending on whether the order is scheduled:
            - ASAP order   → prep-time picker (kitchen tells the
                              customer "we'll have it ready in N min")
            - Scheduled order → no prep input; show the customer's
                              chosen pickup/delivery date+time and
                              just confirm. The scheduled time IS
                              the ready time, so staff doesn't need
                              to re-decide. Luigi 2026-06-01: GloriaFood
                              parity — scheduled orders should accept
                              for their chosen slot with one tap.
      */}
      {prepModal && (() => {
        const order = orders.find((o) => o.id === prepModal);
        const scheduledForRaw = (order as any)?.scheduledFor as string | null | undefined;
        const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : null;
        const isScheduled = scheduledFor !== null && Number.isFinite(scheduledFor.getTime());
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${t.modal} rounded-2xl w-full max-w-sm p-6`}>
            <h3 className={`text-xl font-bold ${t.text} mb-4`}>
              {isScheduled ? "Confirm Scheduled Order" : "Accept Order"}
            </h3>

            {isScheduled ? (
              <>
                {/* Scheduled-order accept — no prep-time input. The
                    customer already picked when they want it. Show
                    that prominently so staff knows what they're
                    confirming. */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                    Scheduled for
                  </div>
                  <div className="text-lg font-bold text-emerald-900 leading-tight">
                    {scheduledFor!.toLocaleString(locale || undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      // Respect the restaurant's 12h/24h preference instead of the
                      // OS locale default. Use hourCycle (not hour12) so midnight
                      // reads "12:00 AM", not "0:00 am", on locales whose 12h cycle
                      // defaults to h11. Luigi 2026-06-08 / 2026-06-14.
                      hourCycle: hoursFmt === "12h" ? "h12" : "h23",
                    })}
                  </div>
                </div>
                <p className={`text-xs ${t.muted} mb-4`}>
                  The customer chose this time at checkout. Confirming locks it in for the kitchen.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}

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
                <CheckCircle className="w-4 h-4 inline mr-1.5" />
                {isScheduled ? "Confirm" : "Confirm"}
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
        );
      })()}

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
          onConfirm={() => handleClearOrders(ordersTabItems)}
          onCancel={() => setClearConfirm(null)}
        />
      )}
      {clearConfirm === "complete" && (
        <ConfirmModal
          t={t}
          title="Clear Completed History"
          message="Remove the completed orders shown in the Complete tab? Orders pinned in the In Progress tab are not affected. This cannot be undone."
          confirmLabel="Yes, Clear History"
          onConfirm={() => handleClearComplete(completeItems)}
          onCancel={() => setClearConfirm(null)}
        />
      )}
      {clearConfirm === "reservations" && (
        <ConfirmModal
          t={t}
          title="Clear Reservations"
          message="Remove the reservations shown in the Reservations tab? Bookings still awaiting acceptance remain in the In Progress tab. This cannot be undone."
          confirmLabel="Yes, Clear"
          onConfirm={() => handleClearReservations(reservationsTabItems)}
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
              <h3 className={`text-lg font-bold ${t.text}`}>{tk("soundTitle")}</h3>
            </div>
            <p className={`text-sm ${t.muted} mb-5`}>
              {tk("soundDesc")}
            </p>

            {/* Sound picker. The 3rd "Custom Sound" option is only
                rendered when the owner uploaded a file in /admin/profile
                — otherwise the picker stays 2-wide (GloriaFood + Classic
                Bell). Each option is exclusive — picking one means the
                others never play, even on load failure. */}
            <div className="mb-5">
              <label className={`text-sm font-semibold ${t.text} block mb-2`}>
                {tk("soundPickerLabel")}
              </label>
              <div className={`grid gap-2 ${customSoundUrl ? "grid-cols-3" : "grid-cols-2"}`}>
                {([
                  {
                    id: "gloriafood",
                    label: "GloriaFood Ding",
                    sub: tk("soundGloriaSub"),
                  },
                  {
                    id: "synth",
                    label: tk("soundClassic"),
                    sub: tk("soundClassicSub"),
                  },
                  ...(customSoundUrl ? [{
                    id: "custom" as const,
                    label: tk("soundCustom"),
                    sub: tk("soundCustomSub"),
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
                  ? tk("soundCustomReplaceHint")
                  : tk("soundCustomUploadHint")}
                {" "}{tk("soundPreviewHint")}
              </p>
            </div>

            {/* Volume slider */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-semibold ${t.text}`}>{tk("soundVolume")}</label>
                <span className={`text-sm font-mono ${t.muted}`}>
                  {alertMuted ? tk("soundMuted") : `${Math.round(alertVolume * 100)}%`}
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
                  { label: tk("soundMax"), v: 1.0 },
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
                <span>{tk("soundLowWarn")}</span>
              </div>
            )}
            {(alertMuted || alertVolume === 0) && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-600 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{tk("soundOffWarn")}</span>
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
                <VolumeX className="w-4 h-4" /> {tk("soundSilence")}
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
                <><VolumeX className="w-4 h-4" /> {tk("soundMutedTap")}</>
              ) : (
                <><Volume2 className="w-4 h-4" /> {tk("soundOnTap")}</>
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
              <Bell className="w-4 h-4" /> {tk("soundTest")}
            </button>

            <button
              onClick={() => setShowSoundSettings(false)}
              className={`w-full ${t.btn} py-2.5 rounded-xl font-semibold text-sm transition`}
            >
              {tk("soundDone")}
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

      <RestaurantStatusModal
        open={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        acceptsPickup={!!(restaurant as any)?.acceptsPickup}
        acceptsDelivery={!!(restaurant as any)?.acceptsDelivery}
        acceptsDineIn={!!(restaurant as any)?.acceptsDineIn}
        acceptsCatering={!!(restaurant as any)?.acceptsCatering}
        acceptsTakeOut={!!(restaurant as any)?.acceptsTakeOut}
        acceptsReservations={!!(restaurant as any)?.acceptsReservations}
        pausedUntilByService={restaurantPauses}
        onChange={refreshRestaurantPauses}
        currency={moneyCurrency}
        // Preferences-tab plumbing (Luigi 2026-06-02 header declutter).
        // Each callback closes this modal then opens the corresponding
        // dedicated sub-modal — the originals still exist, we just
        // route to them from one centralised hub.
        themeMode={themeMode}
        onToggleTheme={() => setThemeMode((m) => (m === "light" ? "dark" : "light"))}
        onRefresh={fetchOrders}
        onOpenSound={() => setShowSoundSettings(true)}
        onOpenPrinter={() => {
          if (isNativePrinterAvailable()) setShowDirectPrinterSetup(true);
          else if (printNodeEnabled) setShowPrinterSetup(true);
          else setShowDirectPrinterSetup(true);
        }}
        onOpenDayReport={() => setShowEndOfDayModal(true)}
        alertMuted={alertMuted}
        alertVolume={alertVolume}
        printerReady={printerReady}
        printerLabel={printerLabel}
      />

      <EndOfDayModal
        open={showEndOfDayModal}
        onClose={() => setShowEndOfDayModal(false)}
        themeMode={themeMode}
        currency={(restaurant as any)?.currency ?? "usd"}
        onPrint={async ({ lines, width }) => {
          // Prefer the direct LAN Star printer path (matches reservation /
          // order printing). PrintNode fallback isn't wired for the EoD
          // layout yet — owners with PrintNode-only setups can still
          // glance at the on-screen numbers and print from
          // /admin/reports/end-of-day in the browser.
          const direct = getDirectPrinterConfig();
          if (!direct) {
            throw new Error(
              "Direct LAN printer not configured. Open Printer Setup on the kitchen tablet to connect.",
            );
          }
          const paperWidthDots = width === 58 ? 384 : 576;
          await nativePrint({
            ip: direct.ip,
            port: direct.port,
            // Empty bytes string — Star printers use the structured
            // `lines` path; the native bridge requires the field to
            // be present even when it's not used.
            bytes: "",
            lines: lines as any,
            paperWidthDots,
            timeoutMs: 15000,
          });
        }}
      />


      {/* First-run guided tour. Renders nothing if the operator has
          previously skipped or completed it on this device for this
          restaurant. Scoped per restaurant.id so chain staff who pick
          a different location see the tour fresh. */}
      <KitchenFirstRunTour restaurantId={restaurant?.id ?? null} />
    </div>
  );
}
