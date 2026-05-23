"use client";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ShoppingBag, Users, DollarSign, Clock } from "lucide-react";
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
}: Props) {
  const t = useTranslations("admin.dashboard");
  const tSidebar = useTranslations("admin.sidebar");
  const tStatuses = useTranslations("admin.orders");

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: t("totalOrders"), value: totalOrders, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50" },
          { label: t("revenue"), value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: t("customers"), value: customerCount, icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
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
