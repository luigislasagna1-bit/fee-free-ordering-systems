"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowLeftCircle, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shown on /admin/menu for CHILD locations that have switched off
 * brand-menu inheritance (i.e. they have their own custom menu).
 * Lets the owner revert back to the inherited menu, with a clear
 * destructive-action warning + confirmation modal because the revert
 * permanently deletes every local menu item / category / modifier.
 */
export function RevertToBrandMenuBanner({ brandName }: { brandName: string }) {
  const router = useRouter();
  const t = useTranslations("admin.revertBrandMenu");
  const [confirming, setConfirming] = useState(false);
  const [reverting, setReverting] = useState(false);

  async function confirmRevert() {
    setReverting(true);
    try {
      const res = await fetch("/api/menu/revert-to-brand-menu", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || t("failedToRevert"));
        setReverting(false);
        return;
      }
      toast.success(t("revertSuccess", { brandName: brandName ?? "" }));
      setConfirming(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || t("failedToRevert"));
      setReverting(false);
    }
  }

  return (
    <>
      <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <ArrowLeftCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-amber-900 text-sm">
              {t.rich("bannerHeading", { strong: (chunks) => <strong>{chunks}</strong> })}
            </div>
            <div className="text-xs text-amber-800 mt-0.5 leading-snug">
              {t.rich("bannerDescription", {
                brandName: brandName ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex-shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline px-3 py-1.5"
        >
          {t("revertToBrandMenuButton")}
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !reverting && setConfirming(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900">
                  {t("modalHeading", { brandName: brandName ?? "" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label={t("closeAriaLabel")}
                disabled={reverting}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                {t.rich("modalBody1", {
                  brandName: brandName ?? "",
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <p className="text-red-700">
                {t.rich("modalBody2", { strong: (chunks) => <strong>{chunks}</strong> })}
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={reverting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition"
              >
                {t("keepCustomMenuButton")}
              </button>
              <button
                type="button"
                onClick={confirmRevert}
                disabled={reverting}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
              >
                {reverting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("revertingLabel")}</>
                ) : (
                  <>{t("confirmDeleteButton")}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
