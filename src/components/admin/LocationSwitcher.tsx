"use client";

import { useState } from "react";
import { ChevronDown, MapPin, Loader2 } from "lucide-react";

export type LocationOption = {
  id: string;
  name: string;
  city: string | null;
  isParent: boolean;
};

/**
 * Dropdown to switch between locations of a multi-location restaurant. Only
 * renders when the caller's brand has ≥2 locations (parent + child[ren]).
 * Selecting a location calls /api/restaurants/locations/switch which sets the
 * `active_location` cookie; the page reloads to pick up the new identity.
 */
export function LocationSwitcher({
  locations,
  activeId,
}: {
  locations: LocationOption[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = locations.find((l) => l.id === activeId) ?? locations[0];

  async function switchTo(restaurantId: string) {
    if (restaurantId === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/restaurants/locations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      if (res.ok) {
        // Hard reload so server-rendered pages re-read the cookie.
        window.location.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  if (locations.length < 2) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 text-gray-500" />}
        <span className="max-w-[180px] truncate">{active?.name ?? "Locations"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <>
          {/* click-outside dismiss */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-40 bg-white rounded-xl border border-gray-200 shadow-lg w-64 py-1 max-h-80 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
              Switch location
            </div>
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => switchTo(loc.id)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition ${
                  loc.id === activeId ? "bg-orange-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm text-gray-900 truncate">{loc.name}</div>
                  {loc.isParent && (
                    <span className="text-[9px] uppercase tracking-wider text-orange-600 font-bold bg-orange-100 px-1.5 py-0.5 rounded">
                      Brand
                    </span>
                  )}
                </div>
                {loc.city && <div className="text-xs text-gray-500">{loc.city}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
