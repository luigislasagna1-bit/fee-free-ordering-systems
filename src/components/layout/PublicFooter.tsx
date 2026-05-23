"use client";
import Link from "next/link";
import { ChefHat } from "lucide-react";
import { useTranslations } from "next-intl";

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
        <div className="border-t border-gray-700 pt-6 text-sm text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-center sm:text-left">
            {tF("copyright", { year: new Date().getFullYear() })}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/refund" className="hover:text-white transition">Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
