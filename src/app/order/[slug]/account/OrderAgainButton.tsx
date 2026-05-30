"use client";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";

/**
 * "Order again" quick-reorder button — sets the same sessionStorage
 * handshake the status page's Reorder button uses, then navigates to
 * the order page with ?reorder=<orderId>. The order page picks the
 * order up server-side, walks its items, rebuilds the cart, opens
 * the drawer, and shows a banner.
 *
 * See OrderingPageClient.tsx for the consuming side (search
 * "Reorder handshake").
 */
export function OrderAgainButton({
  slug,
  orderId,
  className = "",
  children,
}: {
  slug: string;
  orderId: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const handle = () => {
    try {
      sessionStorage.setItem(`ff_reorder_${slug}`, orderId);
    } catch {
      // Private-mode / quota — the order page falls back to a banner
      // explaining the cart was pre-filled, so just navigate anyway.
    }
    router.push(`/order/${slug}?reorder=${encodeURIComponent(orderId)}`);
  };
  return (
    <button
      onClick={handle}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <Repeat className="w-3.5 h-3.5" />
      {children ?? "Order again"}
    </button>
  );
}
