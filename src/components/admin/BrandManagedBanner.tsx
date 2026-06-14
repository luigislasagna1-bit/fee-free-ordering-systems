import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Read-only banner for a CHILD location's editor pages (Opening Hours, Delivery
 * Zones, …) when that setting is currently INHERITED from the brand. Pairs with
 * blockIfInheritingSetting on the server: the page dims the editor + makes it
 * non-interactive, and this explains why + links to where to turn it off.
 * Luigi 2026-06-14.
 */
export async function BrandManagedBanner() {
  const t = await getTranslations("admin.locations");
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
      <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-amber-900 min-w-0">
        <div className="font-semibold">{t("lockedByBrand")}</div>
        <p className="mt-0.5 leading-snug">{t("brandManagedEditNotice")}</p>
        <Link
          href="/admin/locations"
          className="inline-block mt-1.5 font-semibold text-amber-700 hover:text-amber-900 underline"
        >
          {t("brandControlsLabel")}
        </Link>
      </div>
    </div>
  );
}
