import { redirect } from "next/navigation";
import Link from "next/link";
import { MonitorCheck, Rocket, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/**
 * KDS Screen — "Coming Soon" teaser. The real Kitchen Display System is a
 * STANDALONE app (Toast/Square-style) we'll build POST-LAUNCH; this page just
 * puts it on the roadmap so owners see it. Linked from the locked "KDS Screen"
 * section in the sidebar. When it ships: replace this body with the real config,
 * set the kds_screen add-on comingSoon=false + a real price in /superadmin/add-ons.
 * Luigi 2026-06-14. Reuses the phone-ordering teaser's shared strings; "KDS
 * Screen" is a product name (untranslated, like Nabil AI / GrowthNet).
 */
export default async function KdsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const t = await getTranslations("admin.kdsPage");
  const tp = await getTranslations("admin.phoneOrderingPage");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          &larr; {tp("backToAdmin")}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center shadow-md">
            <MonitorCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">KDS Screen</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                <Rocket className="w-3 h-3" />
                {tp("comingSoon")}
              </span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-1">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <p className="text-gray-700 leading-relaxed">{t("body")}</p>
        <div className="mt-5">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 transition"
          >
            {tp("addonCatalogLink")}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
