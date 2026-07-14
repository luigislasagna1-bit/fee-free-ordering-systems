"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { User, Truck, Bike, Lock, Check, ArrowRight, Loader2 } from "lucide-react";

export type DeliveryProvider = "own" | "shipday" | "feefree";

/**
 * The ONE "delivery method" chooser (Luigi 2026-07-14 — the old stacked
 * ShipDay-source + separate FeeFree-toggle was confusing). Pick a single active
 * provider — Own / ShipDay / Fee Free Delivery — and only that provider's
 * settings show below. FeeFree only appears in its service area (gated by the
 * server page). Selecting a provider writes the underlying configs so
 * resolveDeliveryProvider (feefree > shipday > own) routes new orders there.
 */
export function DeliveryProviderClient({
  initialProvider,
  entitled,
  feefreeAvailable,
  shipdayPanel,
  feefreePanel,
}: {
  initialProvider: DeliveryProvider;
  entitled: boolean;
  feefreeAvailable: boolean;
  shipdayPanel: ReactNode;
  feefreePanel: ReactNode;
}) {
  const t = useTranslations("admin.deliveryProvider");
  const router = useRouter();
  const [selected, setSelected] = useState<DeliveryProvider>(initialProvider);
  const [saving, setSaving] = useState(false);

  async function putFeefree(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/feefree-delivery", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }
  async function putDriverPool(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/driver-pool", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  function toastForCode(code?: string) {
    if (code === "online_payment_required") toast.error(t("onlinePaymentToast"), { duration: 8000 });
    else if (code === "not_in_service_area") toast.error(t("notInAreaToast"), { duration: 8000 });
    else if (code === "addon_required") toast.error(t("lockedToast"));
    else toast.error(t("toastFailed"));
  }

  async function choose(next: DeliveryProvider) {
    if (next === selected || saving) return;
    // ShipDay + FeeFree both need the Driver Pool add-on — pre-empt with the upsell.
    if (next !== "own" && !entitled) {
      toast.error(t("lockedToast"));
      return;
    }
    setSaving(true);
    try {
      if (next === "feefree") {
        const r = await putFeefree({ enabled: true });
        if (!r.ok) { toastForCode(r.data?.code); return; }
        await putDriverPool({ deliverySource: "own" }); // FeeFree wins; keep ShipDay off
      } else if (next === "shipday") {
        const r = await putDriverPool({ deliverySource: "shipday" });
        if (!r.ok) { toastForCode(r.data?.code); return; }
        await putFeefree({ enabled: false });
      } else {
        await putFeefree({ enabled: false });
        await putDriverPool({ deliverySource: "own" });
      }
      setSelected(next);
      toast.success(t("toastSaved"));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const cards: Array<{ id: DeliveryProvider; label: string; desc: string; icon: ReactNode; show: boolean; badge?: string }> = [
    { id: "own", label: t("ownLabel"), desc: t("ownDesc"), icon: <User className="w-5 h-5" />, show: true },
    { id: "feefree", label: t("feefreeLabel"), desc: t("feefreeDesc"), icon: <Bike className="w-5 h-5" />, show: feefreeAvailable, badge: t("feefreeAreaBadge") },
    { id: "shipday", label: t("shipdayLabel"), desc: t("shipdayDesc"), icon: <Truck className="w-5 h-5" />, show: true },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">{t("title")}</h2>
          {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <p className="text-sm text-gray-600 mt-1 mb-4">{t("desc")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.filter((c) => c.show).map((c) => {
            const isSelected = selected === c.id;
            const locked = c.id !== "own" && !entitled;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c.id)}
                disabled={saving}
                className={`text-left rounded-xl border-2 p-4 transition disabled:opacity-70 ${
                  isSelected ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
                  isSelected ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {c.icon}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="font-bold text-sm text-gray-900">{c.label}</div>
                  {isSelected && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white uppercase tracking-wider inline-flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> {t("activeBadge")}
                    </span>
                  )}
                  {c.badge && !isSelected && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider">{c.badge}</span>
                  )}
                  {locked && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase tracking-wider inline-flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> {t("addonRequired")}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 leading-snug text-gray-600">{c.desc}</p>
              </button>
            );
          })}
        </div>

        {!entitled && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-amber-900 leading-relaxed">{t("lockedNotice")}</div>
            <Link href="/admin/billing/add-ons" className="flex-shrink-0 inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
              {t("getDriverPool")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>

      {/* The chosen provider's settings. */}
      {selected === "own" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
          <p className="text-sm text-gray-600">{t("ownNote")}</p>
        </div>
      )}
      {selected === "shipday" && shipdayPanel}
      {selected === "feefree" && feefreePanel}
    </div>
  );
}
