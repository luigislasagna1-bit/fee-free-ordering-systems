"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export function PricingClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.pricing");
  const tNav = useTranslations("marketing.nav");

  const plans = [
    { key: "starter",    price: "49.99",  highlight: false },
    { key: "pro",        price: "149.99", highlight: true },
    { key: "enterprise", price: "—",      highlight: false },
  ] as const;

  const compareItems = (t.raw("compareItems") as string[]) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-orange-50 to-red-50 py-20 px-4 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">{t("title")}</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">{t("subtitle")}</p>
          <p className="text-sm text-gray-500 mt-4">{t("trialNote")}</p>
        </section>

        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.key}
                className={`p-7 rounded-2xl border-2 ${plan.highlight ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white"} relative`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {t("mostPopular")}
                  </div>
                )}
                <div className="font-bold text-gray-900 text-xl mb-1">{t(`tiers.${plan.key}`)}</div>
                <div className="text-sm text-gray-500 mb-4">{t(`tiers.${plan.key}Desc`)}</div>
                <div className="flex items-baseline mb-6">
                  <span className="text-4xl font-bold text-orange-500">${plan.price}</span>
                  <span className="text-gray-500 ml-1">{t("perMonth")}</span>
                </div>
                <Link
                  href="/signup"
                  className={`block w-full py-3 rounded-xl font-semibold text-center transition ${plan.highlight ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
                >
                  {plan.key === "enterprise" ? t("ctaContact") : t("cta")}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">{t("compareTitle")}</h2>
            <ul className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto">
              {compareItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-16 px-4 bg-orange-500 text-white text-center">
          <Link href="/signup" className="bg-white text-orange-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-orange-50 transition inline-block">
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
