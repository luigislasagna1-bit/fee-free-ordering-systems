"use client";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { Zap, Clock, Languages, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export function HomeClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.home");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-500 to-red-600 text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" /> {t("heroBadge")}
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">{t("heroTitle")}</h1>
          <p className="text-xl text-orange-100 mb-10 max-w-2xl mx-auto">{t("heroSubtitle")}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-white text-orange-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-50 transition flex items-center justify-center gap-2"
            >
              {t("startTrial")} <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/demo"
              className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-white/10 transition"
            >
              {t("viewDemo")}
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 px-4">
          {[
            { icon: Zap,       title: t("stats.noFees"),        desc: t("stats.noFeesDesc") },
            { icon: Clock,     title: t("stats.fastSetup"),     desc: t("stats.fastSetupDesc") },
            { icon: Languages, title: t("stats.allLanguages"),  desc: t("stats.allLanguagesDesc") },
          ].map((stat) => (
            <div key={stat.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                <stat.icon className="w-5 h-5 text-orange-500" />
              </div>
              <div className="font-bold text-gray-900 text-lg">{stat.title}</div>
              <div className="text-gray-500 mt-1 text-sm">{stat.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features intro */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">{t("featuresTitle")}</h2>
          <Link href="/features" className="text-orange-500 font-medium hover:underline">
            {t("viewDemo")} →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center">
        <h2 className="text-4xl font-bold mb-4">{t("ctaTitle")}</h2>
        <p className="text-orange-100 text-lg mb-8">{t("ctaSubtitle")}</p>
        <Link
          href="/signup"
          className="bg-white text-orange-600 font-bold px-10 py-4 rounded-xl text-lg hover:bg-orange-50 transition inline-flex items-center gap-2"
        >
          {t("ctaButton")} <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}
