import "server-only";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { formatCurrency } from "@/lib/utils";

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
      restaurant: { select: { name: true, currency: true, timezone: true } },
    },
  });
  if (!order) notFound();

  const t = await getTranslations("admin.orders");
  const tc = await getTranslations("common");
  const tk = await getTranslations("checkout");
  const currency = (order.restaurant?.currency ?? "USD").toUpperCase();
  const tz = order.restaurant?.timezone ?? undefined;
  const money = (n: number) => formatCurrency(n, currency);
  const statusLabel = (() => { try { return t(order.status as any); } catch { return order.status; } })();
  const placedAt = order.createdAt.toLocaleString([], {
    timeZone: tz, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const scheduledAt = order.scheduledFor
    ? new Date(order.scheduledFor).toLocaleString([], { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
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
              <div className="pt-1 text-gray-500">{tk("paymentMethod")}: <span className="capitalize text-gray-700">{order.paymentMethod.replace(/_/g, " ")}</span></div>
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
                {item.modifiers?.map((mod: any) => (
                  <div key={mod.id} className="text-xs text-gray-500 pl-4">+ {mod.name}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>{tc("subtotal")}</span><span>{money(order.subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-emerald-700"><span>{tk("discount")}</span><span>− {money(discount)}</span></div>}
            {order.deliveryFee > 0 && <div className="flex justify-between text-gray-600"><span>{tk("delivery")}</span><span>{money(order.deliveryFee)}</span></div>}
            {order.taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>{tk("tax")}</span><span>{money(order.taxAmount)}</span></div>}
            {order.tip > 0 && <div className="flex justify-between text-gray-600"><span>{tk("tip")}</span><span>{money(order.tip)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900 pt-1"><span>{tc("total")}</span><span>{money(order.total)}</span></div>
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="mt-4 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <span className="font-medium text-yellow-800">{tc("notes")}: </span>
          <span className="text-yellow-700">{order.notes}</span>
        </div>
      )}
    </div>
  );
}
