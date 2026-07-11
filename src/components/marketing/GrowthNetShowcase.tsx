"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ArrowRight, Tag, QrCode, Rocket, MessageSquare, Sparkles, Layers } from "lucide-react";
import { ScreenshotFrame } from "./sections";

/**
 * GrowthNet shown as what it actually is: a single discounted BUNDLE that wraps
 * several individual marketing/retention products (each also sellable on its
 * own). NOT a pricing "tier". A full-width Smart Link analytics screenshot sits
 * above an emerald-bordered bundle container holding the member products.
 *
 * Price-light by design — the homepage links to /pricing for numbers; the
 * individual-vs-bundle price table lives on /pricing once the owner sets prices.
 *
 * ACCURACY: members map 1:1 to the inGrowthNet add-ons in prisma/seed-addons.ts
 * (advanced_promos, marketing_studio, kickstarter, customer_sms, contentpilot).
 * Marketplace is deliberately NOT a member. Only APM and Kickstarter are live at
 * launch — Marketing Studio, Customer SMS and ContentPilot are coming-soon →
 * tagged "Soon". Member NAMES are brand/product names → never translated;
 * the bodies + labels translate via marketing.home.v2.growthnet.*.
 */
const MEMBER_DEFS: { icon: typeof Tag; name: string; bodyKey: string; comingSoon?: boolean }[] = [
  { icon: Tag, name: "APM (Advanced Promo Marketing)", bodyKey: "apmBody" },
  { icon: QrCode, name: "Marketing Studio", bodyKey: "studioBody", comingSoon: true },
  { icon: Rocket, name: "Kickstarter", bodyKey: "kickstarterBody" },
  { icon: MessageSquare, name: "Customer SMS", bodyKey: "smsBody", comingSoon: true },
  { icon: Sparkles, name: "ContentPilot", bodyKey: "contentpilotBody", comingSoon: true },
];

export function GrowthNetShowcase({ analyticsSrc }: { analyticsSrc?: string }) {
  const t = useTranslations("marketing.home.v2");
  return (
    <div>
      {/* Smart Link analytics — the GrowthNet "wow" */}
      <div className="mb-12 max-w-4xl mx-auto">
        <ScreenshotFrame
          variant="browser"
          url="app.feefreeordering.com/growthnet"
          alt={t("growthnet.frameAlt")}
          src={analyticsSrc}
        />
      </div>

      {/* The bundle container */}
      <div className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-6 md:p-8 shadow-[0_24px_60px_-24px_rgba(16,185,129,0.30)]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <Layers className="w-3.5 h-3.5" /> {t("growthnet.badge")}
            </div>
            <h3 className="mt-3 text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">GrowthNet</h3>
            <p className="mt-1.5 text-gray-600 leading-relaxed max-w-xl">
              {t("growthnet.blurb")}
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl hover:bg-emerald-600 transition duration-200 hover:-translate-y-0.5 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)] whitespace-nowrap"
          >
            {t("growthnet.pricingCta")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MEMBER_DEFS.map((m) => (
            <div key={m.name} className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${m.comingSoon ? "bg-gray-100 text-gray-400" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"}`}>
                  <m.icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 leading-tight">{m.name}</h4>
                  {m.comingSoon ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t("soon")}</span>
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{t(`growthnet.${m.bodyKey}`)}</p>
            </div>
          ))}

          {/* Value tile — bundle vs separate (price-light) */}
          <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-5 flex flex-col justify-center">
            <div className="flex items-center gap-2 text-emerald-700 font-bold">
              <Check className="w-4 h-4" strokeWidth={3} /> {t("growthnet.saveTitle")}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              {t.rich("growthnet.saveBody", {
                link: (c) => <Link href="/pricing" className="text-emerald-700 font-semibold hover:underline">{c}</Link>,
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
