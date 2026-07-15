import prisma from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { Bike, DollarSign, CalendarClock, Package } from "lucide-react";
import { weekStartUtc, weekEndUtc } from "@/lib/feefree-delivery";
import { haversineKm } from "@/lib/geocode";
import { SendToDriverButton } from "./SendToDriverButton";

const TERMINAL = ["delivered", "failed", "returned", "cancelled"];

/** Next Monday 00:10 UTC — when the weekly settlement cron charges the card. */
function nextChargeDate(now: Date): Date {
  const start = weekStartUtc(now);
  const nextMon = weekEndUtc(start); // next Monday 00:00
  nextMon.setUTCMinutes(10);
  return nextMon;
}

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
  const now = new Date();
  const weekStart = weekStartUtc(now);
  const weekEnd = weekEndUtc(now);

  const [owedAgg, deliveredThisWeek, active, heldOrders, rest] = await Promise.all([
    // Outstanding = frozen fees not yet rolled into a settlement.
    prisma.deliveryAssignment.aggregate({
      _sum: { platformFeeCents: true },
      where: { restaurantId, status: "delivered", settlementId: null },
    }),
    prisma.deliveryAssignment.count({
      where: { restaurantId, status: "delivered", deliveredAt: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.deliveryAssignment.findMany({
      where: { restaurantId, status: { notIn: TERMINAL } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true, status: true,
        driver: { select: { name: true } },
        order: { select: { orderNumber: true, customerName: true, deliveryLat: true, deliveryLng: true } },
      },
    }),
    // Delivery orders in a live status, prepaid-ish, with NO assignment yet
    // (autoSend off holds them here for manual send).
    prisma.order.findMany({
      where: {
        restaurantId,
        type: "delivery",
        status: { in: ["accepted", "preparing", "ready"] },
        deliveryAssignment: null,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, orderNumber: true, customerName: true, paymentStatus: true, total: true, creditApplied: true },
    }),
    // The store's own coordinates — for the restaurant→customer distance shown
    // on each active delivery (Luigi 2026-07-15).
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { lat: true, lng: true } }),
  ]);

  const owed = owedAgg._sum.platformFeeCents ?? 0;
  const charge = nextChargeDate(now);
  // Only surface holds that would actually dispatch (prepaid).
  const held = heldOrders.filter((o) => o.paymentStatus === "paid" || o.total - (o.creditApplied ?? 0) <= 0.009);

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
                  <div className="text-xs text-gray-400">{a.driver?.name ?? t("unassigned")}</div>
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
