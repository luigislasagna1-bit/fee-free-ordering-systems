"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, Users } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Banner shown across the top of /admin/* when the caller is acting as a
 * different restaurant than their own. Two modes:
 *
 *   - "superadmin": platform admin support-impersonating a restaurant. Indigo,
 *     clear endpoint /api/superadmin/impersonate, returns to /superadmin/restaurants.
 *   - "reseller":   reseller partner viewing one of their managed restaurants.
 *     Purple to be visually distinct so the reseller doesn't forget which hat
 *     they're wearing. Clears via /api/reseller/impersonate, returns to /reseller/restaurants.
 */
export function ImpersonationBanner({
  restaurantName,
  mode = "superadmin",
}: {
  restaurantName: string;
  mode?: "superadmin" | "reseller";
}) {
  const t = useTranslations("impersonation");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const exit = async () => {
    setLoading(true);
    if (mode === "reseller") {
      await fetch("/api/reseller/impersonate", { method: "DELETE" });
      router.push("/reseller/restaurants");
    } else {
      await fetch("/api/superadmin/impersonate", { method: "DELETE" });
      router.push("/superadmin/restaurants");
    }
    router.refresh();
  };

  const isReseller = mode === "reseller";
  const bg = isReseller ? "bg-purple-600" : "bg-indigo-600";
  const badge = isReseller ? "Reseller" : "Superadmin";
  const back = isReseller ? "Back to Reseller portal" : t("backToSuperadmin");
  const message = isReseller
    ? `Viewing ${restaurantName} as their reseller`
    : t("banner", { restaurant: restaurantName });

  return (
    <div className={`${bg} text-white px-4 py-2 flex items-center justify-between text-sm flex-shrink-0`}>
      <div className="flex items-center gap-2">
        {isReseller ? <Users className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-white/25 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            {badge}
          </span>
          {message}
        </span>
      </div>
      <button
        onClick={exit}
        disabled={loading}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-lg font-medium disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {back}
      </button>
    </div>
  );
}
