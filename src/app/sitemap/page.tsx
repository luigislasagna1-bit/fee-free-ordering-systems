import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { LANDING_PAGES } from "@/data/landing-pages";
import { SOLUTION_PAGES } from "@/data/solution-pages";
import { COMPETITORS } from "@/data/competitors";

/**
 * HTML sitemap / link hub.
 *
 * The footer shows only the top ~3 SEO landing pages per category (to stay
 * uncluttered); the COMPLETE list lives here, reached via the footer's
 * "+N more →" links and the "Sitemap" link in the legal row. This keeps the
 * full internal-link graph (descriptive anchor text → every cuisine / solution
 * / platform / city / competitor page) crawlable for SEO + AI answer engines,
 * without a wall of links on every page. The XML sitemap (/sitemap.xml) lists
 * the same pages for direct crawler discovery; this page is the human + crawl
 * conduit. English-only, same as the landing pages it links to.
 *
 * A real static route at /sitemap takes precedence over the dynamic /[slug]
 * solution route (static segments always win), so there is no shadowing.
 */
export const metadata: Metadata = {
  title: "Sitemap · Fee Free Ordering",
  description:
    "Every page on Fee Free Ordering — online ordering by cuisine, solutions, website integrations, cities, and platform comparisons.",
  alternates: { canonical: "/sitemap" },
};

type LinkItem = { href: string; text: string };

function Section({ id, title, items }: { id: string; title: string; items: LinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="text-sm text-emerald-700 hover:text-emerald-900 hover:underline">
              {it.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SitemapPage() {
  const cuisines: LinkItem[] = LANDING_PAGES.map((p) => ({
    href: `/online-ordering-for/${p.slug}`,
    text: `Online ordering for ${p.nounPlural}`,
  }));
  const solutions: LinkItem[] = SOLUTION_PAGES.filter((p) => p.category === "feature").map((p) => ({ href: `/${p.slug}`, text: p.h1 }));
  const platforms: LinkItem[] = SOLUTION_PAGES.filter((p) => p.category === "platform").map((p) => ({ href: `/${p.slug}`, text: p.h1 }));
  const cities: LinkItem[] = SOLUTION_PAGES.filter((p) => p.category === "city").map((p) => ({ href: `/${p.slug}`, text: p.h1 }));
  const compare: LinkItem[] = COMPETITORS.map((c) => ({ href: `/vs/${c.slug}`, text: `${c.name} alternative` }));
  const company: LinkItem[] = [
    { href: "/features", text: "Features" },
    { href: "/pricing", text: "Pricing" },
    { href: "/demo", text: "Demo" },
    { href: "/import", text: "Import your menu" },
    { href: "/faq", text: "FAQ" },
    { href: "/marketplace", text: "Browse restaurants" },
    { href: "/partners", text: "Reseller program" },
    { href: "/signup", text: "Get started free" },
    { href: "/login", text: "Log in" },
    { href: "/privacy", text: "Privacy" },
    { href: "/terms", text: "Terms" },
    { href: "/refund", text: "Refunds" },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale="en" />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Sitemap</h1>
        <p className="text-gray-600 mb-10 max-w-2xl">
          Every page on Fee Free Ordering, in one place. Looking to get going?{" "}
          <Link href="/signup" className="text-emerald-700 font-semibold hover:underline">Start free</Link>{" "}
          or <Link href="/features" className="text-emerald-700 font-semibold hover:underline">see all features</Link>.
        </p>

        <Section id="cuisines" title="Online ordering by cuisine" items={cuisines} />
        <Section id="solutions" title="Solutions" items={solutions} />
        <Section id="platforms" title="Add ordering to your website" items={platforms} />
        <Section id="cities" title="Online ordering by city" items={cities} />
        <Section id="compare" title="Compare Fee Free Ordering" items={compare} />
        <Section id="company" title="Company" items={company} />
      </main>
      <PublicFooter />
    </div>
  );
}
