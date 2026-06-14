import Link from "next/link";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Reusable "this page is a paid add-on" upsell, shown server-side in place of a
 * locked feature's real UI (e.g. Locations without the Multi-Location add-on).
 * The nav already shows the lock; this is the conversion surface behind it.
 * Reuses the existing admin.featureLocked strings — no new i18n. Luigi 2026-06-14.
 *
 * Pass the add-on's product NAME (e.g. "Multi-Location") for the heading; it
 * matches the name shown in /admin/billing/add-ons.
 */
export async function FeatureLockedNotice({ featureName }: { featureName: string }) {
  const t = await getTranslations("admin.featureLocked");
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <h1 className="text-xl font-bold text-amber-900">{featureName}</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {t("badge")}
          </span>
        </div>
        <p className="text-sm text-amber-800 mt-2 leading-relaxed">{t("subtitle")}</p>
        <Link
          href="/admin/billing/add-ons"
          className="mt-4 inline-block px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 transition"
        >
          {t("cta")}
        </Link>
        <p className="text-xs text-amber-700/70 mt-3">{t("footerNote")}</p>
      </div>
    </div>
  );
}
