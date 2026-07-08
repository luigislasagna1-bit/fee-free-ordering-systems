import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { childBuildLines } from "@/lib/bundle-child-lines";
import { getTranslations } from "next-intl/server";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { formatCurrency } from "@/lib/utils";
import { getOrderRewardSummary } from "@/lib/reward-ledger";
import { paymentMethodLabelKey } from "@/lib/payment-label";

/**
 * Admin order-detail page. The reports List View links each order here
 * (/admin/orders/[id]) — previously a 404 (no such route existed; the
 * operational queue at /admin/orders only expands rows in place and can't be
 * deep-linked to a historical order). Read-only, reuses the queue's i18n keys.
 *
 * Ownership: the order's restaurantId must be inside the account's REPORT SCOPE
 * (a single store → itself; a brand parent → any of its locations) — identical
 * to how the report lists them, so a chain owner can open any location's order
 * but no one can read another tenant's. Luigi 2026-06-26.
 */
const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  preparing: "bg-emerald-100 text-emerald-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const scope = await resolveReportScope(user.restaurantId);
  const order = await prisma.order.findFirst({
    where: { id, restaurantId: { in: scope.ids } },
    include: {
      items: { include: { modifiers: true } },
      customer: true,
      restaurant: { select: { name: true, currency: true, timezone: true, rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true } },
    },
  });
  if (!order) notFound();

  const tConf = await getTranslations("customer.confirmation");
  const t = await getTranslations("admin.orders");
  const tc = await getTranslations("common");
  const tk = await getTranslations("checkout");
  const tOrd = await getTranslations("ordering");
  const tRoot = await getTranslations();
  const currency = (order.restaurant?.currency ?? "USD").toUpperCase();
  // Reward / store credit on this order (used + earned). Not a hot path (single
  // page load), so the ledger read for `earned` is fine here. Luigi 2026-07-02.
  const rewardsActive = !!order.restaurant?.rewardsEnabled && !!order.customerId;
  const rewardLabel =
    order.restaurant?.rewardLabelPlural?.trim() ||
    order.restaurant?.rewardLabelSingular?.trim() ||
    tRoot("money.pay.rewardCredit");
  const rewardUsed = rewardsActive ? (order.creditApplied ?? 0) : 0;
  const rewardEarned = rewardsActive ? (await getOrderRewardSummary(order.id)).earned : 0;
  const paymentLabel = (() => {
    const k = paymentMethodLabelKey(order.paymentMethod, order.type);
    return k ? tRoot(k) : (order.paymentMethod ?? "").replace(/_/g, " ");
  })();
  const tz = order.restaurant?.timezone ?? undefined;
  const money = (n: number) => formatCurrency(n, currency);
  const statusLabel = (() => { try { return t(order.status as any); } catch { return order.status; } })();
  const placedAt = order.createdAt.toLocaleString([], {
    timeZone: tz, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const scheduledAt = order.scheduledFor
    ? (() => {
        const start = new Date(order.scheduledFor).toLocaleString([], { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        // Range-mode slot (Fabrizio cmqqxerxs): show the promised WINDOW.
        const w = (order as any).scheduledSlotMinutes;
        if (typeof w === "number" && w > 0) {
          const end = new Date(new Date(order.scheduledFor).getTime() + w * 60_000)
            .toLocaleTimeString([], { timeZone: tz, hour: "numeric", minute: "2-digit" });
          return `${start} – ${end}`;
        }
        return start;
      })()
    : null;
  const discount = (order.couponDiscount ?? 0) + (order.promoDiscount ?? 0);
  const isDelivery = order.type === "delivery";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <Link href="/admin/reports/list/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> {tc("back")}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.orderNumber}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {placedAt}
            {scope.isChain && order.restaurant?.name ? ` · ${order.restaurant.name}` : ""}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
          {statusLabel}
        </span>
      </div>

      {scheduledAt && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-center gap-2">
          <span aria-hidden>📅</span>
          <span>{isDelivery ? "Deliver " : "Ready for pickup "}{scheduledAt}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Customer */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("customer")}</div>
          <div className="text-sm text-gray-700 space-y-1">
            <div className="font-medium text-gray-900">{order.customerName}</div>
            {order.customerEmail && <div>{order.customerEmail}</div>}
            {order.customerPhone && <div>{order.customerPhone}</div>}
            <div className="capitalize text-gray-500">{order.type?.replace(/_/g, " ")}</div>
            {isDelivery && order.deliveryAddress && (
              <div className="pt-1">
                <div className="text-xs font-semibold text-gray-500 uppercase mt-2 mb-0.5">{tk("deliveryAddress")}</div>
                {order.deliveryAddress}{order.deliveryCity ? `, ${order.deliveryCity}` : ""} {order.deliveryZip ?? ""}
              </div>
            )}
            {order.paymentMethod && (
              <div className="pt-1 text-gray-500">{tk("paymentMethod")}: <span className="text-gray-700">{paymentLabel}</span></div>
            )}
          </div>
        </div>

        {/* Items + totals */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{tc("details")}</div>
          <div className="space-y-2">
            {order.items.map((item: any) => (
              <div key={item.id} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-800">{item.quantity}× {item.name}</span>
                  <span className="text-gray-600">{money(item.subtotal)}</span>
                </div>
                {item.isRefundableDeposit && item.depositAmount > 0 && (
                  <div className="text-xs text-violet-700 pl-4">{tOrd("refundableDepositBadge", { amount: money(item.depositAmount) })}</div>
                )}
                {item.modifiers?.map((mod: any) => (
                  <div key={mod.id} className="text-xs text-gray-500 pl-4">+ {mod.name}</div>
                ))}
                {/* Combo/bundle children + their full build (crust/sauce/half-half/
                    toppings/flavour) + notes — was previously omitted entirely, so
                    the owner couldn't see what a combo actually contained. 2026-07-08. */}
                {Array.isArray(item.bundleItems) && item.bundleItems.length > 0 && (
                  <div className="mt-0.5 pl-4 border-l-2 border-gray-100 space-y-0.5">
                    {item.bundleItems.map((child: any, ci: number) => {
                      const { modifierLines, notes } = childBuildLines(child);
                      return (
                        <div key={ci} className="text-xs text-gray-500">
                          • {child.name}
                          {child.variantName ? ` (${child.variantName})` : ""}
                          {child.specialityFee && child.specialityFee > 0 ? ` (+${money(child.specialityFee)})` : ""}
                          {/* Names only — a combo child's modifier prices are
                              baked into the fixed combo price, so annotating them
                              would imply an extra charge (matches the 5 other
                              surfaces). The real upcharge is child.specialityFee. */}
                          {modifierLines.map((m, mi) => (
                            <div key={mi} className="pl-3 text-gray-400">+ {m.name}</div>
                          ))}
                          {notes && <div className="pl-3 text-gray-400 italic">&ldquo;{notes}&rdquo;</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>{tc("subtotal")}</span><span>{money(order.subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-emerald-700"><span>{tk("discount")}</span><span>− {money(discount)}</span></div>}
            {order.deliveryFee > 0 && <div className="flex justify-between text-gray-600"><span>{tk("delivery")}</span><span>{money(order.deliveryFee)}</span></div>}
            {order.taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>{tk("tax")}</span><span>{money(order.taxAmount)}</span></div>}
            {order.tip > 0 && <div className="flex justify-between text-gray-600"><span>{tk("tip")}</span><span>{money(order.tip)}</span></div>}
            {(() => {
              const dep = order.items.reduce((s: number, it: any) => s + (it.isRefundableDeposit && it.depositAmount > 0 ? it.depositAmount * it.quantity : 0), 0);
              return dep > 0 ? <div className="flex justify-between text-violet-700"><span>{tOrd("refundableDepositNotTaxed")}</span><span>{money(dep)}</span></div> : null;
            })()}
            <div className="flex justify-between font-bold text-gray-900 pt-1"><span>{tc("total")}</span><span>{money(order.total)}</span></div>
            {rewardUsed > 0 && (
              <>
                <div className="flex justify-between text-emerald-700"><span>{tRoot("receipt.customer.paidWithReward", { label: rewardLabel })}</span><span>− {money(rewardUsed)}</span></div>
                <div className="flex justify-between font-bold text-gray-900"><span>{order.paymentStatus === "paid" ? tRoot("money.amountCollected") : tRoot("money.toCollect")}</span><span>{money(Math.max(0, order.total - rewardUsed))}</span></div>
              </>
            )}
            {rewardEarned > 0 && (
              <div className="flex justify-between text-emerald-600"><span>{tRoot("receipt.customer.earnedReward", { label: rewardLabel })}</span><span>+ {money(rewardEarned)}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* Which promo(s) discounted this order — so the owner can see what was
          applied (incl. a customer-assigned code). Luigi 2026-06-26. */}
      {(() => {
        let promos: Array<{ name?: string; discount?: number; type?: string; couponCode?: string }> = [];
        const ap: unknown = (order as any).appliedPromos;
        if (Array.isArray(ap)) promos = ap as any;
        else if (typeof ap === "string") { try { promos = JSON.parse(ap); } catch { promos = []; } }
        if (!promos.length) return null;
        return (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="text-xs font-semibold text-emerald-700 uppercase mb-2">🎉 {tConf("promosApplied")}</div>
            <ul className="space-y-1 text-sm">
              {promos.map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-gray-800">
                    {p.name}
                    {p.couponCode ? <code className="ml-2 text-xs font-mono bg-white border border-emerald-200 rounded px-1.5 py-0.5">{p.couponCode}</code> : null}
                  </span>
                  <span className="text-emerald-700 font-medium">{p.type === "free_delivery" ? "—" : `− ${money(p.discount ?? 0)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {order.notes && (
        <div className="mt-4 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <span className="font-medium text-yellow-800">{tc("notes")}: </span>
          <span className="text-yellow-700">{order.notes}</span>
        </div>
      )}
    </div>
  );
}
