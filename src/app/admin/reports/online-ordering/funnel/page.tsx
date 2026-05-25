import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";

/**
 * /admin/reports/online-ordering/funnel
 *
 * Conversion funnel from visit → menu browse → cart → checkout → order.
 * Backed by the `WebsiteVisit` + `WebsiteFunnelEvent` tables once the
 * visit-beacon endpoint is wired into the customer order page.
 */
export default function FunnelReportPage() {
  return (
    <ComingSoonPlaceholder
      title="Website Funnel"
      subtitle="Where customers drop off in your order flow."
      what="Step-by-step funnel from page visit through completed order, with drop-off percentage at every step so you can see exactly where shoppers abandon."
      requires={[
        { label: "Lightweight visit beacon on /order/<slug>", status: "not_started" },
        { label: "Cart + checkout step events", status: "not_started" },
        { label: "Schema models WebsiteVisit + WebsiteFunnelEvent", status: "collecting" },
      ]}
      eta="Phase 2 of the Reports build — visit-tracking endpoint ships next."
    />
  );
}
