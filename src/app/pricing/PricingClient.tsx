"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import {
  CheckCircle,
  CreditCard,
  Globe,
  Megaphone,
  Smartphone,
  Store,
  Calendar,
  Link2,
  Building2,
} from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Public pricing page — reflects the new "free core + paid add-ons" model
 * shipped in Phases 1-6. Replaces the legacy 4-tier table.
 *
 * Structure:
 *   1. Hero — "Free forever, no credit card"
 *   2. Free-core card — what every restaurant gets
 *   3. Add-on grid — each unlock matches the seeded AddOn rows in
 *      prisma/seed-addons.ts
 *   4. "All plans include" list — preserved from legacy
 *   5. CTA strip
 */
export function PricingClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.pricing");
  const tNav = useTranslations("marketing.nav");

  const freeIncludes = (t.raw("freeIncludes") as string[]) ?? [];
  const compareItems = (t.raw("compareItems") as string[]) ?? [];

  // Add-on cards mirror the seed-addons.ts catalog. `price` left as a label
  // ("Coming soon" / "From $X/mo") because the superadmin hasn't priced them
  // yet — the AddOn rows in prod default to $0. Once the superadmin sets
  // prices, swap this to read from /api/admin/add-ons or hard-code here.
  const addOns = [
    { slug: "online_payments",    icon: CreditCard, color: "#10b981" },
    { slug: "hosted_website",     icon: Globe,      color: "#3b82f6" },
    { slug: "custom_domain",      icon: Link2,      color: "#8b5cf6" },
    { slug: "advanced_promos",    icon: Megaphone,  color: "#ec4899" },
    { slug: "branded_mobile_app", icon: Smartphone, color: "#f59e0b" },
    { slug: "pos_module",         icon: Store,      color: "#06b6d4" },
    { slug: "reservation_deposits", icon: Calendar, color: "#ef4444" },
    { slug: "multi_location",     icon: Building2,  color: "#0ea5e9" },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-orange-50 via-white to-amber-50 py-20 px-4 text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-4">
            {t("title")}
          </h1>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
          <p className="text-sm text-gray-500 mt-4">{t("trialNote")}</p>
        </section>

        {/* ─── Free core card ──────────────────────────────────── */}
        <section className="py-12 px-4">
          <div className="max-w-3xl mx-auto rounded-3xl border-2 border-orange-500 bg-white shadow-lg p-8 md:p-12 relative overflow-hidden">
            <div className="absolute -top-3 right-8 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              {t("freeBadge")}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              {t("freeTitle")}
            </h2>
            <p className="text-gray-600 mt-2">{t("freeSubtitle")}</p>
            <div className="flex items-baseline mt-4">
              <span className="text-6xl font-extrabold text-orange-500">
                ${" "}
              </span>
              <span className="text-6xl font-extrabold text-orange-500">0</span>
              <span className="text-gray-500 ml-2 text-lg">{t("perMonth")}</span>
            </div>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-800">
              {freeIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-xl transition"
            >
              {t("freeCta")}
            </Link>
          </div>
        </section>

        {/* ─── Add-ons grid ───────────────────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                {t("addOnsTitle")}
              </h2>
              <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
                {t("addOnsSubtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {addOns.map(({ slug, icon: Icon, color }) => (
                <div
                  key={slug}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${color}1a` }}
                  >
                    <Icon className="w-6 h-6" style={{ color }} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg">
                    {t(`addOns.${slug}.name`)}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {t(`addOns.${slug}.desc`)}
                  </p>
                  <p className="text-xs text-gray-400 mt-3">
                    {t("addOnPriceComingSoon")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Everyone gets ──────────────────────────────────── */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              {t("compareTitle")}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto">
              {compareItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── CTA strip ─────────────────────────────────────── */}
        <section className="py-16 px-4 bg-orange-500 text-white text-center">
          <Link
            href="/signup"
            className="bg-white text-orange-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-orange-50 transition inline-block"
          >
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
