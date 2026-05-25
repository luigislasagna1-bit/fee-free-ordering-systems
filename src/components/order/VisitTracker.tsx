"use client";

import { useEffect } from "react";
import { trackVisit } from "@/lib/visit-tracker";

/**
 * Drop-in `<VisitTracker restaurantId={...} />` for any customer-facing
 * page. Fires the /api/track/visit beacon exactly once on mount.
 *
 * Why a tiny dedicated component instead of a useEffect inline on the
 * /order page? The order page is a sprawling server component with a
 * lot of client islands; consolidating "fire visit on mount" into a
 * one-line client child avoids polluting that file with another
 * useEffect and makes the analytics surface obvious to read.
 *
 * No UI — renders null.
 */
export function VisitTracker({ restaurantId }: { restaurantId: string }) {
  useEffect(() => {
    trackVisit({ restaurantId });
    // Intentional: only run on mount. The session hash is stable across
    // re-renders so re-firing wouldn't add value — and we want the
    // visit count to be once-per-page-load, not once-per-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
