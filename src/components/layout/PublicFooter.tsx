"use client";
import Link from "next/link";
import { ChefHat } from "lucide-react";
import { useTranslations } from "next-intl";

export function PublicFooter() {
  const tF = useTranslations("marketing.footer");
  const tNav = useTranslations("marketing.nav");
  return (
    <footer className="bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
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
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">{tF("support")}</div>
            <div className="space-y-2 text-sm">
              <Link href="/faq" className="block hover:text-white transition">{tNav("faq")}</Link>
              <a href="mailto:support@feefreeordering.com" className="block hover:text-white transition">Contact</a>
            </div>
          </div>
          <div>
            <div className="font-semibold text-white mb-3">{tF("account")}</div>
            <div className="space-y-2 text-sm">
              <Link href="/login" className="block hover:text-white transition">{tNav("login")}</Link>
              <Link href="/signup" className="block hover:text-white transition">{tNav("startTrial")}</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-700 pt-6 text-sm text-gray-500 text-center">
          {tF("copyright", { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
}
