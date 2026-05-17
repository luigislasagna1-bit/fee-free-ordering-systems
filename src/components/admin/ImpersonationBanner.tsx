"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, Users, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Banner shown across the top of /admin/* when the caller is acting as a
 * different restaurant than their own. Three modes, color-coded so the
 * operator never confuses which identity layer is active:
 *
 *   - "superadmin":             indigo. Platform admin support-impersonating a restaurant.
 *   - "reseller":               purple. A reseller viewing one of their restaurants.
 *   - "superadmin_as_reseller": red.    Superadmin chained through a reseller to a restaurant.
 *
 * Exit always strips just the restaurant layer (sa_impersonate or
 * partner_impersonate). For the SA-chained mode that leaves the SA-reseller
 * cookie in place, dropping the user back at the reseller portal — exiting
 * the reseller layer is the SuperadminImpersonationBanner's job.
 */
type Mode = "superadmin" | "reseller" | "superadmin_as_reseller";

export function ImpersonationBanner({
  restaurantName,
  mode = "superadmin",
}: {
  restaurantName: string;
  mode?: Mode;
}) {
  const t = useTranslations("impersonation");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const exit = async () => {
    setLoading(true);
    if (mode === "superadmin") {
      await fetch("/api/superadmin/impersonate", { method: "DELETE" });
      router.push("/superadmin/restaurants");
    } else {
      // Both reseller and superadmin_as_reseller exit through the partner
      // impersonate route — that cookie is what's swapping the restaurant.
      // (For SA-chained, the SA-reseller cookie stays so we land back on /reseller.)
      await fetch("/api/reseller/impersonate", { method: "DELETE" });
      router.push("/reseller/restaurants");
    }
    router.refresh();
  };

  const config: Record<Mode, { bg: string; badge: string; icon: React.ReactNode; back: string; message: string }> = {
    superadmin: {
      bg: "bg-indigo-600",
      badge: "Superadmin",
      icon: <Eye className="w-4 h-4" />,
      back: t("backToSuperadmin"),
      message: t("banner", { restaurant: restaurantName }),
    },
    reseller: {
      bg: "bg-purple-600",
      badge: "Reseller",
      icon: <Users className="w-4 h-4" />,
      back: "Back to Reseller portal",
      message: `Viewing ${restaurantName} as their reseller`,
    },
    superadmin_as_reseller: {
      bg: "bg-red-600",
      badge: "SA → Reseller",
      icon: <ShieldAlert className="w-4 h-4" />,
      back: "Back to Reseller portal",
      message: `Viewing ${restaurantName} via the reseller's account`,
    },
  };

  const cfg = config[mode];

  return (
    <div className={`${cfg.bg} text-white px-4 py-2 flex items-center justify-between text-sm flex-shrink-0`}>
      <div className="flex items-center gap-2">
        {cfg.icon}
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-white/25 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            {cfg.badge}
          </span>
          {cfg.message}
        </span>
      </div>
      <button
        onClick={exit}
        disabled={loading}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-lg font-medium disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {cfg.back}
      </button>
    </div>
  );
}
