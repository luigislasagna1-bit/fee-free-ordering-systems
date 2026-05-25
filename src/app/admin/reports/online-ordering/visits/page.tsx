import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";

/**
 * /admin/reports/online-ordering/visits
 *
 * Stacked bar chart of website visits per day, broken down by channel
 * (Direct / Organic / Paid ads / Social / Referral / Email / Affiliate
 * / Marketplace / Internal). Reads from the WebsiteVisit table once
 * the visit-beacon ships.
 */
export default function VisitsReportPage() {
  return (
    <ComingSoonPlaceholder
      title="Website Visits"
      subtitle="Where your traffic comes from."
      what="Daily stacked-bar chart of website visits with one color per acquisition channel (Direct, Organic, Paid ads, Social, Referral, Email, Affiliate, Marketplace, From inside your website). Click a channel in the legend to filter."
      requires={[
        { label: "Visit beacon on /order/<slug> + hosted marketing page", status: "not_started" },
        { label: "Channel detection from utm_*, referrer, Vercel geo", status: "not_started" },
        { label: "Schema model WebsiteVisit", status: "collecting" },
      ]}
      eta="Phase 2 of the Reports build."
    />
  );
}
