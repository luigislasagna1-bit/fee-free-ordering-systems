"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ImageUpload } from "@/components/admin/ImageUpload";
import type { OrderingPopupConfig } from "@/app/order/[slug]/PromotionalPopup";

type PromoOption = { id: string; name: string };

export function PromoPopupClient({
  initialConfig,
  promotions,
}: {
  initialConfig: OrderingPopupConfig;
  promotions: PromoOption[];
}) {
  const t = useTranslations("admin.promoPopup");
  const tp = useTranslations("admin.profile"); // reuse the shared popup field labels
  const [popup, setPopup] = useState<OrderingPopupConfig>(initialConfig ?? {});
  const [saving, setSaving] = useState(false);
  const action = popup.buttonAction || "url";
  const set = (patch: Partial<OrderingPopupConfig>) => setPopup((p) => ({ ...p, ...patch }));
  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm";

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/promo-popup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderingPopup: popup }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{tp("popupSection")}</h1>
        <p className="text-sm text-gray-500 mt-1">{tp("popupHint")}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            checked={!!popup.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="h-4 w-4 rounded accent-emerald-500"
          />
          {tp("popupEnable")}
        </label>

        {popup.enabled && (
          <div className="space-y-4">
            <ImageUpload
              label={tp("popupImage")}
              value={popup.imageUrl ?? ""}
              onChange={(url) => set({ imageUrl: url })}
              aspectRatio="wide"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tp("popupHeadingLabel")}</label>
              <input className={inputCls} value={popup.title ?? ""} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tp("popupMessageLabel")}</label>
              <textarea className={inputCls} rows={3} value={popup.body ?? ""} maxLength={2000} onChange={(e) => set({ body: e.target.value })} />
            </div>

            {/* Button + its action target */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tp("popupButtonLabel")}</label>
                <input className={inputCls} value={popup.buttonLabel ?? ""} maxLength={100} onChange={(e) => set({ buttonLabel: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("buttonAction")}</label>
                <select className={inputCls} value={action} onChange={(e) => set({ buttonAction: e.target.value as OrderingPopupConfig["buttonAction"] })}>
                  <option value="url">{t("actionUrl")}</option>
                  <option value="promo">{t("actionPromo")}</option>
                </select>
              </div>

              {action === "url" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{tp("popupButtonUrl")}</label>
                  <input className={inputCls} value={popup.buttonUrl ?? ""} placeholder="https://…" onChange={(e) => set({ buttonUrl: e.target.value })} />
                </div>
              )}

              {action === "promo" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("choosePromo")}</label>
                  {promotions.length === 0 ? (
                    <p className="text-xs text-gray-400">{t("noPromos")}</p>
                  ) : (
                    <select className={inputCls} value={popup.buttonPromoId ?? ""} onChange={(e) => set({ buttonPromoId: e.target.value })}>
                      <option value="">{t("selectPromo")}</option>
                      {promotions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
