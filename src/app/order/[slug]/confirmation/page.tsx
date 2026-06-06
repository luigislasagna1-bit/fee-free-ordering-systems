import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { CheckCircle, Clock, MapPin, ArrowRight } from "lucide-react";
import { OrderPlacedTracker } from "@/components/order/OrderPlacedTracker";
import { getTranslations } from "next-intl/server";
import { verifyAndReleaseOrderPayment } from "@/lib/stripe/verify-order-payment";

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orderId?: string; payment_intent?: string }>;
}) {
  const t = await getTranslations("customer.confirmation");
  const { slug } = await params;
  const { orderId, payment_intent } = await searchParams;
  if (!orderId) notFound();

  // KEY-ONLY model: the restaurant's own Stripe account does not webhook
  // the platform, so this is where we verify the authorization server-side
  // (via the restaurant's own key) and RELEASE the card order to the
  // kitchen. Fully idempotent — safe on every render. Best-effort: never
  // block rendering the confirmation if verification hiccups.
  try {
    await verifyAndReleaseOrderPayment({ orderId, paymentIntentId: payment_intent });
  } catch (e) {
    console.error("[confirmation] payment verification failed:", e);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: true,
      items: { include: { modifiers: true } },
    },
  });

  if (!order || order.restaurant.slug !== slug) notFound();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Funnel-terminal beacon. Fires "order_placed" so /admin/reports/
          online-ordering/funnel can compute a real session→order
          conversion rate. The order page already fires "visit"; this
          closes the loop. */}
      <OrderPlacedTracker restaurantId={order.restaurantId} orderId={order.id} />
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t("orderPlaced")}</h1>
        <p className="text-gray-500 mb-6">
          {t("orderReceivedWaiting", { restaurantName: order.restaurant.name })}
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="text-sm text-gray-600 mb-1">{t("orderNumber")}</div>
          <div className="text-2xl font-bold text-emerald-500">{order.orderNumber}</div>
        </div>

        <div className="text-left space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-5 h-5 text-gray-400" />
            <span className="text-gray-600">
              {order.scheduledFor && new Date(order.scheduledFor).getTime() > Date.now()
                ? t("scheduledFor", {
                    time: new Date(order.scheduledFor).toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      // Honour the restaurant's 12h/24h choice, not the browser default.
                      hour12: (order.restaurant as any).hoursFormat !== "24h",
                      ...(order.restaurant.timezone ? { timeZone: order.restaurant.timezone } : {}),
                    }),
                  })
                : t("estimatedTime", { type: order.type, minutes: order.type === "pickup" ? order.restaurant.estimatedPickup : order.restaurant.estimatedDelivery })}
            </span>
          </div>
          {order.type === "delivery" && order.deliveryAddress && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-5 h-5 text-gray-400" />
              <span className="text-gray-600">{order.deliveryAddress}, {order.deliveryCity}</span>
            </div>
          )}
        </div>

        {/* Order items */}
        <div className="border border-gray-100 rounded-xl p-4 mb-6 text-left">
          <div className="text-sm font-semibold text-gray-700 mb-3">{t("orderSummary")}</div>
          <div className="space-y-2">
            {order.items.map((item) => {
              const bundle = Array.isArray((item as any).bundleItems)
                ? ((item as any).bundleItems as Array<{
                    name: string;
                    variantName?: string | null;
                    specialityFee?: number;
                    modifiers?: Array<{ name: string; priceAdjustment?: number }>;
                  }>)
                : null;
              return (
                <div key={item.id} className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">{item.quantity}× {item.name}</span>
                    <span className="text-gray-600">{formatCurrency(item.subtotal)}</span>
                  </div>
                  {bundle && bundle.length > 0 && (
                    <div className="mt-1 pl-3 border-l-2 border-gray-100 space-y-0.5 text-xs text-gray-500">
                      {bundle.map((child, i) => (
                        <div key={i}>
                          <div>
                            • {child.name}
                            {child.variantName ? ` (${child.variantName})` : ""}
                            {child.specialityFee && child.specialityFee > 0
                              ? ` (+${formatCurrency(child.specialityFee)})`
                              : ""}
                          </div>
                          {Array.isArray(child.modifiers) && child.modifiers.length > 0 && (
                            <div className="pl-3 text-gray-400">
                              {child.modifiers.map((m, mi) => (
                                <div key={mi}>+ {m.name}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Promo highlight box — appears ABOVE totals so customers
              see EXACTLY which promo(s) they got + the savings. Skipped
              when nothing fired (back-compat for pre-2026-05-29 orders). */}
          {(() => {
            if (!(order as any).appliedPromos) return null;
            try {
              const promos = JSON.parse((order as any).appliedPromos) as Array<{
                name: string; type: string; discount: number; couponCode?: string;
              }>;
              if (!Array.isArray(promos) || promos.length === 0) return null;
              return (
                <div className="border-t border-gray-100 mt-3 pt-3">
                  <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span aria-hidden>🎉</span>
                      <div className="text-sm font-bold text-emerald-800">
                        {t("promosApplied")}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {promos.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-700 font-medium truncate">
                            <span aria-hidden>✓</span>
                            <span className="truncate">{p.name}</span>
                            {p.couponCode && (
                              <span className="font-mono bg-white border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5 ml-1">
                                {p.couponCode}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                            {p.discount > 0 ? `− ${formatCurrency(p.discount)}` : t("free")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
          {(() => {
            // Derive savings info from the appliedPromos snapshot so the
            // line items show "Delivery: ~~$7.99~~ FREE" / a struck-through
            // discount line. Free-delivery entries carry the saved fee
            // as their `discount` (stored at order-create time).
            const promosRaw = (order as any).appliedPromos;
            let promos: Array<{ name: string; type: string; discount: number; couponCode?: string }> = [];
            if (promosRaw) {
              try { const p = JSON.parse(promosRaw); if (Array.isArray(p)) promos = p; } catch { /* ignore */ }
            }
            const freeDelivery = promos.find((p) => p.type === "free_delivery");
            const savedDeliveryFee = freeDelivery ? freeDelivery.discount : 0;
            const cartDiscountTotal = promos
              .filter((p) => p.type !== "free_delivery")
              .reduce((s, p) => s + (p.discount || 0), 0)
              + ((order as any).couponDiscount ?? 0);
            const isDelivery = (order as any).type === "delivery";
            return (
              <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>{t("subtotal")}</span><span>{formatCurrency(order.subtotal)}</span></div>
                {cartDiscountTotal > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>{t("promoDiscount")}</span>
                    <span>− {formatCurrency(cartDiscountTotal)}</span>
                  </div>
                )}
                {isDelivery && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t("delivery")}</span>
                    <span>
                      {savedDeliveryFee > 0 ? (
                        <>
                          <span className="line-through text-gray-400 mr-1.5">
                            {formatCurrency(savedDeliveryFee)}
                          </span>
                          <span className="text-emerald-600 font-semibold">{t("free")}</span>
                        </>
                      ) : (
                        formatCurrency(order.deliveryFee)
                      )}
                    </span>
                  </div>
                )}
                {order.taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>{t("tax")}</span><span>{formatCurrency(order.taxAmount)}</span></div>}
                <div className="flex justify-between font-bold text-gray-900"><span>{t("total")}</span><span>{formatCurrency(order.total)}</span></div>
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href={`/order/${slug}/status/${order.id}`}
            className="flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition"
          >
            {t("trackOrderStatus")} <ArrowRight className="w-4 h-4" />
          </Link>
          {/* Send marketplace customers back to the grid (where they were
              browsing). Direct-customers get the restaurant-menu link as
              before. Same logic as the status page. */}
          {order.viaMarketplace ? (
            <Link href="/" className="text-gray-500 text-sm hover:text-gray-700 transition">
              {t("browseOtherRestaurants")}
            </Link>
          ) : (
            <Link href={`/order/${slug}`} className="text-gray-500 text-sm hover:text-gray-700 transition">
              {t("placeAnotherOrder")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
