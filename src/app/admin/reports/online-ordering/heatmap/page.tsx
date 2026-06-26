import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { haversineKm } from "@/lib/geocode";
import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";
import { HeatmapLoader } from "./HeatmapLoader";
import { getTranslations } from "next-intl/server";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { LocationChooser, ActiveLocationChip } from "../../LocationChooser";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/online-ordering/heatmap
 *
 * Geographical heatmap of delivery-order origins. Solves the
 * GloriaFood feature that's broken in their product (they show radius
 * rings instead of an actual heatmap — Luigi flagged this explicitly).
 *
 * Implementation:
 *   - Server fetches every delivery order in range with non-null
 *     deliveryLat/Lng. These are populated automatically by the order-
 *     create handler (it geocodes once for zone resolution; we capture
 *     the result).
 *   - Renders the Leaflet client component with the points + delivery
 *     zone overlays. The heatmap uses leaflet.heat with a blue→red
 *     gradient (cold to hot).
 *   - Computes the in-zone-percentage breakdown server-side and shows
 *     it below the map: "X% of orders within Y km", an actionable
 *     metric for delivery-radius planning.
 *
 * Pre-existing orders without lat/lng (placed before the heatmap
 * shipped) are silently excluded — the column is nullable + the report
 * is honest about "this populates going forward."
 */

// Leaflet pokes at window/document on import; the lazy-import +
// ssr:false lives inside HeatmapLoader (a Client Component) because
// Next 16 forbids `dynamic(..., { ssr: false })` in Server Components.

export default async function HeatmapReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.reportHeatmapPage");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;

  const scope = await resolveReportScope(restaurantId);
  const active = resolveActiveLocation(scope, sp);
  // Resolve the range in the active location's timezone (parent's tz on the
  // chooser screen) so day boundaries + the label match the chosen location.
  const tz = active?.timezone ?? scope.timezone ?? undefined;
  const range = parseDateRangeInTz(sp, tz);

  // Preserve the date range across chooser / back links.
  const rangeQuery = (() => {
    const u = new URLSearchParams();
    for (const k of ["preset", "from", "to"]) {
      const v = Array.isArray(sp[k]) ? sp[k][0] : sp[k];
      if (v) u.set(k, String(v));
    }
    return u.toString();
  })();

  // Brand parent without a chosen location → show the location chooser
  // (these geographic metrics can't aggregate across a chain).
  if (!active) {
    return (
      <div>
        <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("pointsPlotted", { count: (0).toLocaleString(), range: formatRangeLabelInTz(range, tz)})}
            </p>
          </div>
          <DateRangePicker />
        </header>
        <LocationChooser locations={scope.locations} baseQuery={rangeQuery} />
      </div>
    );
  }

  // Load restaurant + zones for the map center & overlays.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: active.id },
    select: {
      id: true, name: true, lat: true, lng: true,
      deliveryZones: {
        where: { isActive: true },
        select: { name: true, radiusKm: true, color: true },
        orderBy: { radiusKm: "asc" },
      },
    },
  });
  if (!restaurant) return <p className="text-sm text-gray-500">{t("restaurantNotFound")}</p>;

  // If the restaurant hasn't set coordinates yet, we can't center
  // the map — fall back to the placeholder so the owner sees what
  // needs configuring.
  if (restaurant.lat == null || restaurant.lng == null) {
    return (
      <ComingSoonPlaceholder
        title={t("placeholderTitle")}
        subtitle={t("placeholderSubtitle")}
        what={t("placeholderWhat")}
        requires={[
          { label: t("requiresCoordinates"), status: "not_started" },
          { label: t("requiresDeliveryOrder"), status: "not_started" },
        ]}
        eta={t("placeholderEta")}
      />
    );
  }

  // Fetch every delivery order in range with coords. Bounded by the
  // (restaurantId, createdAt) index — fast even for big restaurants.
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: active.id,
      type: "delivery",
      status: { not: "rejected" },
      deliveryLat: { not: null },
      deliveryLng: { not: null },
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { deliveryLat: true, deliveryLng: true },
  });

  const points = orders
    .filter((o): o is { deliveryLat: number; deliveryLng: number } => o.deliveryLat != null && o.deliveryLng != null)
    .map((o) => ({ lat: o.deliveryLat, lng: o.deliveryLng }));

  // Compute "% inside each zone" using haversine. Each point counted
  // once into the SMALLEST containing zone (matches the zone-pricing
  // semantics — customer pays the smallest containing zone's fee).
  const zoneStats = restaurant.deliveryZones.map((z) => ({ ...z, hits: 0 }));
  for (const p of points) {
    const dKm = haversineKm(restaurant.lat, restaurant.lng, p.lat, p.lng);
    // Smallest-radius first (zones are pre-sorted asc).
    for (const z of zoneStats) {
      if (dKm <= z.radiusKm) {
        z.hits += 1;
        break;
      }
    }
  }
  const outsideAllZones = points.length - zoneStats.reduce((s, z) => s + z.hits, 0);

  // Export honors the active location + date range. `loc` is required
  // so the per-location export scopes to active.id, matching this page.
  const exportQuery = `${rangeQuery}${rangeQuery ? "&" : ""}loc=${active.id}`;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("pointsPlotted", { count: points.length.toLocaleString(), range: formatRangeLabelInTz(range, tz)})}
          </p>
        </div>
        <DateRangePicker />
      </header>

      {scope.isChain && <ActiveLocationChip name={active.name} baseQuery={rangeQuery} />}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <HeatmapLoader
          restaurantLat={restaurant.lat}
          restaurantLng={restaurant.lng}
          restaurantName={restaurant.name}
          points={points}
          zones={restaurant.deliveryZones}
        />
      </div>

      {/* Per-zone breakdown — the report's actionable layer. Owners
          extending/retracting their delivery radius care about this
          number more than the visual heatmap itself. */}
      {restaurant.deliveryZones.length > 0 && points.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-900">{t("ordersByZone")}</h2>
            <ExportMenu
              exportUrl="/api/admin/reports/online-ordering/heatmap/export"
              currentQuery={exportQuery}
              compact={false}
            />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-2 px-3 font-semibold">{t("colZone")}</th>
                <th className="py-2 px-3 font-semibold text-right">{t("colRadius")}</th>
                <th className="py-2 px-3 font-semibold text-right">{t("colOrders")}</th>
                <th className="py-2 px-3 font-semibold text-right">{t("colShare")}</th>
              </tr>
            </thead>
            <tbody>
              {zoneStats.map((z) => {
                const pct = points.length > 0 ? (z.hits / points.length) * 100 : 0;
                return (
                  <tr key={z.name} className="border-b border-gray-50">
                    <td className="py-2 px-3 text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: z.color }} />
                        {z.name}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600">{z.radiusKm} km</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">{z.hits.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {outsideAllZones > 0 && (
                <tr className="border-b border-gray-50">
                  <td className="py-2 px-3 text-gray-500 italic">{t("outsideAllZones")}</td>
                  <td className="py-2 px-3 text-right text-gray-400">—</td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-700">{outsideAllZones.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{((outsideAllZones / points.length) * 100).toFixed(1)}%</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
