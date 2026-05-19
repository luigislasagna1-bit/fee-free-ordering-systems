import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, TrendingUp, ShoppingBag, DollarSign } from "lucide-react";
import { isBrandParent } from "@/lib/brand";
import { loadBrandReports } from "@/lib/brand-reports";
import { BrandReports } from "./BrandReports";

export default async function ReportsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  // Brand parents see a chain-wide aggregated report (all locations).
  // Single locations / individual child locations see their own data.
  if (restaurantId && (await isBrandParent(restaurantId))) {
    const payload = await loadBrandReports(restaurantId, 30);
    if (payload) {
      return <BrandReports payload={payload} />;
    }
  }

  const [orders, topItems] = await Promise.all([
    prisma.order.findMany({
      where: { restaurantId, status: { not: "rejected" } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: { restaurantId, status: { not: "rejected" } } },
      _count: true,
      _sum: { subtotal: true },
      orderBy: { _count: { name: "desc" } },
      take: 10,
    }),
  ]);

  const completed = orders.filter((o) => o.status === "completed");
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const avgOrder = completed.length > 0 ? totalRevenue / completed.length : 0;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const dailyOrders = last7.map((d) => {
    const dayOrders = completed.filter((o) => {
      const od = new Date(o.createdAt);
      return od.toDateString() === d.toDateString();
    });
    return {
      date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      count: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + o.total, 0),
    };
  });

  const pickupCount = orders.filter((o) => o.type === "pickup").length;
  const deliveryCount = orders.filter((o) => o.type === "delivery").length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports & Analytics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: "Completed Orders", value: completed.length, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Average Order", value: formatCurrency(avgOrder), icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-50" },
          { label: "Total Orders", value: orders.length, icon: BarChart3, color: "text-orange-500", bg: "bg-orange-50" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{s.label}</span>
              <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Orders — Last 7 Days</h2>
          <div className="space-y-3">
            {dailyOrders.map((d) => {
              const maxRevenue = Math.max(...dailyOrders.map((x) => x.revenue), 1);
              return (
                <div key={d.date}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{d.date}</span>
                    <span className="font-medium text-gray-900">{d.count} orders · {formatCurrency(d.revenue)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(d.revenue / maxRevenue) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top Selling Items</h2>
          {topItems.length === 0 ? (
            <p className="text-gray-400 text-sm">No order data yet.</p>
          ) : (
            <div className="space-y-3">
              {topItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="font-medium text-gray-800 text-sm truncate flex-1">{item.name}</div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className="text-xs text-gray-500">{item._count} sold</span>
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(item._sum.subtotal || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order Types</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-3xl font-bold text-blue-600">{pickupCount}</div>
            <div className="text-sm text-gray-600 mt-1">Pickup orders</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-xl">
            <div className="text-3xl font-bold text-orange-600">{deliveryCount}</div>
            <div className="text-sm text-gray-600 mt-1">Delivery orders</div>
          </div>
        </div>
      </div>
    </div>
  );
}
