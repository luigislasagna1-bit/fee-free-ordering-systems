import Link from "next/link";
import { MarketingSection, SectionEyebrow, SectionHeading } from "./sections";

/**
 * "What everyone else actually charges" transparency strip
 * (COMPETITOR-TOWNCLUB-PLAN.md action #9, Luigi 2026-07-06). Town and most
 * competitors hide their pricing behind a demo wall; we publish ours AND theirs.
 *
 * Data is SELF-CONTAINED here on purpose — do NOT import from
 * src/data/competitors.ts, which quotes OUR add-on prices (a house-rule risk).
 * Every competitor line is hedged ("per their published pricing / around / ~")
 * and traces to the approved 2026-07-05 town.club scan; each carries an honest
 * "genuinely strong at" note for credibility. EN-only literals — no i18n keys.
 */

const COMPETES: Array<{ name: string; chargeLine: string; strength: string; href?: string; hrefLabel?: string }> = [
  {
    name: "Owner.com",
    chargeLine: "Around $500/month plus an ~$800 setup fee, per their published/compare pricing.",
    strength: "Slick, conversion-focused websites and a polished onboarding team.",
  },
  {
    name: "Popmenu",
    chargeLine: "From $399/month, per their published pricing.",
    strength: "Strong menu-as-marketing tools and social/website engagement features.",
  },
  {
    name: "ChowNow",
    chargeLine: "Adds a hidden 7% “Support Local Fee” charged to your diners at checkout.",
    strength: "Well-known brand and a diner-facing marketplace app with reach.",
  },
  {
    name: "BentoBox",
    chargeLine: "Charges an extra +$199/month just to add loyalty on top of the base plan.",
    strength: "Genuinely beautiful, design-forward restaurant websites.",
  },
  {
    name: "Town (town.club)",
    chargeLine: "$300/month flat, but demo-only — no published pricing, and their own compare table shows a $500 setup fee while their blog claims none.",
    strength: "Clean, modern storefront design (on town.club subdomains).",
  },
  {
    name: "GloriaFood",
    chargeLine: "Free today — but shutting down April 30, 2027.",
    strength: "Was genuinely free and easy to start; that's exactly why we built a one-click importer for it.",
    href: "/gloriafood-alternative",
    hrefLabel: "See the migration plan →",
  },
];

export function CompetitorPricingStrip() {
  const asOf = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <MarketingSection tone="light">
      <div className="mb-10 max-w-2xl">
        <div className="mb-5">
          <SectionEyebrow>Honest comparison</SectionEyebrow>
        </div>
        <SectionHeading
          title="What everyone else actually charges"
          subtitle="We publish our prices. Most don't — so here's what restaurants really pay elsewhere, from each vendor's own published or leaked pricing. We keep this current; flag anything stale at support@feefreeordering.com."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Lead: the honest one */}
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
          <div className="font-bold text-gray-900">Fee Free Ordering</div>
          <p className="text-sm text-gray-700 mt-1">
            $0 core platform · 0% commission on direct orders · free first 100 orders/month · optional
            add-ons only when you need them.
          </p>
          <div className="border-t border-emerald-200/70 my-3" />
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600/80">
            Genuinely strong at:
          </div>
          <p className="text-sm text-emerald-800 mt-1">
            Being honest enough to put this table on our own pricing page.
          </p>
        </div>

        {COMPETES.map((c) => (
          <div
            key={c.name}
            className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]"
          >
            <div className="font-bold text-gray-900">{c.name}</div>
            <p className="text-sm text-gray-700 mt-1">{c.chargeLine}</p>
            <div className="border-t border-gray-100 my-3" />
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Genuinely strong at:
            </div>
            <p className="text-sm text-gray-600 mt-1">{c.strength}</p>
            {c.href && (
              <Link
                href={c.href}
                className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {c.hrefLabel}
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-500 mt-6 max-w-2xl mx-auto">
        Figures are each vendor&apos;s own published, compare-table, or widely-reported pricing as of{" "}
        {asOf}. Numbers change — tell us if any of these are out of date.
      </p>
    </MarketingSection>
  );
}
