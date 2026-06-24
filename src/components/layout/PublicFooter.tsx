"use client";
import Link from "next/link";
import { ChefHat, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL } from "@/lib/support";
import { LANDING_PAGES } from "@/data/landing-pages";
import { SOLUTION_PAGES } from "@/data/solution-pages";
import { COMPETITORS } from "@/data/competitors";

/**
 * Public footer.
 *
 * Five-column layout: brand + four link groups (Product / Marketplace /
 * Partners / Account). Luigi flagged that the previous footer was missing
 * obvious nav targets like Marketplace and Partners — those exist as full
 * pages on the site but had no footer entry.
 *
 * Legal links (Privacy / Terms / Refunds) live in a sub-row inside the
 * copyright strip at the bottom, GloriaFood-style. Pages live at /privacy,
 * /terms, /refund.
 */
export function PublicFooter() {
  const tF = useTranslations("marketing.footer");
  const tNav = useTranslations("marketing.nav");
  return (
    <footer className="bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-5 gap-8 mb-8">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-white font-bold text-lg mb-3">
              <ChefHat className="w-6 h-6 text-emerald-400" />
              Fee Free Ordering
            </Link>
            <p className="text-sm text-gray-400">{tF("tagline")}</p>
            <a href={`tel:${SUPPORT_PHONE_TEL}`} className="mt-4 inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-bold">
              <Phone className="w-4 h-4" /> {SUPPORT_PHONE_DISPLAY}
            </a>
            <p className="text-xs text-gray-500 mt-0.5">{tF("support24_7")}</p>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">{tF("product")}</div>
            <div className="space-y-2 text-sm">
              <Link href="/features" className="block hover:text-white transition">{tNav("features")}</Link>
              <Link href="/pricing" className="block hover:text-white transition">{tNav("pricing")}</Link>
              <Link href="/demo" className="block hover:text-white transition">{tNav("demo")}</Link>
              <Link href="/faq" className="block hover:text-white transition">{tNav("faq")}</Link>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Marketplace</div>
            <div className="space-y-2 text-sm">
              <Link href="/marketplace" className="block hover:text-white transition">Browse restaurants</Link>
              <Link href="/pricing" className="block hover:text-white transition">Marketplace pricing</Link>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">Partners</div>
            <div className="space-y-2 text-sm">
              <Link href="/partners" className="block hover:text-white transition">Reseller program</Link>
              <Link href="/partners/apply" className="block hover:text-white transition">Become a partner</Link>
              <Link href="/reseller" className="block hover:text-white transition">Partner login</Link>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">{tF("account")}</div>
            <div className="space-y-2 text-sm">
              <Link href="/signup" className="block hover:text-white transition">{tNav("startTrial")}</Link>
              <Link href="/login" className="block hover:text-white transition">{tNav("login")}</Link>
              <a href="mailto:support@feefreeordering.com" className="block hover:text-white transition">Contact</a>
            </div>
          </div>
        </div>
        {/* Programmatic SEO link block — GloriaFood-style "discoverable, not primary-nav" rows so search
            engines + AI crawlers reach every landing page (cuisine / solution / platform / city / compare).
            Small + muted; each row only renders once it has links. */}
        <div className="border-t border-gray-800 pt-6 mb-6 space-y-2.5 text-xs text-gray-500">
          {LANDING_PAGES.length > 0 && (
            <SeoLinkRow label="Online ordering for" moreHref="/sitemap#cuisines" items={LANDING_PAGES.map((p) => ({ href: `/online-ordering-for/${p.slug}`, text: p.nounPlural }))} />
          )}
          {SOLUTION_PAGES.some((p) => p.category === "feature") && (
            <SeoLinkRow label="Solutions" moreHref="/sitemap#solutions" items={SOLUTION_PAGES.filter((p) => p.category === "feature").map((p) => ({ href: `/${p.slug}`, text: p.h1 }))} />
          )}
          {SOLUTION_PAGES.some((p) => p.category === "platform") && (
            <SeoLinkRow label="Your website" moreHref="/sitemap#platforms" items={SOLUTION_PAGES.filter((p) => p.category === "platform").map((p) => ({ href: `/${p.slug}`, text: p.h1 }))} />
          )}
          {SOLUTION_PAGES.some((p) => p.category === "city") && (
            <SeoLinkRow label="Cities" moreHref="/sitemap#cities" items={SOLUTION_PAGES.filter((p) => p.category === "city").map((p) => ({ href: `/${p.slug}`, text: p.h1 }))} />
          )}
          {COMPETITORS.length > 0 && (
            <SeoLinkRow label="Compare" moreHref="/sitemap#compare" items={COMPETITORS.map((c) => ({ href: `/vs/${c.slug}`, text: `${c.name} alternative` }))} />
          )}
        </div>
        <div className="border-t border-gray-700 pt-6 text-sm text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-center sm:text-left">
            {tF("copyright", { year: new Date().getFullYear() })}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/sitemap" className="hover:text-white transition">Sitemap</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/refund" className="hover:text-white transition">Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * One muted, dot-separated row of SEO landing-page links (the GloriaFood-style footer block).
 * Shows only the first `VISIBLE` links to keep the footer uncluttered; the rest live on the
 * crawlable /sitemap page (reached via the "+N more" link), so search engines still get every
 * page with descriptive anchor text — without a wall of links in the visible footer. (Never
 * CSS-hide the overflow links: hidden-for-crawlers links are a Google spam signal.)
 */
function SeoLinkRow({ label, items, moreHref }: { label: string; items: { href: string; text: string }[]; moreHref: string }) {
  const VISIBLE = 3;
  const shown = items.slice(0, VISIBLE);
  const moreCount = items.length - shown.length;
  return (
    <div className="leading-relaxed">
      <span className="font-semibold text-gray-400">{label}: </span>
      {shown.map((it, i) => (
        <span key={it.href}>
          <Link href={it.href} className="hover:text-white transition capitalize">{it.text}</Link>
          {i < shown.length - 1 ? <span className="text-gray-700"> · </span> : null}
        </span>
      ))}
      {moreCount > 0 && (
        <>
          <span className="text-gray-700"> · </span>
          <Link href={moreHref} className="text-gray-400 hover:text-emerald-300 transition whitespace-nowrap">+{moreCount} more →</Link>
        </>
      )}
    </div>
  );
}
