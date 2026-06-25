"use client";
import { useState } from "react";
import { ToggleLeft, ToggleRight, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { KitchenWorkflowToggle } from "../orders/KitchenWorkflowToggle";

interface Initial {
  autoAcceptOrders: boolean;
  allowScheduledOrders: boolean;
  requireScheduledOrders: boolean;
  showServiceTimesOnOrderPage: boolean;
  pickupEta: number;
  deliveryEta: number;
  // Relocated from /admin/settings (Luigi 2026-06-22).
  workflowMode: "simple" | "tracking";
  autoCallOnNewOrder: boolean;
  alertPhone: string | null;
  storePhone: string | null;
}

/**
 * "Order Handling" (Taking Orders) — how new orders are confirmed + when customers
 * may schedule them. Relocated from the cluttered Services page. Each toggle
 * auto-saves on click (optimistic + revert-on-failure), mirroring the Notifications
 * page; no "Save Changes" button. Persists via PATCH /api/admin/order-handling.
 * Luigi 2026-06-22.
 */
export function OrderHandlingClient({ initial, twilioVoiceConfigured }: { initial: Initial; twilioVoiceConfigured: boolean }) {
  const t = useTranslations("admin.orderHandling");
  const tToasts = useTranslations("admin.toasts");
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(initial.autoAcceptOrders);
  const [allowScheduledOrders, setAllowScheduledOrders] = useState(initial.allowScheduledOrders);
  const [requireScheduledOrders, setRequireScheduledOrders] = useState(initial.requireScheduledOrders);
  const [showServiceTimes, setShowServiceTimes] = useState(initial.showServiceTimesOnOrderPage);

  const patch = async (field: string, value: boolean, revert: () => void) => {
    try {
      const res = await fetch("/api/admin/order-handling", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      revert();
      toast.error(tToasts("saveFailed"));
    }
  };

  const toggleAutoAccept = () => {
    const next = !autoAcceptOrders;
    setAutoAcceptOrders(next);
    patch("autoAcceptOrders", next, () => setAutoAcceptOrders(!next));
  };
  const toggleScheduled = () => {
    const next = !allowScheduledOrders;
    setAllowScheduledOrders(next);
    patch("allowScheduledOrders", next, () => setAllowScheduledOrders(!next));
  };
  const toggleHideAsap = () => {
    const next = !requireScheduledOrders;
    setRequireScheduledOrders(next);
    patch("requireScheduledOrders", next, () => setRequireScheduledOrders(!next));
  };
  const toggleServiceTimes = () => {
    const next = !showServiceTimes;
    setShowServiceTimes(next);
    patch("showServiceTimesOnOrderPage", next, () => setShowServiceTimes(!next));
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* Auto-accept incoming orders */}
      <div className={`bg-white rounded-2xl border shadow-sm p-5 ${autoAcceptOrders ? "border-emerald-200" : "border-gray-100"}`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${autoAcceptOrders ? "bg-emerald-50" : "bg-gray-50"}`}>
            <Zap className={`w-5 h-5 ${autoAcceptOrders ? "text-emerald-500" : "text-gray-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{t("autoAcceptTitle")}</h3>
              {autoAcceptOrders && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{t("autoAcceptOn")}</span>}
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-lg">
              {t("autoAcceptHelp", { pickup: initial.pickupEta, delivery: initial.deliveryEta })}
            </p>
          </div>
          <button
            onClick={toggleAutoAccept}
            className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
            title={autoAcceptOrders ? t("disable") : t("enable")}
          >
            {autoAcceptOrders
              ? <ToggleRight className="w-8 h-8 text-emerald-500" />
              : <ToggleLeft className="w-8 h-8" />
            }
          </button>
        </div>
      </div>

      {/* Scheduled orders + Hide ASAP */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">{t("scheduledOrdersTitle")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("allowSchedulingHint")}</p>
          </div>
          <button
            onClick={toggleScheduled}
            className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
            title={allowScheduledOrders ? t("disable") : t("enable")}
          >
            {allowScheduledOrders ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>
        {allowScheduledOrders && (
          <div className="flex items-start justify-between gap-4 pt-3 border-t border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-700">{t("hideAsapTitle")}</div>
              <p className="text-xs text-gray-500 mt-0.5">{t("hideAsapHint")}</p>
            </div>
            <button
              onClick={toggleHideAsap}
              className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
              title={requireScheduledOrders ? t("disable") : t("enable")}
            >
              {requireScheduledOrders ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8" />}
            </button>
          </div>
        )}
      </div>

      {/* Ordering-page display — show/hide the per-service estimated times ("· 20 min")
          on the service buttons. Off → hidden on the order page, still shown at checkout.
          Fabrizio 2026-06-25. */}
      <div className={`bg-white rounded-2xl border shadow-sm p-5 ${showServiceTimes ? "border-emerald-200" : "border-gray-100"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">{t("showServiceTimesTitle")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("showServiceTimesHint")}</p>
          </div>
          <button
            onClick={toggleServiceTimes}
            className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
            title={showServiceTimes ? t("disable") : t("enable")}
          >
            {showServiceTimes ? <ToggleRight className="w-8 h-8 text-emerald-500" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>
      </div>

      <KitchenWorkflowToggle
        show={{ workflow: true, autoCall: true, printNode: false, vibrate: false, delivery: false, itemCategory: false }}
        initialMode={initial.workflowMode}
        initialAutoCall={initial.autoCallOnNewOrder}
        initialAlertPhone={initial.alertPhone}
        storePhone={initial.storePhone}
        twilioVoiceConfigured={twilioVoiceConfigured}
      />
    </div>
  );
}
