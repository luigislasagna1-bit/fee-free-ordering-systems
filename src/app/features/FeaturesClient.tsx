"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, Tag, Users, Repeat, CreditCard, Globe, Building2, Store, Smartphone, Monitor, Phone,
  CalendarCheck, Link2, Truck, Infinity as InfinityIcon, BellRing, PhoneCall, RefreshCw, ShieldCheck,
  Receipt, ScanLine, BarChart3, Database, TrendingUp,
} from "lucide-react";
import {
  MarketingSection, SectionHeading, PrimaryButton, SecondaryButton, ScreenshotFrame,
  AltFeatureRow, IconFeatureGrid, CTASection, type IconFeature,
} from "@/components/marketing/sections";
import { GrowthNetShowcase } from "@/components/marketing/GrowthNetShowcase";
import { PizzaSplitGraphic } from "@/components/marketing/PizzaSplitGraphic";

/* Reuse the homepage's translated feature content (marketing.home.v2.*) so the
   features page is exhaustive + cohesive with zero new translation. */
const RELIABILITY: { icon: LucideIcon; key: string }[] = [
  { icon: BellRing, key: "ring" }, { icon: PhoneCall, key: "call" }, { icon: RefreshCw, key: "autoReject" },
  { icon: ShieldCheck, key: "chargeOnAccept" }, { icon: Receipt, key: "receipts" }, { icon: ScanLine, key: "printer" },
];
const RUN: { icon: LucideIcon; key: string }[] = [
  { icon: BarChart3, key: "reports" }, { icon: Database, key: "crm" }, { icon: Tag, key: "promos" },
  { icon: TrendingUp, key: "insights" }, { icon: Repeat, key: "reorder" }, { icon: Users, key: "accounts" },
];
const ADDONS: { icon: LucideIcon; key: string; comingSoon?: boolean }[] = [
  { icon: CreditCard, key: "payments" }, { icon: Globe, key: "website" }, { icon: Building2, key: "multiLocation" },
  { icon: Store, key: "marketplace" }, { icon: InfinityIcon, key: "unlimited" }, { icon: Link2, key: "domain" },
  { icon: Truck, key: "driver" }, { icon: Smartphone, key: "brandedApp", comingSoon: true },
  { icon: Monitor, key: "pos", comingSoon: true }, { icon: Phone, key: "aiPhone", comingSoon: true },
  { icon: CalendarCheck, key: "deposits", comingSoon: true },
];

export function FeaturesClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.features");
  const h = useTranslations("marketing.home.v2");
  const tNav = useTranslations("marketing.nav");

  const reliability: IconFeature[] = RELIABILITY.map((r) => ({ icon: r.icon, title: h(`kitchen.${r.key}.title`), body: h(`kitchen.${r.key}.body`) }));
  const run: IconFeature[] = RUN.map((r) => ({ icon: r.icon, title: h(`run.${r.key}.title`), body: h(`run.${r.key}.body`) }));
  const addons: IconFeature[] = ADDONS.map((a) => ({ icon: a.icon, title: h(`addons.${a.key}.title`), body: h(`addons.${a.key}.body`), comingSoon: a.comingSoon }));
  const soon = h("soon");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-white" style={{ background: "radial-gradient(80% 80% at 50% 0%, #ecfdf5 0%, rgba(236,253,245,0) 60%), #ffffff" }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">{t("title")}</h1>
            <p className="mt-5 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">{t("subtitle")}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <PrimaryButton href="/signup">{tNav("startTrial")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
              <SecondaryButton href="/demo">{h("demo.cta")}</SecondaryButton>
            </div>
          </div>
        </section>

        {/* Ordering page */}
        <MarketingSection tone="light">
          <AltFeatureRow
            reverse
            eyebrow={h("ordering.eyebrow")}
            title={h("ordering.title")}
            body={h("ordering.body")}
            bullets={[h("ordering.bullet1"), h("ordering.bullet2"), h("ordering.bullet3")]}
            image={<ScreenshotFrame variant="phone" alt={h("ordering.frameAlt")} src="/marketing/screenshots/luigis-menu-mobile.webp" />}
          />
        </MarketingSection>

        {/* Checkout & payments */}
        <MarketingSection tone="emeraldTint">
          <AltFeatureRow
            eyebrow={h("checkout.eyebrow")}
            title={h("checkout.title")}
            body={h("checkout.body")}
            bullets={[h("checkout.bullet1"), h("checkout.bullet2"), h("checkout.bullet3")]}
            image={<ScreenshotFrame variant="phone" alt={h("checkout.frameAlt")} src="/marketing/screenshots/luigis-order-mobile.webp" />}
          />
        </MarketingSection>

        {/* Import your menu (GloriaFood) */}
        <MarketingSection tone="light">
          <AltFeatureRow
            reverse
            eyebrow={h("migrate.eyebrow")}
            title={h("migrate.title")}
            body={h("migrate.body")}
            bullets={[h("migrate.bullet1"), h("migrate.bullet2"), h("migrate.bullet3")]}
            image={<ScreenshotFrame variant="browser" url="feefreeordering.com/import" alt={h("migrate.frameAlt")} src="/marketing/screenshots/app-import.png" />}
          />
        </MarketingSection>

        {/* Pizza builder */}
        <MarketingSection tone="emeraldTint">
          <AltFeatureRow
            eyebrow={h("pizza.eyebrow")}
            title={h("pizza.title")}
            body={h("pizza.body")}
            bullets={[h("pizza.bullet1"), h("pizza.bullet2"), h("pizza.bullet3")]}
            image={<PizzaSplitGraphic />}
          />
        </MarketingSection>

        {/* Never miss an order */}
        <MarketingSection tone="light">
          <div className="mb-12"><SectionHeading center eyebrow={h("kitchen.eyebrow")} title={h("kitchen.title")} subtitle={h("kitchen.subtitle")} /></div>
          <IconFeatureGrid items={reliability} soonLabel={soon} />
        </MarketingSection>

        {/* Run the business */}
        <MarketingSection tone="emeraldTint">
          <div className="mb-12"><SectionHeading center eyebrow={h("run.eyebrow")} title={h("run.title")} subtitle={h("run.subtitle")} /></div>
          <IconFeatureGrid items={run} soonLabel={soon} />
        </MarketingSection>

        {/* GrowthNet */}
        <MarketingSection tone="light">
          <div className="mb-12"><SectionHeading center eyebrow={h("growthnet.eyebrow")} title={h("growthnet.title")} subtitle={h("growthnet.subtitle")} /></div>
          <GrowthNetShowcase />
        </MarketingSection>

        {/* Add-ons */}
        <MarketingSection tone="gray">
          <div className="mb-12"><SectionHeading center eyebrow={h("addons.eyebrow")} title={h("addons.title")} subtitle={h("addons.subtitle")} /></div>
          <IconFeatureGrid items={addons} soonLabel={soon} />
        </MarketingSection>

        {/* CTA */}
        <CTASection title={h("finalCta.title")} body={h("finalCta.body")} primary={{ href: "/signup", label: h("finalCta.primary") }} secondary={{ href: "/pricing", label: tNav("pricing") }} />
      </main>
      <PublicFooter />
    </div>
  );
}
