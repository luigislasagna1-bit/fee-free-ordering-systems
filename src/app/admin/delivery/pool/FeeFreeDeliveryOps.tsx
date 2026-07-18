import { getTranslations } from "next-intl/server";
import { Bike, DollarSign, CalendarClock, Package, Star } from "lucide-react";
import { haversineKm } from "@/lib/geocode";
import { getFeeFreeDeliveryOpsData } from "@/lib/feefree-delivery-ops";
import { SendToDriverButton } from "./SendToDriverButton";

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Restaurant-facing FeeFreeDelivery operations panel (server). Shows the
 * amount owed this cycle + next charge date, the live deliveries with their
 * assigned driver + status, and any orders held for manual dispatch (autoSend
 * off) with a "Send to driver" button. Rendered under the enable toggle.
 */
export async function FeeFreeDeliveryOps({ restaurantId }: { restaurantId: string }) {
  const t = await getTranslations("admin.feefreeDelivery");
  const tCommon = await getTranslations("common");

  // Query source-of-truth moved to the shared lib (v1.1 Phase 6, plan §4.6) so the
  // desktop panel and the app `/ops` route can never drift. Rendering below is
  // unchanged — owed stays PLATFORM money (usd() = PLATFORM_CURRENCY).
  const { owed, deliveredThisWeek, charge, held, active, rest } = await getFeeFreeDeliveryOpsData(restaurantId);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-5">
      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
        <Bike className="w-5 h-5 text-emerald-500" /> {t("opsTitle")}
      </h2>

      {/* Billing summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> {t("amountOwed")}</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{usd(owed)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {t("deliveriesThisWeek")}</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{deliveredThisWeek}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> {t("nextCharge")}</div>
          <div className="text-sm font-semibold text-gray-900 mt-1">{charge.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</div>
        </div>
      </div>

      {/* Held orders — manual dispatch */}
      {held.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">{t("heldTitle")}</h3>
          <div className="space-y-2">
            {held.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-sm">
                  <span className="font-semibold text-gray-900">#{o.orderNumber}</span>
                  <span className="text-gray-500"> · {o.customerName}</span>
                </div>
                <SendToDriverButton orderId={o.id} label={t("sendToDriver")} sendingLabel={t("sending")} failLabel={t("sendFailed")} sentLabel={t("sent")} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active deliveries */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t("activeDeliveries")}</h3>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400">{t("noActiveDeliveries")}</p>
        ) : (
          <div className="space-y-2">
            {active.map((a) => {
              const distKm =
                rest?.lat != null && rest?.lng != null && a.order.deliveryLat != null && a.order.deliveryLng != null
                  ? Math.round(haversineKm(rest.lat, rest.lng, a.order.deliveryLat, a.order.deliveryLng) * 10) / 10
                  : null;
              return (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-gray-900">#{a.order.orderNumber}</span>
                  <span className="text-gray-500"> · {a.order.customerName}</span>
                  {distKm != null && <span className="text-gray-400"> · {tCommon("kmFromStore", { km: distKm })}</span>}
                  <div className="text-xs text-gray-400">
                    {a.driver?.name ?? t("unassigned")}
                    {a.driver && a.driver.ratingPct != null && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-amber-600">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {Math.round(a.driver.ratingPct)}%
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 whitespace-nowrap">
                  {opsStatusLabel(a.status, t)}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function opsStatusLabel(status: string, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const map: Record<string, string> = {
    queued: t("st_queued"),
    assigned: t("st_assigned"),
    accepted: t("st_accepted"),
    started: t("st_started"),
    picked_up: t("st_enroute"),
    out_for_delivery: t("st_enroute"),
  };
  return map[status] ?? status;
}
