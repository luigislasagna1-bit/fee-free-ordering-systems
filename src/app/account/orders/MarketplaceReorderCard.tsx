"use client";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";

/**
 * Marketplace-side reorder card — same UX as the per-restaurant
 * OrderAgainButton but as a full-card click target since we're
 * rendering inside the marketplace `/account/orders` rail.
 *
 * Sets the ff_reorder_<slug> sessionStorage handshake so the
 * receiving order page (OrderingPageClient) accepts the
 * ?reorder=<id> query param. Without the handshake the page
 * strips the param and bails, which would be silently broken UX.
 */
export function MarketplaceReorderCard({
  restaurantName,
  restaurantSlug,
  orderId,
  itemSummary,
  formattedTotal,
}: {
  restaurantName: string;
  restaurantSlug: string;
  orderId: string;
  itemSummary: string;
  formattedTotal: string;
}) {
  const router = useRouter();
  const handle = () => {
    try {
      sessionStorage.setItem(`ff_reorder_${restaurantSlug}`, orderId);
    } catch { /* private mode — falling through still works for direct flow */ }
    router.push(`/order/${restaurantSlug}?reorder=${encodeURIComponent(orderId)}`);
  };
  return (
    <button
      onClick={handle}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-sm transition flex flex-col gap-2 text-left w-full"
    >
      <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold truncate">
        {restaurantName}
      </div>
      <div className="text-xs text-gray-700 line-clamp-2 min-h-[2.5em]">
        {itemSummary || "Order"}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-sm font-semibold text-gray-900">{formattedTotal}</div>
        <div className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1">
          <Repeat className="w-3.5 h-3.5" /> Order again
        </div>
      </div>
    </button>
  );
}
