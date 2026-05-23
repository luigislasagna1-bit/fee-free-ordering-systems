"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowLeftCircle, Loader2, X } from "lucide-react";

/**
 * Shown on /admin/menu for CHILD locations that have switched off
 * brand-menu inheritance (i.e. they have their own custom menu).
 * Lets the owner revert back to the inherited menu, with a clear
 * destructive-action warning + confirmation modal because the revert
 * permanently deletes every local menu item / category / modifier.
 */
export function RevertToBrandMenuBanner({ brandName }: { brandName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reverting, setReverting] = useState(false);

  async function confirmRevert() {
    setReverting(true);
    try {
      const res = await fetch("/api/menu/revert-to-brand-menu", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to revert");
        setReverting(false);
        return;
      }
      toast.success(`Reverted to ${brandName}'s menu. Local changes deleted.`);
      setConfirming(false);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to revert");
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
              You&apos;re on a <strong>custom menu</strong> for this location
            </div>
            <div className="text-xs text-amber-800 mt-0.5 leading-snug">
              Inheriting from <strong>{brandName}</strong> is off — you can
              independently edit prices, items, and availability here. Want to
              go back to using {brandName}&apos;s master menu?
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex-shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline px-3 py-1.5"
        >
          Revert to brand menu
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
                  Revert to {brandName}&apos;s menu?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                aria-label="Close"
                disabled={reverting}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                This will <strong>permanently delete</strong> every menu item,
                category, variant, and modifier on this location. After
                reverting, you&apos;ll show whatever <strong>{brandName}</strong>
                {" "}has as their master menu, exactly like a brand-new child
                location.
              </p>
              <p className="text-red-700">
                <strong>This cannot be undone.</strong> If you want to keep any
                of your customizations, copy them down somewhere first.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={reverting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition"
              >
                Keep my custom menu
              </button>
              <button
                type="button"
                onClick={confirmRevert}
                disabled={reverting}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
              >
                {reverting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Reverting…</>
                ) : (
                  <>Yes, delete custom menu</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
