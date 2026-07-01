"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Pause, Loader2, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Quick superadmin actions on a specific restaurant: publish/unpublish
 * and isActive/paused. Both call PATCH /api/superadmin/restaurants/[id]
 * which audit-logs the change to the server console.
 *
 * Confirmation prompts:
 *   - "Force publish" when the restaurant isn't publish-ready (required
 *     setup steps still open) — superadmin override is allowed but
 *     should be deliberate.
 *   - "Unpublish a live restaurant" — destructive UX, mid-order
 *     customers can see their cart break.
 *   - "Pause restaurant" — clearer because it hides the ordering page
 *     from customers immediately.
 *
 * No retry logic — superadmin will see the toast error and re-click
 * if Vercel was momentarily slow.
 */
export function RestaurantControls({
  restaurantId,
  restaurantName,
  initialIsPublished,
  initialIsActive,
  publishReady,
  publishedAt,
}: {
  restaurantId: string;
  restaurantName: string;
  initialIsPublished: boolean;
  initialIsActive: boolean;
  publishReady: boolean;
  publishedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "publish" | "active" | "delete">(null);
  // Permanent-delete modal: type-the-name confirmation guards a destructive,
  // irreversible action (deletes the restaurant + ALL its data). Luigi 2026-07-01.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function deleteRestaurant() {
    if (busy) return;
    if (confirmText.trim() !== restaurantName.trim()) {
      toast.error("Type the exact restaurant name to confirm.");
      return;
    }
    setBusy("delete");
    try {
      const r = await fetch(`/api/superadmin/restaurants/${restaurantId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: confirmText.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success(`Deleted "${restaurantName}" permanently`);
      // The restaurant no longer exists — leave the (now-404) detail page.
      router.push("/superadmin/restaurants");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish() {
    if (busy) return;
    if (initialIsPublished) {
      if (!confirm(
        "Unpublish this restaurant?\n\n" +
        "• The customer-facing /order page will keep working (controlled by isActive, not publishedAt).\n" +
        "• The embed widget on third-party sites will stop rendering.\n" +
        "• The marketplace listing will hide.\n\n" +
        "The owner can republish themselves from /admin/setup once required steps are complete."
      )) return;
    } else {
      if (!publishReady) {
        if (!confirm(
          "FORCE PUBLISH override\n\n" +
          "This restaurant has unfinished required setup steps. The owner-facing publish button is gated until they're done — superadmin override bypasses that gate.\n\n" +
          "Only use this for grandfathering legacy data or debugging. Continue?"
        )) return;
      }
    }
    setBusy("publish");
    try {
      const r = await fetch(`/api/superadmin/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishedAt: initialIsPublished ? null : "now" }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || "Update failed");
        return;
      }
      toast.success(initialIsPublished ? "Unpublished" : "Published");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    if (busy) return;
    if (initialIsActive) {
      if (!confirm(
        "Pause this restaurant?\n\n" +
        "• Customer-facing /order/<slug> page will 404 immediately.\n" +
        "• In-flight orders are NOT touched — kitchen can finish them.\n" +
        "• The owner sees their admin panel normally.\n\n" +
        "Use this for: TOS violation, billing dispute, or owner-requested pause."
      )) return;
    }
    setBusy("active");
    try {
      const r = await fetch(`/api/superadmin/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !initialIsActive }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || "Update failed");
        return;
      }
      toast.success(initialIsActive ? "Paused" : "Reactivated");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider opacity-80 font-bold">Superadmin controls</div>
          <div className="text-sm mt-0.5 opacity-90">
            {initialIsPublished && publishedAt
              ? <>Published since {new Date(publishedAt).toLocaleDateString()}</>
              : "Not yet published"}
            {" · "}
            {initialIsActive ? "Active" : "Paused"}
            {!publishReady && initialIsPublished && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" /> Setup not complete (was force-published or steps regressed)
              </span>
            )}
            {publishReady && !initialIsPublished && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> All required steps done — owner can self-publish
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={togglePublish}
          disabled={!!busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
            initialIsPublished
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "bg-emerald-500 hover:bg-emerald-600 text-white"
          }`}
        >
          {busy === "publish" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {initialIsPublished ? "Unpublish" : (publishReady ? "Publish" : "Force publish")}
        </button>
        <button
          onClick={toggleActive}
          disabled={!!busy}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
            initialIsActive
              ? "bg-white/15 hover:bg-white/25 text-white"
              : "bg-emerald-500 hover:bg-emerald-600 text-white"
          }`}
        >
          {busy === "active" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
          {initialIsActive ? "Pause" : "Reactivate"}
        </button>
        <button
          onClick={() => { setConfirmText(""); setDeleteOpen(true); }}
          disabled={!!busy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50 bg-red-600 hover:bg-red-700 text-white"
          title="Permanently delete this restaurant and all its data"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>

    {deleteOpen && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !busy && setDeleteOpen(false)}>
        <div className="bg-white rounded-2xl w-full max-w-md p-6 text-gray-900" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-red-600 mb-3">
            <Trash2 className="w-5 h-5" />
            <h2 className="text-lg font-bold">Delete restaurant permanently</h2>
          </div>
          <p className="text-sm text-gray-600">
            This <strong>permanently deletes</strong> <strong>{restaurantName}</strong> and <strong>everything</strong> scoped to it —
            menu, orders, customers, promotions, reservations, devices, billing. This <strong>cannot be undone</strong>.
          </p>
          <p className="text-sm text-gray-700 mt-4">
            Type the restaurant name <span className="font-mono font-semibold">{restaurantName}</span> to confirm:
          </p>
          <input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") deleteRestaurant(); }}
            placeholder={restaurantName}
            className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={() => setDeleteOpen(false)}
              disabled={!!busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={deleteRestaurant}
              disabled={!!busy || confirmText.trim() !== restaurantName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "delete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete permanently
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
