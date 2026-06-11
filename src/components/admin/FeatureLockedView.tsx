"use client";
import Link from "next/link";
import { Sparkles, Lock, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrencyFormat } from "@/lib/currency-context";

/**
 * Generic "this is a paid add-on" upsell wall. Rendered by a marketing page
 * (Autopilot, Marketing Studio, Kickstarter, …) when the restaurant lacks the
 * feature entitlement. The add-on `name` + `description` come straight from the
 * AddOn catalog row (English, like everywhere else add-ons are shown); only the
 * framing strings are translated. The CTA deep-links to the add-on on the
 * billing page. Luigi 2026-06-11.
 */
export function FeatureLockedView({
  name,
  description,
  slug,
  monthlyPriceCents,
}: {
  name: string;
  description: string | null;
  slug: string;
  monthlyPriceCents: number;
}) {
  const t = useTranslations("admin.featureLocked");
  const tSettings = useTranslations("admin.settings");
  const formatCurrency = useCurrencyFormat();

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <div className="bg-gradient-to-br from-emerald-600 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">{t("badge")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{name}</h1>
        {description && (
          <p className="mt-2 text-white/90 text-sm sm:text-base max-w-xl leading-relaxed">{description}</p>
        )}

        {monthlyPriceCents > 0 && (
          <div className="mt-5 inline-flex items-baseline gap-1 bg-white/15 backdrop-blur rounded-xl px-4 py-2">
            <span className="text-3xl font-bold">{formatCurrency(monthlyPriceCents / 100)}</span>
            <span className="text-sm opacity-80">{tSettings("perMonth")}</span>
          </div>
        )}

        <p className="mt-5 text-sm text-white/85 leading-relaxed">{t("subtitle")}</p>

        <div className="mt-5">
          <Link
            href={`/admin/billing/add-ons#${slug}`}
            className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <Lock className="w-4 h-4" /> {t("cta")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Cross-sell the GrowthNet bundle — every paid marketing add-on at
            one discounted price. Brand name stays untranslated. */}
        <p className="mt-4 text-xs text-white/80">
          {t("growthNetHint")}{" "}
          <Link href="/admin/growthnet" className="font-semibold underline underline-offset-2 hover:text-white">
            GrowthNet →
          </Link>
        </p>
      </div>

      <p className="mt-5 text-xs text-gray-500 text-center">{t("footerNote")}</p>
    </div>
  );
}
