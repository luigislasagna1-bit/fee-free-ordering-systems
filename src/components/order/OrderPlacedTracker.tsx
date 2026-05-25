"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/visit-tracker";

/**
 * Fires the funnel-terminal `order_placed` event when the confirmation
 * page mounts. Lives on the confirmation page (not the order page) so
 * we only count actually-completed orders — not abandoned carts.
 *
 * Like VisitTracker, this renders null and is intentionally minimal.
 */
export function OrderPlacedTracker({ restaurantId, orderId }: { restaurantId: string; orderId: string }) {
  useEffect(() => {
    trackEvent({ restaurantId, step: "order_placed", targetId: orderId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
