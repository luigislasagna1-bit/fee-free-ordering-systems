import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";

/**
 * /admin/reports/online-ordering/heatmap
 *
 * Geographical heatmap of delivery-order origins. GloriaFood's version
 * is broken (Luigi: "it's supposed to show addresses from orders");
 * ours will do it properly via Leaflet heatmap layer driven by
 * Order.deliveryLat/Lng (new columns added in this schema change set).
 *
 * Order create needs a background geocoding step before this report
 * has data — Phase 2 work.
 */
export default function HeatmapReportPage() {
  return (
    <ComingSoonPlaceholder
      title="Delivery Heatmap"
      subtitle="Where your delivery orders come from on a map."
      what="Leaflet heatmap overlay showing the geographical density of your delivery orders. Hot zones reveal where your customers cluster — and the distance rings tell you what % fall inside each delivery zone."
      requires={[
        { label: "Order.deliveryLat / deliveryLng columns", status: "collecting" },
        { label: "Background geocoder on order create (Nominatim / Google)", status: "not_started" },
        { label: "Leaflet heatmap layer (leaflet.heat plugin)", status: "not_started" },
      ]}
      eta="Phase 2 of the Reports build — geocoder job ships with visit tracking."
    />
  );
}
