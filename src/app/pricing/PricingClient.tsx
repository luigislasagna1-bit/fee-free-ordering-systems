"use client";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2, Check, ArrowRight, CreditCard, Globe, Link2, Smartphone, Monitor, Phone,
  CalendarCheck, Building2, Store, Infinity as InfinityIcon, Truck, Tag, MessageSquare, QrCode,
  Rocket, Sparkles, Network,
} from "lucide-react";
import { MarketingSection, SectionHeading, PrimaryButton, CTASection } from "@/components/marketing/sections";

export type PricingAddOn = {
  slug: string;
  name: string;
  monthlyPriceCents: number;
  comingSoon: boolean;
  inGrowthNet: boolean;
  displayOrder: number;
};

/* slug → icon + the homepage's already-translated description key (marketing.home.v2.*). */
const META: Record<string, { icon: LucideIcon; descKey: string }> = {
  online_payments: { icon: CreditCard, descKey: "addons.payments.body" },
  hosted_website: { icon: Globe, descKey: "addons.website.body" },
  custom_domain: { icon: Link2, descKey: "addons.domain.body" },
  branded_mobile_app: { icon: Smartphone, descKey: "addons.brandedApp.body" },
  pos_module: { icon: Monitor, descKey: "addons.pos.body" },
  phone_ordering: { icon: Phone, descKey: "addons.aiPhone.body" },
  reservation_deposits: { icon: CalendarCheck, descKey: "addons.deposits.body" },
  multi_location: { icon: Building2, descKey: "addons.multiLocation.body" },
  marketplace: { icon: Store, descKey: "addons.marketplace.body" },
  unlimited_orders: { icon: InfinityIcon, descKey: "addons.unlimited.body" },
  driver_pool: { icon: Truck, descKey: "addons.driver.body" },
  advanced_promos: { icon: Tag, descKey: "growthnet.apmBody" },
  customer_sms: { icon: MessageSquare, descKey: "growthnet.smsBody" },
  marketing_studio: { icon: QrCode, descKey: "growthnet.studioBody" },
  kickstarter: { icon: Rocket, descKey: "growthnet.kickstarterBody" },
  contentpilot: { icon: Sparkles, descKey: "growthnet.contentpilotBody" },
};
const iconFor = (slug: string): LucideIcon => META[slug]?.icon ?? Tag;

export function PricingClient({ locale, addOns }: { locale: string; addOns: PricingAddOn[] }) {
  const t = useTranslations("marketing.pricing");
  const tHome = useTranslations("marketing.home.v2");
  const tNav = useTranslations("marketing.nav");

  const freeIncludes = (t.raw("freeIncludes") as string[]) ?? [];
  const compareItems = (t.raw("compareItems") as string[]) ?? [];

  // Real prices straight from the catalog. >0 → show the price; otherwise the
  // superadmin hasn't priced it yet → "coming soon" (auto-updates when set).
  const priceLabel = (a: PricingAddOn) =>
    !a.comingSoon && a.monthlyPriceCents > 0 ? `$${(a.monthlyPriceCents / 100).toFixed(2)}` : null;
  const descFor = (slug: string) => (META[slug] ? tHome(META[slug].descKey) : "");

  const bundle = addOns.find((a) => a.slug === "growthnet");
  const members = addOns.filter((a) => a.inGrowthNet && a.slug !== "growthnet");
  const standalone = addOns.filter((a) => !a.inGrowthNet && a.slug !== "growthnet");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden bg-white"
          style={{ background: "radial-gradient(80% 80% at 50% 0%, #ecfdf5 0%, rgba(236,253,245,0) 60%), #ffffff" }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">{t("title")}</h1>
            <p className="mt-5 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">{t("subtitle")}</p>
            <p className="mt-3 text-sm text-gray-500">{t("trialNote")}</p>
          </div>
        </section>

        {/* ─── Free-core card ──────────────────────────────────── */}
        <section className="px-4 sm:px-6 lg:px-8 pb-4">
          <div className="max-w-3xl mx-auto rounded-3xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-8 md:p-10 relative shadow-[0_24px_60px_-24px_rgba(16,185,129,0.30)]">
            <div className="absolute -top-3 right-8 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">{t("freeBadge")}</div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">{t("freeTitle")}</h2>
            <p className="text-gray-600 mt-2">{t("freeSubtitle")}</p>
            <div className="flex items-baseline mt-4">
              <span className="text-6xl font-extrabold text-emerald-600">$0</span>
              <span className="text-gray-500 ml-2 text-lg">{t("perMonth")}</span>
            </div>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-gray-800">
              {freeIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <PrimaryButton href="/signup">{t("freeCta")}<ArrowRight className="w-4 h-4" /></PrimaryButton>
            </div>
          </div>
        </section>

        {/* ─── GrowthNet bundle ────────────────────────────────── */}
        {bundle && (
          <MarketingSection tone="light" width="default">
            <div className="rounded-3xl border-2 border-emerald-200 bg-white p-6 md:p-8 shadow-[0_24px_60px_-24px_rgba(16,185,129,0.25)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-7">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                    <Network className="w-3.5 h-3.5" /> {tHome("growthnet.badge")}
                  </div>
                  <h2 className="mt-3 text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">GrowthNet</h2>
                  <p className="mt-1.5 text-gray-600 max-w-xl leading-relaxed">{tHome("growthnet.blurb")}</p>
                </div>
                <div className="text-left md:text-right flex-shrink-0">
                  {priceLabel(bundle) ? (
                    <div className="flex items-baseline gap-1 md:justify-end">
                      <span className="text-4xl font-extrabold text-emerald-600">{priceLabel(bundle)}</span>
                      <span className="text-gray-500">{t("perMonth")}</span>
                    </div>
                  ) : (
                    <span className="text-lg font-bold text-emerald-600">{t("addOnPriceComingSoon")}</span>
                  )}
                  <div className="mt-1 inline-flex items-center gap-1.5 text-emerald-700 text-sm font-bold">
                    <Check className="w-4 h-4" strokeWidth={3} /> {tHome("growthnet.saveTitle")}
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((m) => {
                  const Icon = iconFor(m.slug);
                  const price = priceLabel(m);
                  return (
                    <div key={m.slug} className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4" />
                          </span>
                          <h3 className="font-bold text-gray-900 leading-tight text-sm">{m.name}</h3>
                        </div>
                        <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">{price ?? t("addOnPriceComingSoon")}</span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{descFor(m.slug)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </MarketingSection>
        )}

        {/* ─── À-la-carte add-ons ──────────────────────────────── */}
        <MarketingSection tone="gray">
          <div className="mb-10">
            <SectionHeading center title={t("addOnsTitle")} subtitle={t("addOnsSubtitle")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {standalone.map((a) => {
              const Icon = iconFor(a.slug);
              const price = priceLabel(a);
              return (
                <div key={a.slug} className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.comingSoon ? "bg-gray-100 text-gray-400" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {a.comingSoon ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tHome("soon")}</span>
                    ) : price ? (
                      <div className="text-right leading-none">
                        <span className="text-lg font-extrabold text-gray-900">{price}</span>
                        <span className="text-xs text-gray-500">{t("perMonth")}</span>
                      </div>
                    ) : null}
                  </div>
                  <h3 className="font-bold text-gray-900">{a.name}</h3>
                  <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{descFor(a.slug)}</p>
                  {a.comingSoon && <p className="text-xs text-gray-400 mt-3">{t("addOnPriceComingSoon")}</p>}
                </div>
              );
            })}
          </div>
        </MarketingSection>

        {/* ─── Everything included ─────────────────────────────── */}
        <MarketingSection tone="light" width="narrow">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-7">{t("compareTitle")}</h2>
            <ul className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
              {compareItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-700">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </MarketingSection>

        {/* ─── CTA ─────────────────────────────────────────────── */}
        <CTASection title={t("title")} body={t("subtitle")} primary={{ href: "/signup", label: tNav("startTrial") }} secondary={{ href: "/demo", label: tHome("demo.cta") }} />
      </main>
      <PublicFooter />
    </div>
  );
}
