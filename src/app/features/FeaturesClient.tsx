"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { ChefHat, Smartphone, BarChart3, Bell, Star, Printer, Globe, Calendar, Megaphone, Languages } from "lucide-react";
import { useTranslations } from "next-intl";

export function FeaturesClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.features");
  const tNav = useTranslations("marketing.nav");

  const sections = [
    {
      title: t("ordering.title"),
      items: [
        { icon: Globe,       title: t("ordering.browse"),       desc: t("ordering.browseDesc") },
        { icon: ChefHat,     title: t("ordering.pizza"),        desc: t("ordering.pizzaDesc") },
        { icon: Calendar,    title: t("ordering.reservations"), desc: t("ordering.reservationsDesc") },
      ],
    },
    {
      title: t("kitchen.title"),
      items: [
        { icon: Smartphone,  title: t("kitchen.display"),       desc: t("kitchen.displayDesc") },
        { icon: Printer,     title: t("kitchen.printing"),      desc: t("kitchen.printingDesc") },
        { icon: Bell,        title: t("kitchen.notifications"), desc: t("kitchen.notificationsDesc") },
      ],
    },
    {
      title: t("growth.title"),
      items: [
        { icon: Star,        title: t("growth.promotions"),     desc: t("growth.promotionsDesc") },
        { icon: BarChart3,   title: t("growth.autopilot"),      desc: t("growth.autopilotDesc") },
        { icon: Languages,   title: t("growth.multilingual"),   desc: t("growth.multilingualDesc") },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-orange-50 to-red-50 py-20 px-4 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">{t("title")}</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">{t("subtitle")}</p>
          <Link href="/signup" className="bg-orange-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-600 transition">
            {tNav("startTrial")}
          </Link>
        </section>

        {sections.map((section) => (
          <section key={section.title} className="py-16 px-4 even:bg-gray-50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">{section.title}</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {section.items.map((item) => (
                  <div key={item.title} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                      <item.icon className="w-6 h-6 text-orange-500" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="py-16 px-4 bg-orange-500 text-white text-center">
          <Link href="/signup" className="bg-white text-orange-600 font-bold px-8 py-3 rounded-xl text-lg hover:bg-orange-50 transition">
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
