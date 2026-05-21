"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Truck, User, Loader2, X, Check } from "lucide-react";

type DispatchState = {
  deliverySource: "own" | "shipday" | "both";
  activeDispatchMode: "own" | "shipday";
  hasDriverPool: boolean;
  showToggle: boolean;
};

/**
 * Kitchen-display Delivery Settings button + modal.
 *
 * Only renders for restaurants on "both" mode (admin has enabled both
 * own drivers AND ShipDay pool). Lets staff flip the live dispatch
 * mode mid-shift without leaving the kitchen display — "we're slammed
 * in-house, route the next 2 hours to the pool" type of moment.
 *
 * For "own"-only or "shipday"-only restaurants the toggle is hidden
 * entirely (those are admin-controlled choices, not staff-controlled).
 */
export function DispatchModeToggle({ themeBtnClass }: { themeBtnClass: string }) {
  const [state, setState] = useState<DispatchState | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initial fetch + a refetch whenever the modal opens (in case admin
  // flipped deliverySource in another tab).
  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    try {
      const res = await fetch("/api/kitchen/dispatch-mode");
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch { /* silent — keeps the button hidden on failure */ }
  }

  async function setMode(next: "own" | "shipday") {
    if (!state || saving) return;
    if (state.activeDispatchMode === next) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/kitchen/dispatch-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDispatchMode: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to switch dispatch mode");
        return;
      }
      toast.success(
        next === "own"
          ? "New delivery orders → your in-house drivers"
          : "New delivery orders → ShipDay driver pool",
      );
      setState((s) => (s ? { ...s, activeDispatchMode: next } : s));
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to switch dispatch mode");
    } finally {
      setSaving(false);
    }
  }

  if (!state?.showToggle) return null;

  const active = state.activeDispatchMode;
  const Icon = active === "own" ? User : Truck;
  const label = active === "own" ? "In-house" : "ShipDay pool";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition border-blue-500/40 text-blue-600 ${themeBtnClass}`}
        title="Delivery dispatch settings"
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Delivery: {label}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900">Delivery dispatch</h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Pick where NEW delivery orders go from this moment on. Existing
                  in-flight orders aren&apos;t affected. Toggle any time as staff
                  availability changes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                aria-label="Close"
                className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setMode("own")}
                disabled={saving}
                className={`w-full text-left rounded-xl border-2 p-4 transition flex items-start gap-3 ${
                  active === "own"
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                } ${saving ? "opacity-60" : ""}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  active === "own" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-gray-900 text-sm">In-house drivers</div>
                    {active === "own" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white inline-flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-snug">
                    New delivery orders dispatch to your own drivers. ShipDay is
                    NOT charged. You handle every delivery yourself.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("shipday")}
                disabled={saving}
                className={`w-full text-left rounded-xl border-2 p-4 transition flex items-start gap-3 ${
                  active === "shipday"
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                } ${saving ? "opacity-60" : ""}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  active === "shipday" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  <Truck className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-gray-900 text-sm">ShipDay driver pool</div>
                    {active === "shipday" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white inline-flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-snug">
                    New delivery orders route to the ShipDay third-party pool.
                    Per-delivery ShipDay fees apply. Use when your own drivers
                    are slammed or unavailable.
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-5 text-[11px] text-gray-500 leading-relaxed bg-gray-50 rounded-lg p-3">
              💡 This toggle changes where NEW orders go. Any delivery order
              that&apos;s already been accepted continues with whichever driver
              was picked at acceptance time.
            </div>

            {saving && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Switching…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
