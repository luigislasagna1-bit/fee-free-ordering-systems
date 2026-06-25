import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReportScopeLocation } from "@/lib/reports/report-scope";

/**
 * Shown on a PER-LOCATION report (Heatmap / Google Rank / Connectivity /
 * End-of-Day) when a brand PARENT opens it without picking a location. Those
 * metrics don't aggregate across a chain — geography, per-domain SEO, per-device
 * uptime, per-store operational day — so the owner chooses one location and the
 * page re-renders for it via `?loc=<id>` (preserving the date range).
 */
export async function LocationChooser({ locations, baseQuery }: { locations: ReportScopeLocation[]; baseQuery: string }) {
  const t = await getTranslations("admin.reportsHome");
  const sep = baseQuery ? "&" : "";
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-5 h-5 text-amber-500" />
        <h2 className="font-semibold text-gray-900">{t("chooserTitle")}</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t("chooserSubtitle")}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {locations.map((loc) => (
          <Link
            key={loc.id}
            href={`?${baseQuery}${sep}loc=${loc.id}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-3 hover:border-emerald-300 hover:shadow-sm transition"
          >
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                {loc.name}
                {loc.isParent && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{t("brandBadge")}</span>
                )}
              </div>
              {loc.city && <div className="text-xs text-gray-500 truncate">{loc.city}</div>}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * "Viewing: <location> · Change location" chip shown on a per-location report
 * when a brand parent has drilled into one location via `?loc`. The Change link
 * clears `?loc` → back to the chooser.
 */
export async function ActiveLocationChip({ name, baseQuery }: { name: string; baseQuery: string }) {
  const t = await getTranslations("admin.reportsHome");
  return (
    <div className="mb-4 flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 text-xs font-semibold">
        <Building2 className="w-3.5 h-3.5" /> {t("viewingLocation")}: {name}
      </span>
      <Link href={baseQuery ? `?${baseQuery}` : "?"} className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold">
        {t("changeLocation")}
      </Link>
    </div>
  );
}
