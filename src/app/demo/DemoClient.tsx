"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { ArrowRight, ShoppingCart, ChefHat, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";

export function DemoClient({ locale, demoSlug }: { locale: string; demoSlug: string | null }) {
  const t = useTranslations("marketing.demo");
  const tNav = useTranslations("marketing.nav");
  // Live demo storefront if one exists; otherwise send visitors to the public
  // marketplace so the card is never a dead end.
  const orderingHref = demoSlug ? `/order/${demoSlug}` : "/marketplace";

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        <section className="py-20 px-4 text-center bg-gradient-to-br from-emerald-50 to-white">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">{t("title")}</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">{t("subtitle")}</p>
        </section>

        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
            <div className="bg-white border-2 border-emerald-100 rounded-2xl p-8 text-center hover:border-emerald-400 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                <ShoppingCart className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{t("cards.ordering")}</h2>
              <p className="text-gray-600 mb-6">{t("cards.orderingDesc")}</p>
              <Link
                href={orderingHref}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-emerald-600 transition"
              >
                {t("tryIt")} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Kitchen Display — navy treatment (contrast card #2 of 3). The
                three demo cards each get a distinct color so visitors can
                tell them apart at a glance: emerald (customer-facing),
                navy (kitchen-facing), amber (admin-facing). */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 text-center hover:border-slate-700 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                <ChefHat className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{t("cards.kitchen")}</h2>
              <p className="text-gray-600 mb-6">{t("cards.kitchenDesc")}</p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-800 transition"
              >
                {tNav("startTrial")} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-white border-2 border-amber-100 rounded-2xl p-8 text-center hover:border-amber-400 hover:shadow-lg transition group">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                <BarChart3 className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{t("cards.admin")}</h2>
              <p className="text-gray-600 mb-6">{t("cards.adminDesc")}</p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-amber-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-amber-600 transition"
              >
                {tNav("startTrial")} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-gray-50 text-center">
          <Link href="/signup" className="bg-emerald-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-emerald-600 transition inline-block">
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
