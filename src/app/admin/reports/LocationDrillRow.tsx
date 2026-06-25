"use client";

import { useState } from "react";

/**
 * A clickable per-location row on the chain dashboard. Clicking "drills into"
 * that location by switching the active-location cookie (the SAME mechanism as
 * the header LocationSwitcher) and reloading into that location's own reports.
 * To return to the chain view, the owner picks the brand/parent in the header
 * switcher. (This is the destructive "become this location" path — distinct from
 * the non-destructive `?loc=` view-filter used inside the sub-reports.)
 */
export function LocationDrillRow({ id, children }: { id: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);

  const drillIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/restaurants/locations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id }),
      });
      window.location.href = "/admin/reports";
    } catch {
      setBusy(false);
    }
  };

  return (
    <tr
      onClick={drillIn}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          drillIn();
        }
      }}
      className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-emerald-50/40 transition ${busy ? "opacity-50 pointer-events-none" : ""}`}
    >
      {children}
    </tr>
  );
}
