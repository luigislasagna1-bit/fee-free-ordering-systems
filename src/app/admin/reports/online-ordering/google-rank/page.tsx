import { ComingSoonPlaceholder } from "@/components/admin/reports/ComingSoonPlaceholder";

/**
 * /admin/reports/online-ordering/google-rank
 *
 * Google ranking trend + SEO health checklist. Requires an external
 * search-position crawler (GloriaFood uses one too — likely SerpAPI or
 * equivalent). Punted to Phase 3 since the upfront infrastructure work
 * is bigger than the rest of the Reports build combined and the value
 * is lower than the order-funnel reports.
 *
 * For Phase 1 we surface the "this report exists, here's what it'll
 * look at" framing so owners know it's planned + don't go shopping for
 * a separate SEO tool.
 */
export default function GoogleRankReportPage() {
  return (
    <ComingSoonPlaceholder
      title="Google Ranking"
      subtitle="Where you appear in Google for your area + cuisine."
      what="Your ranking position over time for keywords like '<your city> <cuisine>' plus a checklist of seven SEO health factors (content, GMB listing, page speed, domain, security, structured data, social/local listings) that move the needle."
      requires={[
        { label: "SerpAPI / external SEO crawl integration", status: "not_started" },
        { label: "Daily background scan job per published restaurant", status: "not_started" },
        { label: "Structured-data audit (we already emit JSON-LD on hosted sites)", status: "collecting" },
      ]}
      eta="Phase 3 of the Reports build — after Visits, Funnel, and Heatmap ship."
    />
  );
}
