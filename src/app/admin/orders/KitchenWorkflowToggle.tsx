"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Zap, Activity, ChevronDown, ChevronUp, Info, Printer, ServerCrash, PhoneCall, Vibrate, User, Tag, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import { sanitizePhone } from "@/lib/phone";

/**
 * Kitchen workflow mode toggle for the Orders page.
 *
 * Lets the restaurant owner choose between two operating models:
 *
 *   SIMPLE  — GloriaFood-style. The kitchen just accepts (or rejects)
 *             orders. There's no Preparing/Ready/Complete tracking; the
 *             order stays in "In Progress" until end-of-day. This is
 *             the default — busy restaurants that don't have time to
 *             click through multiple statuses per order shouldn't have to.
 *
 *   TRACKING — Full state machine. Each order moves through Accepted →
 *              Preparing → Ready → (Out for delivery) → Complete with
 *              the kitchen tapping each transition. Customer gets a
 *              notification at each step. Best for slower-paced
 *              restaurants that want precise status updates.
 *
 * UX intent: this is a Major Setting. It changes how the entire kitchen
 * display behaves. So we show it as a collapsible card at the top of
 * the Orders page (visible but not always expanded), with explainer
 * copy on each option. Default collapsed once configured.
 */
export function KitchenWorkflowToggle({
  initialMode,
  initialPrintNodeEnabled = false,
  initialAutoCall = false,
  initialKitchenVibrate = true,
  initialDeliveryShowName = false,
  initialDeliveryLead = "name",
  initialShowItemCategory = false,
  storePhone = null,
  initialAlertPhone = null,
  twilioVoiceConfigured = true,
  show,
}: {
  initialMode: "simple" | "tracking";
  initialPrintNodeEnabled?: boolean;
  initialAutoCall?: boolean;
  /** Kitchen device alarm: vibrate alongside the ring (default true). */
  initialKitchenVibrate?: boolean;
  /** Prefix the customer name on delivery tiles (the address always shows;
   *  the old "also show address" sub-toggle was retired 2026-07-03). */
  initialDeliveryShowName?: boolean;
  /** Which line LEADS a delivery tile when both name + address show:
   *  "name" (default) = name bold on top, address lighter below; "address" =
   *  the reverse. Top stays bold/large, bottom lighter. Luigi 2026-07-03. */
  initialDeliveryLead?: "name" | "address";
  /** Show each dish's menu category on incoming orders (default false). */
  initialShowItemCategory?: boolean;
  /** The restaurant's public phone — the default alert target. */
  storePhone?: string | null;
  /** Optional dedicated alert number (overrides storePhone when set). */
  initialAlertPhone?: string | null;
  /** Whether platform Twilio VOICE creds exist; false ⇒ calls can't be placed. */
  twilioVoiceConfigured?: boolean;
  /** Which cards to render (each defaults true). The Order Handling page (Taking
   *  Orders) shows ONLY workflow + autoCall; the Settings page shows the rest.
   *  Luigi 2026-06-22. */
  show?: { workflow?: boolean; printNode?: boolean; autoCall?: boolean; vibrate?: boolean; delivery?: boolean; itemCategory?: boolean };
}) {
  const t = useTranslations("admin.kitchenWorkflowToggle");
  const sh = {
    workflow: show?.workflow ?? true,
    printNode: show?.printNode ?? true,
    autoCall: show?.autoCall ?? true,
    vibrate: show?.vibrate ?? true,
    delivery: show?.delivery ?? true,
    itemCategory: show?.itemCategory ?? true,
  };
  const [mode, setMode] = useState<"simple" | "tracking">(initialMode);
  const [printNodeEnabled, setPrintNodeEnabled] = useState<boolean>(initialPrintNodeEnabled);
  const [savingPrintNode, setSavingPrintNode] = useState(false);
  const [autoCall, setAutoCall] = useState<boolean>(initialAutoCall);
  const [savingAutoCall, setSavingAutoCall] = useState(false);
  const [alertPhone, setAlertPhone] = useState<string>(initialAlertPhone ?? "");
  const [savedAlertPhone, setSavedAlertPhone] = useState<string>(initialAlertPhone ?? "");
  const [savingAlertPhone, setSavingAlertPhone] = useState(false);
  // Live E.164 normalization of the typed alert number (Luigi 2026-07-03: the
  // field must refuse formats that can't be dialed, and SHOW what will be
  // dialed). null = undialable; "" = empty (allowed — falls back to store phone).
  const alertPhoneNormalized = alertPhone.trim() ? sanitizePhone(alertPhone) : "";
  const alertPhoneInvalid = alertPhone.trim() !== "" && alertPhoneNormalized === null;
  const [testingCall, setTestingCall] = useState(false);
  const [kitchenVibrate, setKitchenVibrate] = useState<boolean>(initialKitchenVibrate);
  const [savingVibrate, setSavingVibrate] = useState(false);
  const [deliveryShowName, setDeliveryShowName] = useState<boolean>(initialDeliveryShowName);
  const [savingDeliveryName, setSavingDeliveryName] = useState(false);
  const [deliveryLead, setDeliveryLead] = useState<"name" | "address">(initialDeliveryLead);
  const [savingDeliveryLead, setSavingDeliveryLead] = useState(false);
  const [showItemCategory, setShowItemCategory] = useState<boolean>(initialShowItemCategory);
  const [savingItemCategory, setSavingItemCategory] = useState(false);
  // The number the system will actually ring: dedicated alert number else store phone.
  const effectiveAlertNumber = (alertPhone.trim() || storePhone || "").trim();

  async function saveAlertPhone() {
    const v = alertPhone.trim();
    if (v === savedAlertPhone.trim()) return; // unchanged
    // Refuse undialable formats up front — the auto-call would silently do
    // nothing with a number sanitizePhone can't turn into E.164.
    if (v && sanitizePhone(v) === null) {
      toast.error(t("alertPhoneInvalidToast"));
      return;
    }
    setSavingAlertPhone(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertPhone: v }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSavedAlertPhone(v);
      toast.success(t("autoCallAlertPhoneSavedToast"));
    } catch {
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingAlertPhone(false);
    }
  }

  // Owner-triggered test of the missed-order auto-call: rings the saved alert
  // number now and reports Twilio's exact result, so they can verify it works
  // (and see why if it doesn't — e.g. an international number Twilio blocks).
  async function sendTestCall() {
    setTestingCall(true);
    try {
      const res = await fetch("/api/admin/test-alert-call");
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (data?.placed) {
        toast.success(t("testCallPlacedToast", { number: String(data.calledNumber ?? effectiveAlertNumber) }));
      } else {
        toast.error(t("testCallFailedToast", { reason: String(data?.reason ?? data?.error ?? "unknown") }));
      }
    } catch {
      toast.error(t("saveErrorToast"));
    } finally {
      setTestingCall(false);
    }
  }
  const [saving, setSaving] = useState(false);
  // Auto-expand when the choice is the non-default ("tracking") so an
  // existing customer who already picked tracking sees their setting
  // at a glance. Default-simple users see the card collapsed since
  // there's nothing they need to change.
  const [expanded, setExpanded] = useState(initialMode === "tracking");

  async function togglePrintNode(enabled: boolean) {
    setSavingPrintNode(true);
    setPrintNodeEnabled(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printNodeEnabled: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(
        enabled
          ? t("printNodeEnabledToast")
          : t("printNodeDisabledToast"),
      );
    } catch {
      setPrintNodeEnabled(!enabled);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingPrintNode(false);
    }
  }

  async function toggleAutoCall(enabled: boolean) {
    setSavingAutoCall(true);
    setAutoCall(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoCallOnNewOrder: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(enabled ? t("autoCallEnabledToast") : t("autoCallDisabledToast"));
    } catch {
      setAutoCall(!enabled);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingAutoCall(false);
    }
  }

  async function toggleVibrate(enabled: boolean) {
    setSavingVibrate(true);
    setKitchenVibrate(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenVibrate: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(enabled ? t("vibrateEnabledToast") : t("vibrateDisabledToast"));
    } catch {
      setKitchenVibrate(!enabled);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingVibrate(false);
    }
  }

  async function toggleDeliveryName(enabled: boolean) {
    setSavingDeliveryName(true);
    setDeliveryShowName(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenDeliveryShowName: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("displaySavedToast"));
    } catch {
      setDeliveryShowName(!enabled);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingDeliveryName(false);
    }
  }

  // toggleDeliveryBoth retired 2026-07-03 (Luigi): the delivery tile always
  // shows the address now — turning it off could leave a delivery order with
  // no address at all. Only the name prefix remains configurable.

  async function changeDeliveryLead(lead: "name" | "address") {
    if (lead === deliveryLead) return;
    setSavingDeliveryLead(true);
    const prev = deliveryLead;
    setDeliveryLead(lead); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenDeliveryLead: lead }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("displaySavedToast"));
    } catch {
      setDeliveryLead(prev);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingDeliveryLead(false);
    }
  }

  async function toggleItemCategory(enabled: boolean) {
    setSavingItemCategory(true);
    setShowItemCategory(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenShowItemCategory: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(t("displaySavedToast"));
    } catch {
      setShowItemCategory(!enabled);
      toast.error(t("saveErrorToast"));
    } finally {
      setSavingItemCategory(false);
    }
  }

  async function change(newMode: "simple" | "tracking") {
    if (newMode === mode) return;
    setSaving(true);
    setMode(newMode); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenWorkflowMode: newMode }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(
        newMode === "simple"
          ? t("switchedToSimpleToast")
          : t("switchedToTrackingToast"),
      );
    } catch {
      // Roll back optimistic state on failure
      setMode(mode);
      toast.error(t("saveErrorToast"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {sh.workflow && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            mode === "simple" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          }`}>
            {mode === "simple" ? <Zap className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
          </div>
          <div className="text-left min-w-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("kitchenWorkflowLabel")}
            </div>
            <div className="text-sm font-bold text-gray-900 truncate">
              {mode === "simple"
                ? t("modeSimpleSummary")
                : t("modeTrackingSummary")}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
          <div className="grid sm:grid-cols-2 gap-3">
            <ModeCard
              active={mode === "simple"}
              disabled={saving}
              onClick={() => change("simple")}
              icon={<Zap className="w-5 h-5" />}
              tagText={t("simpleTagText")}
              tagColor="emerald"
              title={t("simpleTitle")}
              description={t("simpleDescription")}
              points={[
                t("simplePoint1"),
                t("simplePoint2"),
                t("simplePoint3"),
              ]}
            />
            <ModeCard
              active={mode === "tracking"}
              disabled={saving}
              onClick={() => change("tracking")}
              icon={<Activity className="w-5 h-5" />}
              tagText={t("trackingTagText")}
              tagColor="blue"
              title={t("trackingTitle")}
              description={t("trackingDescription")}
              points={[
                t("trackingPoint1"),
                t("trackingPoint2"),
                t("trackingPoint3"),
              ]}
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              {t("switchModeNote")}
            </p>
          </div>
        </div>
      )}
      </div>
      )}

      {/* ── PrintNode backup toggle ─────────────────────────────────
          Direct WiFi/LAN printing (via the native kitchen app) is the
          main + recommended path. PrintNode is a legacy backup for
          restaurants on Windows browsers, unusual networks, or those
          who already have it set up. Default OFF — restaurants enable
          here to make the PrintNode setup option visible in the
          kitchen settings. */}
      {sh.printNode && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            printNodeEnabled ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
          }`}>
            <ServerCrash className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t("printNodeLabel")}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                {t("printNodeBadge")}
              </span>
            </div>
            <div className="text-sm text-gray-900 mt-0.5 leading-snug">
              {printNodeEnabled
                ? t("printNodeStatusOn")
                : t("printNodeStatusOff")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => togglePrintNode(!printNodeEnabled)}
            disabled={savingPrintNode}
            aria-label={t("printNodeToggleAriaLabel")}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              printNodeEnabled ? "bg-amber-500" : "bg-gray-300"
            } ${savingPrintNode ? "opacity-50" : ""}`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
                printNodeEnabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
          <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-2">
            <Printer className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
            <span>
              {t.rich("printNodeFooterNote", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          </p>
        </div>
      </div>
      )}

      {/* ── Auto phone-call alert ───────────────────────────────────────
          When a new order isn't accepted within ~90s, ring the restaurant's
          phone with an automated message so an unattended tablet doesn't
          drop the order (GloriaFood-style). Default OFF. Requires the
          platform Twilio voice credentials + a restaurant phone number. */}
      {sh.autoCall && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            autoCall ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-400"
          }`}>
            <PhoneCall className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t("autoCallLabel")}
            </div>
            <div className="text-sm text-gray-900 mt-0.5 leading-snug">
              {autoCall ? t("autoCallStatusOn") : t("autoCallStatusOff")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleAutoCall(!autoCall)}
            disabled={savingAutoCall}
            aria-label={t("autoCallToggleAriaLabel")}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              autoCall ? "bg-rose-500" : "bg-gray-300"
            } ${savingAutoCall ? "opacity-50" : ""}`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
                autoCall ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {/* Not-configured warning: the toggle can read "On" but no call will be
            placed until the platform Twilio voice account is set up. Surfaced so
            owners aren't misled into thinking it's working. */}
        {!twilioVoiceConfigured && (
          <div className="border-t border-amber-200 px-5 py-3 bg-amber-50">
            <p className="text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong className="font-semibold">{t("autoCallNeedsSetupTitle")}</strong>{" "}
                {t("autoCallNeedsSetupBody")}
              </span>
            </p>
          </div>
        )}

        {/* Which number gets called + an optional override. Only shown when the
            feature is ON, so it doesn't clutter the card when it's off. */}
        {autoCall && (
          <div className="border-t border-gray-100 px-5 py-3.5 bg-white space-y-2.5">
            <div className="text-[11px] text-gray-700 flex items-center gap-2">
              <PhoneCall className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              {effectiveAlertNumber ? (
                <span>
                  {t("autoCallNumberLabel")}{" "}
                  <strong className="font-semibold text-gray-900">{effectiveAlertNumber}</strong>
                  {!alertPhone.trim() && (
                    <span className="text-gray-400"> · {t("autoCallNumberFromStore")}</span>
                  )}
                </span>
              ) : (
                <span className="text-amber-700">{t("autoCallNumberNone")}</span>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                {t("autoCallAlertPhoneLabel")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  value={alertPhone}
                  onChange={(e) => setAlertPhone(e.target.value)}
                  onBlur={saveAlertPhone}
                  placeholder={storePhone || t("autoCallAlertPhonePlaceholderFallback")}
                  aria-invalid={alertPhoneInvalid || undefined}
                  className={`flex-1 max-w-xs border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                    alertPhoneInvalid
                      ? "border-red-400 focus:ring-red-400"
                      : "border-gray-200 focus:ring-rose-400"
                  }`}
                />
                {alertPhone.trim() !== savedAlertPhone.trim() && !alertPhoneInvalid && (
                  <button
                    type="button"
                    onClick={saveAlertPhone}
                    disabled={savingAlertPhone}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  >
                    {t("autoCallAlertPhoneSave")}
                  </button>
                )}
              </div>
              {/* Format guard (Luigi 2026-07-03): undialable input shows a red
                  error; a valid one shows EXACTLY what will be dialed (E.164),
                  so "6476690808" transparently becomes +16476690808. */}
              {alertPhoneInvalid ? (
                <p className="text-[11px] text-red-600 mt-1">{t("alertPhoneInvalid")}</p>
              ) : alertPhoneNormalized ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  {t("alertPhoneWillDial", { number: alertPhoneNormalized })}
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1">{t("autoCallAlertPhoneHint")}</p>
              )}
            </div>
            {effectiveAlertNumber && (
              <button
                type="button"
                onClick={sendTestCall}
                disabled={testingCall}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 border border-rose-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                {testingCall ? t("testCallSending") : t("testCallButton")}
              </button>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
          <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-2">
            <PhoneCall className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
            <span>{t("autoCallFooterNote")}</span>
          </p>
        </div>
      </div>
      )}

      {/* ── New-order vibration ─────────────────────────────────────────
          Kitchen devices vibrate alongside the ring on a new order. Default
          ON; off = ring only (the sound stays). Stored per-restaurant, read by
          the FCM push + the alarm-state poll, and honored by the native Kitchen
          Order App alarm. Luigi 2026-06-16 (Fabrizio request). */}
      {sh.vibrate && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            kitchenVibrate ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400"
          }`}>
            <Vibrate className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t("vibrateLabel")}
              </div>
              <HelpTip text={t("vibrateHelp")} />
            </div>
            <div className="text-sm text-gray-900 mt-0.5 leading-snug">
              {kitchenVibrate ? t("vibrateStatusOn") : t("vibrateStatusOff")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleVibrate(!kitchenVibrate)}
            disabled={savingVibrate}
            aria-label={t("vibrateToggleAriaLabel")}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              kitchenVibrate ? "bg-indigo-500" : "bg-gray-300"
            } ${savingVibrate ? "opacity-50" : ""}`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
                kitchenVibrate ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      )}

      {/* ── Delivery tile label: customer name vs street address ───────────
          Reseller request (Fabrizio 2026-06-21): so staff can identify a
          delivery order by name when the customer calls. */}
      {sh.delivery && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            deliveryShowName ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-400"
          }`}>
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 leading-snug">
              {t("deliveryNameLabel")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleDeliveryName(!deliveryShowName)}
            disabled={savingDeliveryName}
            aria-label={t("deliveryNameLabel")}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              deliveryShowName ? "bg-teal-500" : "bg-gray-300"
            } ${savingDeliveryName ? "opacity-50" : ""}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
              deliveryShowName ? "translate-x-6" : "translate-x-0"
            }`} />
          </button>
        </div>
        {/* The old "also show the street address" sub-toggle was retired
            2026-07-03 (Luigi): a delivery tile always shows the address now;
            this switch only controls whether the NAME is shown. */}
        {/* Which line leads the two-line delivery tile — only meaningful when
            the name is shown too (Luigi 2026-07-03). The top line is always
            the bold/large one; this just picks what goes there. */}
        {deliveryShowName && (
          <div className="border-t border-gray-100 px-5 py-3.5 bg-gray-50/50">
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-600">{t("deliveryLeadLabel")}</span>
              <HelpTip text={t("deliveryLeadHelp")} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeDeliveryLead("name")}
                disabled={savingDeliveryLead}
                className={`flex-1 max-w-[220px] text-left rounded-lg border-2 px-3 py-2 transition disabled:opacity-60 ${
                  deliveryLead === "name" ? "border-teal-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="text-xs font-bold text-gray-900">{t("deliveryLeadNameOption")}</div>
                <div className="text-[11px] text-gray-400 truncate">{t("deliveryLeadNamePreview")}</div>
              </button>
              <button
                type="button"
                onClick={() => changeDeliveryLead("address")}
                disabled={savingDeliveryLead}
                className={`flex-1 max-w-[220px] text-left rounded-lg border-2 px-3 py-2 transition disabled:opacity-60 ${
                  deliveryLead === "address" ? "border-teal-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="text-xs font-bold text-gray-900">{t("deliveryLeadAddressOption")}</div>
                <div className="text-[11px] text-gray-400 truncate">{t("deliveryLeadAddressPreview")}</div>
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Show each dish's menu category on incoming orders ──────────────
          Reseller request (Fabrizio 2026-06-21): disambiguates same-named
          dishes across categories (e.g. Japanese menus). */}
      {sh.itemCategory && (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            showItemCategory ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-400"
          }`}>
            <Tag className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 leading-snug">
              {t("showCategoryLabel")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggleItemCategory(!showItemCategory)}
            disabled={savingItemCategory}
            aria-label={t("showCategoryLabel")}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              showItemCategory ? "bg-cyan-500" : "bg-gray-300"
            } ${savingItemCategory ? "opacity-50" : ""}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
              showItemCategory ? "translate-x-6" : "translate-x-0"
            }`} />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  disabled,
  onClick,
  icon,
  tagText,
  tagColor,
  title,
  description,
  points,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tagText: string;
  tagColor: "emerald" | "blue";
  title: string;
  description: string;
  points: string[];
}) {
  const tagClass = tagColor === "emerald"
    ? "bg-emerald-100 text-emerald-800"
    : "bg-blue-100 text-blue-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        active
          ? "text-left rounded-lg border-2 border-emerald-500 bg-white p-4 transition disabled:opacity-60"
          : "text-left rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-gray-300 transition disabled:opacity-60"
      }
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          active
            ? tagColor === "emerald" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-500"
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-bold text-gray-900 text-sm">{title}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${tagClass}`}>
              {tagText}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
          <ul className="mt-2 space-y-0.5">
            {points.map((p, i) => (
              <li key={i} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                <span className="text-emerald-500 flex-shrink-0 mt-1">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}
