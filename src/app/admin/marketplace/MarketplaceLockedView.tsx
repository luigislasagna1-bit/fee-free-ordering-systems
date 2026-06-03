import Link from "next/link";
import { Sparkles, Check, TrendingUp, Users, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shown on /admin/marketplace when the restaurant doesn't have the
 * `marketplace_listing` entitlement. Marketing copy + pricing math
 * + CTA to the add-ons page.
 *
 * The math hook ($200 = 660 in UberEats commissions ≈ unlimited
 * orders on our marketplace) is the core selling point. Show it
 * BIG. Numbers convert.
 */
export function MarketplaceLockedView() {
  const t = useTranslations("admin.marketplaceLocked");
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="bg-gradient-to-br from-emerald-600 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">{t("addonBadge")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("heading")}
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">
          {t.rich("subheading", { code: (c) => <code className="bg-white/15 px-1.5 py-0.5 rounded text-xs">{c}</code> })}
        </p>

        {/* Two billing modes side-by-side. Monthly is the predictable
            high-volume choice (includes Driver Pool); PAYG is the no-
            commitment opt-in. Both list you on /marketplace identically. */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/20 backdrop-blur rounded-xl p-4 border-2 border-white/50">
            <div className="text-xs uppercase tracking-wider opacity-80 font-bold">{t("monthlyPlanLabel")}</div>
            <div className="text-3xl font-bold mt-1">$199.99<span className="text-lg">/mo</span></div>
            <div className="text-sm opacity-90">{t("monthlyUnlimitedOrders")}</div>
            <ul className="mt-3 space-y-1 text-xs opacity-90">
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {t("monthlyFeatureNoFees")}</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {t("monthlyFeatureDriverPool")}</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {t("monthlyFeatureFixedBill")}</li>
            </ul>
            <div className="text-[10px] opacity-70 mt-2">{t("taxNote")}</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider opacity-80 font-bold">{t("paygLabel")}</div>
            <div className="text-3xl font-bold mt-1">$3<span className="text-lg">/order</span></div>
            <div className="text-sm opacity-90">{t("paygCap")}</div>
            <ul className="mt-3 space-y-1 text-xs opacity-90">
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {t("paygFeatureNoSubscription")}</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {t("paygFeatureFreeAbove83")}</li>
              <li className="flex items-center gap-1.5 opacity-60"><span className="w-3 h-3 text-center leading-3">×</span> {t("paygFeatureDriverPoolSeparate")}</li>
            </ul>
            <div className="text-[10px] opacity-70 mt-2">{t("taxNote")}</div>
          </div>
        </div>

        <div className="mt-4 bg-white/15 backdrop-blur rounded-lg p-3 text-xs leading-relaxed border border-white/30">
          <strong className="block mb-1">{t("recommendationHeading")}</strong>
          {t.rich("recommendationBody", { strong: (c) => <strong>{c}</strong> })}
        </div>

        <div className="mt-3 bg-white/10 backdrop-blur rounded-lg p-3 text-xs leading-relaxed">
          <strong className="block mb-0.5">{t("compareHeading")}</strong>
          {t.rich("compareBody", { strong: (c) => <strong>{c}</strong> })}
        </div>

        <div className="mt-5 flex gap-3 flex-wrap">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center justify-center gap-2 bg-white text-emerald-600 hover:bg-emerald-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <Lock className="w-4 h-4" /> {t("ctaMonthly")}
          </Link>
          <Link
            href="/admin/marketplace/payg-opt-in"
            className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-bold px-5 py-2.5 rounded-xl text-sm transition border border-white/30"
          >
            <Sparkles className="w-4 h-4" /> {t("ctaPayg")}
          </Link>
        </div>
      </div>

      {/* What you get */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Users className="w-5 h-5" />}
          title={t("featureLocalTitle")}
          body={t("featureLocalBody")}
        />
        <FeatureCard
          icon={<TrendingUp className="w-5 h-5" />}
          title={t("featureAutoListedTitle")}
          body={t("featureAutoListedBody")}
        />
        <FeatureCard
          icon={<Check className="w-5 h-5" />}
          title={t("featureDriverPoolTitle")}
          body={t("featureDriverPoolBody")}
        />
      </div>

      <div className="mt-6 text-xs text-gray-500 text-center">
        {t("footerNote")}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
