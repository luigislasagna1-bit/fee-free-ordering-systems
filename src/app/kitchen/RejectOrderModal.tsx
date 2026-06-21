"use client";
import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { T, Order } from "./kitchen-types";

/**
 * Shared "reject order" modal — used from both:
 *
 *   1. The Accept Order prep-time prompt in KitchenDisplay (so an owner
 *      can choose to reject without first dismissing the prompt and
 *      hunting for the red button below).
 *   2. The Reject button inside OrderDetail.
 *
 * Behavior: presents a curated list of 7 friendly reasons + an "Other"
 * option that switches to a free-text textarea. The chosen text is what
 * gets emailed to the customer, so we keep the language human and
 * non-blamey. When the order was paid online, an amber refund banner
 * appears — the PATCH route auto-refunds on rejected (commit 1d1aeb2).
 */

const REJECT_REASON_KEYS = [
  "tooBusy",
  "closingSoon",
  "outOfItem",
  "outsideDeliveryArea",
  "kitchenClosed",
  "duplicateOrder",
  "paymentIssue",
  "other",
] as const;

export function RejectOrderModal({
  open,
  order,
  t,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: Order | null;
  t: T;
  onClose: () => void;
  /** Resolved reason string; parent calls updateStatus(...,"rejected",{rejectionReason}). */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const tk = useTranslations("kitchen");
  const tCommon = useTranslations("common");
  const tReasons = useTranslations("kitchen.rejectReasons");

  const [reasonKey, setReasonKey] = useState<string>("");
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset state every time the modal re-opens — otherwise an owner who
  // half-fills one rejection and cancels would see their stale text on
  // the next reject.
  useEffect(() => {
    if (open) {
      setReasonKey("");
      setCustomText("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const willRefund =
    !!order && order.paymentMethod === "card" && order.paymentStatus === "paid";

  const resolvedReason =
    reasonKey === "other"
      ? customText.trim()
      : reasonKey
        ? tReasons(reasonKey)
        : "";
  const disabled = busy || !resolvedReason;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(resolvedReason);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
      <div className={`${t.modal} rounded-2xl w-full max-w-md p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className={`text-lg font-bold ${t.text}`}>{tk("reject")}</h3>
          <button onClick={onClose} className={`p-1 rounded-lg ${t.btn}`} aria-label={tCommon("close")}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className={`text-sm ${t.muted} mb-3`}>{tk("rejectReasonPrompt")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {REJECT_REASON_KEYS.map((k) => {
            const selected = reasonKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setReasonKey(k);
                  if (k !== "other") setCustomText("");
                }}
                className={`text-left text-sm px-3 py-2.5 rounded-xl border-2 transition font-medium ${
                  selected
                    ? "border-red-500 bg-red-500/10 text-red-600 font-bold"
                    : `${t.border} ${t.muted} hover:${t.text}`
                }`}
              >
                {tReasons(k)}
              </button>
            );
          })}
        </div>

        {reasonKey === "other" && (
          <div className="mb-3">
            <label className={`text-xs ${t.muted} block mb-1.5 font-semibold uppercase tracking-wider`}>
              {tk("rejectReasonCustomLabel")}
            </label>
            <textarea
              autoFocus
              rows={3}
              maxLength={500}
              placeholder={tk("rejectReasonCustomPlaceholder")}
              className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-red-500`}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </div>
        )}

        {willRefund && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{tk("rejectRefundNotice")}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-sm transition"
          >
            {busy ? tCommon("loading") : tk("rejectConfirm")}
          </button>
          <button
            onClick={onClose}
            className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}
          >
            {tCommon("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
