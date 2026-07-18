"use client";
import { useTranslations } from "next-intl";

/**
 * Delivery status chip for the RESTAURANT shell (v1.1 Phase 7) — covers the
 * FULL assignment status vocabulary, live + terminal (queued … cancelled).
 *
 * ONE map, used by the Dispatch tab rows, the Deliveries tab (In-progress AND
 * Completed rows), and the delivery detail overlay, so the three surfaces can
 * never disagree on a status's color or label (the drift the Phase 7 review
 * flagged: three hand-copied maps + a Completed-list `cancelled` chip that
 * fell through to the raw enum string).
 *
 * Labels come from admin.feefreeDelivery st_* keys — the same namespace as
 * the desktop /admin/delivery/pool panel (plan §6), translated ×38 including
 * st_cancelled. The DRIVER-side TerminalStatusChip (feefreeShared timeline*
 * keys) is intentionally separate: driver History never shows `cancelled`
 * (its route excludes it) and its rendering must not change.
 */

const CHIP_STYLES: Record<string, string> = {
  queued: "bg-gray-600/40 text-gray-300",
  assigned: "bg-blue-500/15 text-blue-400",
  accepted: "bg-amber-500/15 text-amber-400",
  started: "bg-amber-500/15 text-amber-400",
  picked_up: "bg-emerald-500/15 text-emerald-400",
  out_for_delivery: "bg-emerald-500/15 text-emerald-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-rose-500/15 text-rose-400",
  returned: "bg-gray-600/40 text-gray-300",
  cancelled: "bg-gray-600/40 text-gray-300",
};

const STATUS_KEY: Record<string, string> = {
  queued: "st_queued",
  assigned: "st_assigned",
  accepted: "st_accepted",
  started: "st_started",
  picked_up: "st_enroute",
  out_for_delivery: "st_enroute",
  delivered: "st_delivered",
  failed: "st_failed",
  returned: "st_returned",
  cancelled: "st_cancelled",
};

export function DeliveryStatusChip({ status }: { status: string }) {
  const t = useTranslations("admin.feefreeDelivery");
  const key = STATUS_KEY[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        CHIP_STYLES[status] ?? "bg-gray-600/40 text-gray-300"
      }`}
    >
      {key ? t(key) : status}
    </span>
  );
}
