import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bike, LayoutDashboard } from "lucide-react";
import prisma from "@/lib/db";
import { FeeFreeDeliveryOps } from "@/app/admin/delivery/pool/FeeFreeDeliveryOps";
import { DispatchLogout } from "./DispatchLogout";

/**
 * Restaurant-facing view of the Fee Free Delivery app (/driver). A restaurant
 * owner who opens the app and is authenticated with their normal ADMIN session
 * (same cookie, path "/") lands here instead of the driver queue. It reuses the
 * exact ops panel from the admin dashboard (FeeFreeDeliveryOps) so dispatch +
 * billing stay a single source of truth — this is just a mobile-first shell
 * around it. Dispatch API calls (SendToDriverButton) authorize off the same
 * admin session, so no new endpoints are needed.
 */
export async function RestaurantDispatch({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  const t = await getTranslations("feefreeApp");
  const config = await prisma.feeFreeDeliveryConfig.findUnique({
    where: { restaurantId },
    select: { enabled: true },
  });

  return (
    <div className="min-h-screen [min-height:100dvh] bg-gray-900">
      <header
        className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
            <Bike className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white leading-tight truncate">{restaurantName}</div>
            <div className="text-[11px] text-emerald-400 leading-tight">{t("dispatchSubtitle")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/admin/delivery/pool"
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-300 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1.5"
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> {t("openDashboard")}
          </Link>
          <DispatchLogout />
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {config?.enabled ? (
          <FeeFreeDeliveryOps restaurantId={restaurantId} />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 mb-3">
              <Bike className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-gray-900">{t("notEnabledTitle")}</h2>
            <p className="text-sm text-gray-500 mt-1">{t("notEnabledBody")}</p>
            <Link
              href="/admin/delivery/pool"
              className="inline-flex items-center gap-1.5 mt-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
            >
              <LayoutDashboard className="w-4 h-4" /> {t("openDashboard")}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
