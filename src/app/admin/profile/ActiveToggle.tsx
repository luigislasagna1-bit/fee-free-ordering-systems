"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Power, Loader2, AlertCircle } from "lucide-react";

/**
 * Pause / Resume the restaurant.
 *
 * When isActive is false, customers visiting /order/<slug> see a "We're
 * closed temporarily" page and can't place orders. Publishing state is
 * untouched — the restaurant stays "published" but takes no orders.
 *
 * Use case: holiday closure, equipment issues, kitchen overload — owner
 * pauses for a few hours or days without losing setup data or having to
 * unpublish + re-publish.
 */
export function ActiveToggle({ initialActive }: { initialActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const newValue = !active;
    setSaving(true);
    // Optimistic flip so the toggle feels instant; on failure we revert.
    setActive(newValue);
    try {
      const res = await fetch("/api/restaurants/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newValue }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update status");
      }
      toast.success(newValue ? "You're back online" : "Restaurant paused — customers can't order");
      router.refresh();
    } catch (e: any) {
      setActive(!newValue); // revert
      toast.error(e?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 flex items-center gap-4 transition ${
      active
        ? "border-emerald-200 bg-emerald-50"
        : "border-amber-300 bg-amber-50"
    }`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
        active ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
      }`}>
        {active ? <Power className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold ${active ? "text-emerald-900" : "text-amber-900"}`}>
          {active ? "Accepting orders" : "Paused — not accepting orders"}
        </div>
        <div className={`text-xs mt-0.5 ${active ? "text-emerald-700" : "text-amber-700"}`}>
          {active
            ? "Customers can place orders right now. Pause if you need to temporarily stop incoming orders without unpublishing."
            : "Customers visiting your order page see a 'we're closed temporarily' message. Resume any time."}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`relative w-14 h-8 rounded-full transition flex-shrink-0 ${
          active ? "bg-emerald-500" : "bg-gray-300"
        } ${saving ? "opacity-60" : ""}`}
        aria-label={active ? "Pause restaurant" : "Resume restaurant"}
      >
        <span
          className={`absolute top-1 ${active ? "right-1" : "left-1"} w-6 h-6 rounded-full bg-white shadow flex items-center justify-center transition-all`}
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
        </span>
      </button>
    </div>
  );
}
