"use client";
import { useCurrencyFormat } from "@/lib/currency-context";
import Link from "next/link";
import { ShoppingBag, Users, DollarSign, Clock, AlertTriangle, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  total: number;
  itemsCount: number;
}

interface Props {
  restaurantName: string | null;
  restaurantSlug: string | null;
  totalOrders: number;
  totalRevenue: number;
  customerCount: number;
  pendingOrders: number;
  recentOrders: RecentOrder[];
  /** FREE-plan order cap usage. Drives the warning banner above the
   *  stats grid. `level` is "ok" (no banner), "warning" (amber, you're
   *  at 80+ this month), or "cap_reached" (red, blocked from accepting
   *  new orders until they upgrade or it's a new month). */
  orderCapUsage: {
    count: number;
    cap: number;
    exempt: boolean;
    resetAt: string | null;
    level: "ok" | "warning" | "cap_reached";
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  preparing: "bg-emerald-100 text-emerald-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
};

export function AdminDashboardClient({
  restaurantName, restaurantSlug,
  totalOrders, totalRevenue, customerCount, pendingOrders, recentOrders,
  orderCapUsage,
}: Props) {
  const formatCurrency = useCurrencyFormat();
  const t = useTranslations("admin.dashboard");
  const tSidebar = useTranslations("admin.sidebar");
  const tStatuses = useTranslations("admin.orders");

  const resetDateLabel = orderCapUsage.resetAt
    ? new Date(orderCapUsage.resetAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{restaurantName || t("title")}</h1>
        </div>
        {restaurantSlug && (
          <Link
            href={`/order/${restaurantSlug}`}
            target="_blank"
            className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm"
          >
            {tSidebar("viewOrderingPage")} →
          </Link>
        )}
      </div>

      {/* FREE-plan order cap banner — surfaces when usage is approaching
          or has hit the 100/month cap. Hidden entirely when level="ok"
          (under 80%) or when the restaurant has a cap-exempting paid
          add-on. Links straight to the FREE Unlimited Orders add-on
          for one-click upgrade. */}
      {orderCapUsage.level === "cap_reached" && (
        <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-rose-900 mb-1">
              Monthly order cap reached ({orderCapUsage.count}/{orderCapUsage.cap})
            </h2>
            <p className="text-sm text-rose-800">
              Your FREE plan limit resets {resetDateLabel ? `on ${resetDateLabel}` : "next month"}.
              Until then, new orders are paused. Upgrade to <strong>FREE Unlimited Orders</strong>{" "}
              ($14.99/mo) — or subscribe to any other paid add-on — to remove the cap immediately.
            </p>
            <Link
              href="/admin/billing/add-ons?addon=unlimited_orders"
              className="inline-flex items-center gap-1.5 mt-3 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg font-semibold text-xs transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Upgrade now
            </Link>
          </div>
        </div>
      )}
      {orderCapUsage.level === "warning" && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-amber-900 mb-1">
              Approaching your monthly cap ({orderCapUsage.count}/{orderCapUsage.cap})
            </h2>
            <p className="text-sm text-amber-800">
              You&apos;re close to the FREE plan&apos;s 100 orders/month limit. New orders will
              be paused once you hit {orderCapUsage.cap}. Subscribe to <strong>FREE Unlimited Orders</strong>{" "}
              ($14.99/mo) — or any other paid add-on — to keep accepting orders without interruption.
            </p>
            <Link
              href="/admin/billing/add-ons?addon=unlimited_orders"
              className="inline-flex items-center gap-1.5 mt-3 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg font-semibold text-xs transition"
            >
              <Zap className="w-3.5 h-3.5" />
              Upgrade to Unlimited
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: t("totalOrders"), value: totalOrders, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50" },
          { label: t("revenue"), value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: t("customers"), value: customerCount, icon: Users, color: "text-amber-500", bg: "bg-amber-50" },
          { label: t("pending"), value: pendingOrders, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{stat.label}</span>
              <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{t("recentOrders")}</h2>
          <Link href="/admin/orders" className="text-sm text-emerald-500 hover:underline">{t("viewAllOrders")}</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{t("noOrdersYet")}</p>
            {restaurantSlug && (
              <Link href={`/order/${restaurantSlug}`} target="_blank" className="text-emerald-500 mt-2 inline-block text-sm hover:underline">
                /order/{restaurantSlug}
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentOrders.map((order) => (
              <div key={order.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <div className="font-medium text-gray-900">{order.customerName}</div>
                  <div className="text-sm text-gray-500">
                    {order.orderNumber} · {order.itemsCount}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                    {tStatuses(order.status as any) || order.status}
                  </span>
                  <span className="font-semibold text-gray-900">{formatCurrency(order.total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
        {[
          { href: "/admin/menu", label: tSidebar("menu") },
          { href: "/admin/hours", label: tSidebar("openingHours") },
          { href: "/admin/coupons", label: tSidebar("promotions") },
          { href: "/admin/delivery", label: tSidebar("deliveryZones") },
          { href: "/admin/profile", label: tSidebar("profile") },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-emerald-300 hover:shadow-sm transition">
            <div className="font-semibold text-gray-900 text-sm mb-1">{item.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
