"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  ArrowRight, Target, Users, Tag, QrCode, Store, Upload, Repeat,
  CreditCard, Globe, Building2, Infinity as InfinityIcon, Link2, Truck, Smartphone, Monitor, Phone, CalendarCheck,
  BellRing, PhoneCall, RefreshCw, ShieldCheck, Receipt, ScanLine, BarChart3, Database, TrendingUp, Headset,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MarketingSection, SectionEyebrow, SectionHeading, PrimaryButton, SecondaryButton,
  ScreenshotFrame, StatTrustStrip, AltFeatureRow, IconFeatureGrid, type IconFeature,
  NumberedSteps, CTASection,
} from "@/components/marketing/sections";
import { FunnelGraphic } from "@/components/marketing/FunnelGraphic";
import { GrowthNetShowcase } from "@/components/marketing/GrowthNetShowcase";
import { PizzaSplitGraphic } from "@/components/marketing/PizzaSplitGraphic";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";

/**
 * Marketing homepage — high-end LIGHT redesign (2026-06-20).
 *
 * Craft over colour: real product screenshots in clean frames, generous
 * whitespace, soft shadows, refined type. EXACT existing palette (emerald-500 +
 * gray/slate; amber/orange only as soft mockup bg). Light throughout — NO dark
 * sections. Fully translated across all 38 locales via the `marketing.home.v2.*`
 * namespace (text is in src/messages/*; structure/icons stay here).
 *
 * SCREENSHOT SLOTS (capture from the polished demo into /public/marketing/screenshots/):
 *   ordering-home (browser,S1) · menu-item (phone,S3) · checkout (phone,S4)
 *   kitchen-tile (phone,S6) · reports-dashboard (browser,S7) · smartlink-analytics (browser,S8)
 *   menu-import (browser,S10) · storefront (browser,S13)
 */

/* Structural defs — icons + comingSoon flags live here; all visible text comes
   from t() so it translates. The `key` maps to marketing.home.v2.<group>.<key>.* */
const ADDON_DEFS: { icon: LucideIcon; key: string; comingSoon?: boolean }[] = [
  { icon: CreditCard, key: "payments" },
  { icon: Globe, key: "website" },
  { icon: Building2, key: "multiLocation" },
  { icon: Store, key: "marketplace" },
  { icon: InfinityIcon, key: "unlimited" },
  { icon: Link2, key: "domain", comingSoon: true },
  { icon: Truck, key: "driver", comingSoon: true },
  { icon: Smartphone, key: "brandedApp", comingSoon: true },
  { icon: Monitor, key: "pos", comingSoon: true },
  { icon: Phone, key: "aiPhone", comingSoon: true },
  { icon: CalendarCheck, key: "deposits", comingSoon: true },
];

const RELIABILITY_DEFS: { icon: LucideIcon; key: string }[] = [
  { icon: BellRing, key: "ring" },
  { icon: PhoneCall, key: "call" },
  { icon: RefreshCw, key: "autoReject" },
  { icon: ShieldCheck, key: "chargeOnAccept" },
  { icon: Receipt, key: "receipts" },
  { icon: ScanLine, key: "printer" },
];

const RUN_DEFS: { icon: LucideIcon; key: string }[] = [
  { icon: BarChart3, key: "reports" },
  { icon: Database, key: "crm" },
  { icon: Tag, key: "promos" },
  { icon: TrendingUp, key: "insights" },
  { icon: Repeat, key: "reorder" },
  { icon: Users, key: "accounts" },
];

const INTEGRATION_GROUPS: { key: string; logos: string[] }[] = [
  { key: "payments", logos: ["Stripe", "PayPal"] },
  { key: "printers", logos: ["Star Micronics", "Epson", "Bixolon", "Citizen"] },
  { key: "delivery", logos: ["Shipday"] },
  { key: "analytics", logos: ["Google Analytics", "Facebook Pixel"] },
  { key: "migration", logos: ["GloriaFood", "PDF import"] },
  { key: "voice", logos: ["Twilio"] },
];
const INTEGRATIONS_ROADMAP = ["Uber Eats", "DoorDash", "Tookan", "Lalamove"];

export function HomeClient({ locale }: { locale: string }) {
  const t = useTranslations("marketing.home.v2");
  const soon = t("soon");

  const addons: IconFeature[] = ADDON_DEFS.map((a) => ({
    icon: a.icon, title: t(`addons.${a.key}.title`), body: t(`addons.${a.key}.body`), comingSoon: a.comingSoon,
  }));
  const runBusiness: IconFeature[] = RUN_DEFS.map((r) => ({
    icon: r.icon, title: t(`run.${r.key}.title`), body: t(`run.${r.key}.body`),
  }));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />

      {/* ── S1 · HERO ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-white"
        style={{ background: "radial-gradient(80% 90% at 12% 0%, #ecfdf5 0%, rgba(236,253,245,0) 55%), #ffffff" }}
      >
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <SectionEyebrow icon={Target}>{t("hero.eyebrow")}</SectionEyebrow>
            <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight">
              {t.rich("hero.title", { accent: (c) => <span className="text-emerald-600">{c}</span> })}
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <PrimaryButton href="/signup">{t("hero.ctaStart")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
              <SecondaryButton href="/demo">{t("hero.ctaDemo")}</SecondaryButton>
            </div>
            <StatTrustStrip
              className="mt-7"
              items={[t("hero.trust1"), t("hero.trust2"), t("hero.trust3"), t("hero.trust4")]}
            />
          </div>

          <div className="relative">
            <ScreenshotFrame variant="browser" glow url="luigis.feefreeordering.com" alt={t("hero.frameAlt")} src="/marketing/screenshots/luigis-order-top-desktop.png" />
            <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg rotate-3">
              {t("hero.badge")}
            </div>
          </div>
        </div>
      </section>

      {/* ── S2 · FUNNEL ───────────────────────────────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-16 items-center">
          <SectionHeading
            eyebrow={t("funnel.eyebrow")}
            title={t.rich("funnel.title", { accent: (c) => <span className="text-emerald-600">{c}</span> })}
            subtitle={t("funnel.subtitle")}
          />
          <FunnelGraphic />
        </div>
      </MarketingSection>

      {/* ── S3 · FREE CORE — ordering page ────────────────────────────────── */}
      <MarketingSection tone="light">
        <AltFeatureRow
          reverse
          eyebrow={t("ordering.eyebrow")}
          title={t("ordering.title")}
          body={t("ordering.body")}
          bullets={[t("ordering.bullet1"), t("ordering.bullet2"), t("ordering.bullet3")]}
          cta={{ href: "/signup", label: t("ordering.cta") }}
          image={<ScreenshotFrame variant="phone" alt={t("ordering.frameAlt")} src="/marketing/screenshots/luigis-menu-mobile.png" />}
        />
      </MarketingSection>

      {/* ── S4 · FREE CORE — checkout & reservations ──────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <AltFeatureRow
          eyebrow={t("checkout.eyebrow")}
          title={t("checkout.title")}
          body={t("checkout.body")}
          bullets={[t("checkout.bullet1"), t("checkout.bullet2"), t("checkout.bullet3")]}
          image={<ScreenshotFrame variant="phone" alt={t("checkout.frameAlt")} />}
        />
      </MarketingSection>

      {/* ── S5 · BUILT FOR PIZZA SHOPS (half-and-half) ────────────────────── */}
      <MarketingSection tone="light">
        <AltFeatureRow
          reverse
          eyebrow={t("pizza.eyebrow")}
          title={t("pizza.title")}
          body={t("pizza.body")}
          bullets={[t("pizza.bullet1"), t("pizza.bullet2"), t("pizza.bullet3")]}
          image={<PizzaSplitGraphic />}
        />
      </MarketingSection>

      {/* ── S6 · NEVER MISS AN ORDER (kitchen reliability) ────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow={t("kitchen.eyebrow")}
            title={t("kitchen.title")}
            subtitle={t("kitchen.subtitle")}
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <ScreenshotFrame variant="phone" alt={t("kitchen.frameAlt")} />
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
            {RELIABILITY_DEFS.map((r) => (
              <div key={r.key} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0 shadow-sm">
                  <r.icon className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900 text-sm leading-tight">{t(`kitchen.${r.key}.title`)}</div>
                  <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{t(`kitchen.${r.key}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 text-center">
          <p className="text-sm font-semibold text-gray-700 mb-4">{t("kitchen.getApp")}</p>
          <div className="flex justify-center"><AppDownloadBadges /></div>
        </div>
      </MarketingSection>

      {/* ── S7 · RUN THE BUSINESS (reports + CRM + promos) ────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow={t("run.eyebrow")}
            title={t("run.title")}
            subtitle={t("run.subtitle")}
          />
        </div>
        <div className="mb-12 max-w-4xl mx-auto">
          <ScreenshotFrame variant="browser" url="app.feefreeordering.com/reports" alt={t("run.frameAlt")} />
        </div>
        <IconFeatureGrid items={runBusiness} soonLabel={soon} />
      </MarketingSection>

      {/* ── S8 · GROWTHNET BUNDLE ─────────────────────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow={t("growthnet.eyebrow")}
            title={t("growthnet.title")}
            subtitle={t("growthnet.subtitle")}
          />
        </div>
        <GrowthNetShowcase />
      </MarketingSection>

      {/* ── S9 · À-LA-CARTE ADD-ONS (no tiers) ────────────────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow={t("addons.eyebrow")}
            title={t("addons.title")}
            subtitle={t("addons.subtitle")}
          />
        </div>
        <IconFeatureGrid items={addons} soonLabel={soon} />
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-500">
            {t.rich("addons.capNote", { b: (c) => <span className="font-semibold text-gray-700">{c}</span> })}
          </p>
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-1.5 text-emerald-700 font-bold hover:gap-2.5 transition-all">
            {t("addons.pricingCta")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </MarketingSection>

      {/* ── S10 · SWITCH IN MINUTES (migration) ───────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <AltFeatureRow
          reverse
          eyebrow={t("migrate.eyebrow")}
          title={t("migrate.title")}
          body={t("migrate.body")}
          bullets={[t("migrate.bullet1"), t("migrate.bullet2"), t("migrate.bullet3")]}
          cta={{ href: "/signup", label: t("migrate.cta") }}
          image={<ScreenshotFrame variant="browser" url="app.feefreeordering.com/menu/import" alt={t("migrate.frameAlt")} />}
        />
      </MarketingSection>

      {/* ── S11 · HOW IT WORKS + INTEGRATIONS ─────────────────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading center title={t("steps.title")} />
        </div>
        <NumberedSteps
          steps={[
            { title: t("steps.step1.title"), body: t("steps.step1.body"), icon: Upload },
            { title: t("steps.step2.title"), body: t("steps.step2.body"), icon: QrCode },
            { title: t("steps.step3.title"), body: t("steps.step3.body"), icon: Store },
          ]}
        />

        {/* Integrations — grouped */}
        <div className="mt-16 border-t border-gray-100 pt-12">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-gray-400 mb-7">{t("integrations.heading")}</div>
          <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
            {INTEGRATION_GROUPS.map((g) => (
              <div key={g.key} className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-2">{t(`integrations.${g.key}`)}</div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {g.logos.map((l) => (
                    <span key={l} className="text-sm font-semibold text-gray-500">{l}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center text-xs text-gray-400">
            {t("integrations.roadmap")}{" "}
            {INTEGRATIONS_ROADMAP.map((r, i) => (
              <span key={r} className="font-medium text-gray-400">{r}{i < INTEGRATIONS_ROADMAP.length - 1 ? " · " : ""}</span>
            ))}
          </div>
        </div>
      </MarketingSection>

      {/* ── S12 · PROUDLY CANADIAN + 24/7 SUPPORT (slim band) ─────────────── */}
      <section className="bg-emerald-50/40 border-y border-emerald-100/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <span aria-hidden>🍁</span> {t("canada.badge")}
            </div>
            <h2 className="mt-4 text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
              {t("canada.title")}
            </h2>
            <p className="mt-2 text-gray-600 leading-relaxed max-w-lg">
              {t("canada.body")}
            </p>
          </div>
          <div className="md:justify-self-end flex items-start gap-3 rounded-2xl bg-white border border-gray-200/80 p-5 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)] max-w-sm">
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0">
              <Headset className="w-5 h-5" />
            </span>
            <div>
              <div className="font-bold text-gray-900">{t("canada.supportTitle")}</div>
              <p className="text-sm text-gray-600 leading-relaxed mt-0.5">
                {t.rich("canada.supportBody", {
                  phone: (c) => <a href="tel:+18886188765" className="font-semibold text-emerald-700 hover:underline whitespace-nowrap">{c}</a>,
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── S13 · DEMO SHOWCASE ───────────────────────────────────────────── */}
      <MarketingSection tone="gray">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <SectionHeading
              title={t("demo.title")}
              subtitle={t("demo.subtitle")}
            />
            <div className="mt-8">
              <PrimaryButton href="/demo" className="!px-6 !py-3">{t("demo.cta")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
            </div>
          </div>
          <ScreenshotFrame variant="browser" url="luigis.feefreeordering.com" alt={t("demo.frameAlt")} src="/marketing/screenshots/luigis-root-desktop.png" />
        </div>
      </MarketingSection>

      {/* ── S14 · RESELLER STRIP (slim) ───────────────────────────────────── */}
      <section className="bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0">
            <Users className="w-5 h-5" />
          </span>
          <span className="text-gray-700">
            {t.rich("reseller.text", { b: (c) => <strong>{c}</strong> })}
          </span>
          <Link href="/partners" className="text-emerald-700 font-bold hover:underline whitespace-nowrap">
            {t("reseller.cta")}
          </Link>
        </div>
      </section>

      {/* ── S15 · FINAL CTA ───────────────────────────────────────────────── */}
      <CTASection
        title={t("finalCta.title")}
        body={t("finalCta.body")}
        primary={{ href: "/signup", label: t("finalCta.primary") }}
        secondary={{ href: "/demo", label: t("finalCta.secondary") }}
      />

      <PublicFooter />
    </div>
  );
}
