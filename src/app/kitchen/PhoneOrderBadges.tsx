"use client";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { phoneOrderPaymentState, type Order, type T } from "./kitchen-types";

/**
 * Nabil AI PHONE ORDER pill — pink, the "Phone (Nabil AI)" channel colour of
 * the Sales report (#ec4899). Shown on the order tile (list) AND in the
 * order-detail header next to MARKETPLACE, so staff can tell a phone order
 * from a web order at a glance. The screen twin of the printed "PHONE ORDER"
 * receipt banner. Luigi 2026-08-16.
 */
export function PhoneOrderBadge({ t }: { t: T }) {
  const tk = useTranslations("kitchen");
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${t.badgePhone}`}>
      {tk("phoneOrderBadge")}
    </span>
  );
}

/**
 * Payment-status chip for a PHONE ORDER — same semantics as the receipt banner
 * (see phoneOrderPaymentState): "PAID" (green) / "NOT PAID · $34.50 due at
 * pickup" (red, due = total − Reward Dollars) / any other Stripe state in its
 * generic tone. Phone orders are the ONLY unpaid tickets on an all-prepaid
 * rail, so the money cue must be impossible to miss. `size` bumps the detail
 * banner's copy up from the tile's 10px pill.
 */
export function PhoneOrderPaymentChip({
  order, currency, t, size = "sm",
}: {
  order: Pick<Order, "paymentStatus" | "total" | "creditApplied" | "type">;
  currency: string;
  t: T;
  size?: "sm" | "md";
}) {
  const tk = useTranslations("kitchen");
  const tTypes = useTranslations("receipt.orderTypesLower");
  const state = phoneOrderPaymentState(order);
  const sizing = size === "md" ? "text-sm px-3 py-1" : "text-[10px] px-2 py-0.5";
  if (state.kind === "paid") {
    return (
      <span className={`${sizing} font-bold rounded-full whitespace-nowrap ${t.badgePaid}`}>
        {tk("phoneOrderPaid")}
      </span>
    );
  }
  if (state.kind === "unpaid") {
    // Order type via the receipt's lowercase dictionary ("pickup" / "consegna"
    // / "Abholung"); an unfamiliar type falls back to the raw slug so the
    // chip still renders something rather than a missing-key marker.
    const type = tTypes.has(order.type) ? tTypes(order.type) : order.type.replace(/_/g, " ");
    // The longest chip on the tile — `max-w-full truncate` so a very narrow
    // column clips it with "…" instead of letting it run under the total.
    return (
      <span className={`${sizing} font-bold rounded-full whitespace-nowrap max-w-full truncate ${t.badgeUnpaid}`}>
        {tk("phoneOrderNotPaid", { amount: formatCurrency(state.due, currency), type })}
      </span>
    );
  }
  // Refunded / voided / failed / … — the generic tone map, uppercase label.
  const toneClass = {
    green:  t.badgePaid,
    blue:   "bg-blue-500/20 text-blue-600 dark:text-blue-300",
    yellow: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
    red:    t.badgeUnpaid,
    gray:   t.badgeCompleted,
  }[state.tone];
  return (
    <span className={`${sizing} font-bold rounded-full whitespace-nowrap ${toneClass}`}>
      {state.label}
    </span>
  );
}
