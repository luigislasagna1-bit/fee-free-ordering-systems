"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Loader2, Bike, Lock, ArrowRight } from "lucide-react";

/**
 * Fee Free Delivery — enable OUR OWN in-house driver pool. Sibling to the
 * ShipDay config below it on this page (separate FeeFreeDeliveryConfig model).
 * When enabled it takes precedence over ShipDay (resolveDeliveryProvider:
 * feefree > shipday > own), so new delivery orders route to a Fee Free driver.
 *
 * Only the two WIRED controls are surfaced: `enabled` (master switch →
 * resolveDeliveryProvider) and `autoSend` (auto-queue on accept vs hold for
 * manual dispatch → assignToFeeFreeDriver). customerFeeMode stays in the schema
 * for a future checkout-split feature; we don't render a control that doesn't
 * yet move money (the dormant-toggle trap Luigi caught with ShipDay fee-mode).
 */

type Initial = { enabled: boolean; autoSend: boolean };

export function FeeFreeDeliverySection({
  initial,
  entitled,
  embedded = false,
}: {
  initial: Initial;
  entitled: boolean;
  /** When rendered UNDER the provider chooser (which owns the enable/select
   *  decision), show only the auto-send control — no heading, upsell, master
   *  enable toggle, or precedence note. */
  embedded?: boolean;
}) {
  const t = useTranslations("admin.feefreeDelivery");
  const router = useRouter();
  const [enabled, setEnabled] = useState(embedded ? true : initial.enabled);
  const [autoSend, setAutoSend] = useState(initial.autoSend);
  const [saving, setSaving] = useState(false);

  async function save(next: { enabled?: boolean; autoSend?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/feefree-delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "online_payment_required") {
          toast.error(t("toastOnlinePaymentRequired"), { duration: 8000 });
        } else if (data.code === "addon_required") {
          toast.error(t("toastAddonRequired"));
        } else {
          toast.error(data.error || t("toastFailedToSave"));
        }
        return false;
      }
      toast.success(t("toastSaved"));
      router.refresh();
      return true;
    } catch {
      toast.error(t("toastFailedToSave"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!entitled) {
      toast.error(t("toastAddonRequired"));
      return;
    }
    const next = !enabled;
    setEnabled(next); // optimistic
    const ok = await save({ enabled: next, autoSend });
    if (!ok) setEnabled(!next); // revert
  }

  async function toggleAutoSend() {
    const next = !autoSend;
    setAutoSend(next); // optimistic
    // Send ONLY autoSend — never re-trigger the enable gates (service-area /
    // entitlement / online-payment) just for a preference toggle.
    const ok = await save({ autoSend: next });
    if (!ok) setAutoSend(!next); // revert
  }

  // Embedded (under the provider chooser): just the auto-send control.
  if (embedded) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{t("autoSendLabel")}</p>
          <p className="text-xs text-gray-500 mt-0.5">{autoSend ? t("autoSendOnHint") : t("autoSendOffHint")}</p>
        </div>
        <Toggle checked={autoSend} disabled={saving} onClick={toggleAutoSend} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
          <Bike className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900">{t("heading")}</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wider">
              {t("badge")}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{t("description")}</p>
        </div>
      </div>

      {/* Entitlement upsell */}
      {!entitled && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 leading-relaxed">{t("lockedNotice")}</div>
          <Link
            href="/admin/billing/add-ons"
            className="flex-shrink-0 inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
          >
            {t("getDriverPool")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Master enable */}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{t("enableLabel")}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t("enableHint")}</p>
        </div>
        <Toggle checked={enabled} disabled={saving || !entitled} onClick={toggleEnabled} />
      </div>

      {/* Auto-send — only meaningful when enabled */}
      {enabled && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t("autoSendLabel")}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {autoSend ? t("autoSendOnHint") : t("autoSendOffHint")}
            </p>
          </div>
          <Toggle checked={autoSend} disabled={saving} onClick={toggleAutoSend} />
        </div>
      )}

      {/* Precedence note — this wins over the ShipDay source below when on. */}
      {enabled && (
        <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-[13px] text-emerald-900 leading-snug">{t("precedenceNote")}</p>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
