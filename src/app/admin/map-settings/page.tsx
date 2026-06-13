import { redirect } from "next/navigation";

/**
 * Map Settings retired (Luigi 2026-06-13). Every restaurant now uses the free
 * Leaflet/OSM map for tiles + the platform Google key (Superadmin → Maps
 * Settings) for address autocomplete + traffic-aware driving distance — there's
 * no per-restaurant map provider/key to configure. Redirect any stale link.
 */
export default function MapSettingsPage() {
  redirect("/admin");
}
