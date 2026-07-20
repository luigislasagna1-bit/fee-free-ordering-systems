import Link from "next/link";
import { Truck, Lock, Sparkles, Check } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shown on /admin/delivery/pool when the restaurant doesn't have the
 * `driver_pool` entitlement. Unlocked by the standalone Driver Pool add-on
 * (the Marketplace no longer bundles it — the Marketplace is free + included
 * and grants only marketplace_listing).
 */
export function DriverPoolLockedView() {
  const t = useTranslations("admin.driverPoolLocked");
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="bg-gradient-to-br from-blue-500 to-amber-600 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">{t("addonBadge")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("heroTitle")}
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">
          {t("heroDescription")}
        </p>

        <div className="mt-6 flex gap-3 flex-wrap">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 hover:bg-blue-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <Lock className="w-4 h-4" /> {t("ctaGetDriverPool")}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Truck className="w-5 h-5" />}
          title={t("feature1Title")}
          body={t("feature1Body")}
        />
        <FeatureCard
          icon={<Check className="w-5 h-5" />}
          title={t("feature2Title")}
          body={t("feature2Body")}
        />
        <FeatureCard
          icon={<Sparkles className="w-5 h-5" />}
          title={t("feature3Title")}
          body={t("feature3Body")}
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
