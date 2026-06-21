"use client";
import { useState } from "react";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ScreenshotLightbox, type LightboxShot } from "@/components/marketing/ScreenshotLightbox";
import Link from "next/link";
import { ArrowRight, ShoppingCart, ChefHat, BarChart3, Eye, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";

const KITCHEN_SHOTS = (alt: string): LightboxShot[] => [
  { src: "/marketing/screenshots/app-kitchen.png", alt, label: "Kitchen Order App" },
];
const ADMIN_SHOTS = (alt: string): LightboxShot[] => [
  { src: "/marketing/screenshots/app-reports.png", alt, label: "app.feefreeordering.com/reports" },
  { src: "/marketing/screenshots/app-customers.png", alt, label: "app.feefreeordering.com/customers" },
  { src: "/marketing/screenshots/app-promotions.png", alt, label: "app.feefreeordering.com/promotions" },
  { src: "/marketing/screenshots/app-growthnet.png", alt, label: "app.feefreeordering.com/marketing-studio" },
  { src: "/marketing/screenshots/app-import.png", alt, label: "app.feefreeordering.com/menu/import" },
];

export function DemoClient({ locale, demoSlug }: { locale: string; demoSlug: string | null }) {
  const t = useTranslations("marketing.demo");
  const tNav = useTranslations("marketing.nav");
  const [lightbox, setLightbox] = useState<null | "kitchen" | "admin">(null);
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
            {/* Card 1 — customer ordering: the REAL anonymous storefront, no login. */}
            <div className="bg-white border-2 border-emerald-100 rounded-2xl p-8 text-center hover:border-emerald-400 hover:shadow-lg transition">
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

            {/* Card 2 — Kitchen: real screenshot preview (no signup needed). The
                three demo cards each get a distinct color: emerald (customer),
                navy (kitchen), amber (admin). */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 text-center hover:border-slate-700 hover:shadow-lg transition">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                <ChefHat className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{t("cards.kitchen")}</h2>
              <p className="text-gray-600 mb-6">{t("cards.kitchenDesc")}</p>
              <button
                onClick={() => setLightbox("kitchen")}
                className="inline-flex items-center gap-2 bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl hover:bg-slate-800 transition"
              >
                <Eye className="w-4 h-4" /> {t("cards.kitchenCta")}
              </button>
            </div>

            {/* Card 3 — Admin: real screenshot carousel preview (no signup needed). */}
            <div className="bg-white border-2 border-amber-100 rounded-2xl p-8 text-center hover:border-amber-400 hover:shadow-lg transition">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                <BarChart3 className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-3">{t("cards.admin")}</h2>
              <p className="text-gray-600 mb-6">{t("cards.adminDesc")}</p>
              <button
                onClick={() => setLightbox("admin")}
                className="inline-flex items-center gap-2 bg-amber-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-amber-600 transition"
              >
                <Eye className="w-4 h-4" /> {t("cards.adminCta")}
              </button>
            </div>
          </div>
        </section>

        {/* Import-to-try — the bridge from passive demo to active trial. */}
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-8 py-12 sm:px-12 text-center text-white shadow-xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-white/15 rounded-full px-3 py-1 mb-4">
              {t("import.eyebrow")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">{t("import.title")}</h2>
            <p className="text-emerald-50 text-lg max-w-2xl mx-auto mb-7">{t("import.body")}</p>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl hover:bg-emerald-50 transition shadow-lg"
            >
              <UploadCloud className="w-5 h-5" /> {t("import.cta")}
            </Link>
          </div>
        </section>

        <section className="py-16 px-4 bg-gray-50 text-center">
          <Link href="/signup" className="bg-emerald-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-emerald-600 transition inline-block">
            {tNav("startTrial")}
          </Link>
        </section>
      </main>
      <PublicFooter />

      <ScreenshotLightbox open={lightbox === "kitchen"} title={t("cards.kitchen")} shots={KITCHEN_SHOTS(t("cards.kitchen"))} onClose={() => setLightbox(null)} />
      <ScreenshotLightbox open={lightbox === "admin"} title={t("cards.admin")} shots={ADMIN_SHOTS(t("cards.admin"))} onClose={() => setLightbox(null)} />
    </div>
  );
}
