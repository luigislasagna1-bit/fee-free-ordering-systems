"use client";
import Link from "next/link";
import { Check, ChevronRight, Network, Rocket, Sparkles, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrencyFormat } from "@/lib/currency-context";

/**
 * GrowthNet tab UI. Add-on names/descriptions come from the catalog (English,
 * like every other add-on surface); framing strings are translated. Currency
 * formatting comes from the admin layout's CurrencyProvider.
 *
 * States per member card:
 *   - active individually or via the bundle → green Active badge
 *   - otherwise → price + "Enable individually" (deep-link to billing flow)
 * Bundle hero: discounted price vs summed individual value + savings badge;
 * already-subscribed restaurants see the active banner instead of the CTA.
 */
type AddOnLite = {
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  comingSoon?: boolean;
};

export function GrowthNetClient({
  bundle,
  members,
  marketplace,
  activeSlugs,
  bundleActive,
  individualValueCents,
}: {
  bundle: AddOnLite | null;
  members: AddOnLite[];
  marketplace: AddOnLite | null;
  activeSlugs: string[];
  bundleActive: boolean;
  individualValueCents: number;
}) {
  const t = useTranslations("admin.growthnet");
  const tCommon = useTranslations("common");
  const tSettings = useTranslations("admin.settings");
  const formatCurrency = useCurrencyFormat();

  const active = new Set(activeSlugs);
  const bundlePrice = bundle?.monthlyPriceCents ?? 0;
  const savingsPercent =
    bundlePrice > 0 && individualValueCents > bundlePrice
      ? Math.round((1 - bundlePrice / individualValueCents) * 100)
      : 0;

  return (
    <div className="max-w-4xl">
      {/* Hero — the bundle pitch */}
      <div className="bg-gradient-to-br from-emerald-600 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">{t("tagline")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">GrowthNet</h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">{t("heroBody")}</p>

        {bundleActive ? (
          <div className="mt-5 inline-flex items-center gap-2 bg-white/20 backdrop-blur border border-white/40 rounded-xl px-4 py-2.5 text-sm font-semibold">
            <Check className="w-4 h-4" /> {t("activeBanner")}
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-end gap-4 flex-wrap">
              {bundlePrice > 0 && (
                <div className="inline-flex items-baseline gap-1 bg-white/15 backdrop-blur rounded-xl px-4 py-2">
                  <span className="text-3xl font-bold">{formatCurrency(bundlePrice / 100)}</span>
                  <span className="text-sm opacity-80">{tSettings("perMonth")}</span>
                </div>
              )}
              {savingsPercent > 0 && (
                <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
                  <Sparkles className="w-3.5 h-3.5" /> {t("savingsBadge", { percent: savingsPercent })}
                </span>
              )}
            </div>
            {individualValueCents > bundlePrice && bundlePrice > 0 && (
              <p className="mt-1.5 text-xs text-white/70">
                {t("individualValue", { amount: `${formatCurrency(individualValueCents / 100)}${tSettings("perMonth")}` })}
              </p>
            )}
            <div className="mt-5">
              <Link
                href="/admin/billing/add-ons#growthnet"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
              >
                <Rocket className="w-4 h-4" /> {t("ctaSubscribe")} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        )}

        <p className="mt-4 text-xs text-white/75 leading-relaxed max-w-2xl">{t("futureNote")}</p>
      </div>

      {/* Member tools */}
      <h2 className="mt-8 mb-3 text-sm font-semibold text-gray-800 uppercase tracking-wide">{t("whatsInside")}</h2>
      <div className="space-y-3">
        {members.map((m) => {
          const isActive = bundleActive || active.has(m.slug);
          return (
            <div
              key={m.slug}
              className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl"
            >
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      <Check className="w-3 h-3" /> {bundleActive && !active.has(m.slug) ? t("includedViaBundle") : tCommon("active")}
                    </span>
                  )}
                </div>
                {m.description && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{m.description}</div>}
              </div>
              {!isActive && (
                <div className="flex flex-col items-end flex-shrink-0 gap-1.5">
                  <div className="text-sm font-bold text-gray-900 whitespace-nowrap">
                    {formatCurrency(m.monthlyPriceCents / 100)}
                    <span className="text-xs font-normal text-gray-400">{tSettings("perMonth")}</span>
                  </div>
                  <Link
                    href={`/admin/billing/add-ons#${m.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1 rounded-lg transition"
                  >
                    {t("enableIndividually")} <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Marketplace — a growth channel with its own billing, sold separately */}
      {marketplace && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-gray-800 uppercase tracking-wide">{t("moreChannels")}</h2>
          <div className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl">
            <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-sky-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">{marketplace.name}</span>
                {active.has("marketplace") ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    <Check className="w-3 h-3" /> {tCommon("active")}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {t("soldSeparately")}
                  </span>
                )}
              </div>
              {marketplace.description && (
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{marketplace.description}</div>
              )}
            </div>
            <Link
              href="/admin/marketplace"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-lg transition flex-shrink-0"
            >
              {tCommon("open")} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
