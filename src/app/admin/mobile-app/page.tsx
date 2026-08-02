import { redirect } from "next/navigation";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import MobileAppClient from "./MobileAppClient";

/**
 * Branded Mobile App — the owner's setup wizard + status page
 * (Luigi 2026-08-02, replacing the 2026-06-14 "Coming Soon" teaser).
 * The client handles all three states itself: unentitled → upsell panel,
 * entitled → 5-stage wizard, approved → per-platform status timeline.
 * "Branded Mobile App" is a product name (untranslated, like Nabil AI).
 */
export default async function MobileAppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const t = await getTranslations("admin.brandedApp");
  const tp = await getTranslations("admin.phoneOrderingPage");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          &larr; {tp("backToAdmin")}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md">
            <Smartphone className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Branded Mobile App</h1>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mt-1">
              {t("pageSubtitle")}
            </p>
          </div>
        </div>
      </div>
      <MobileAppClient />
    </div>
  );
}
