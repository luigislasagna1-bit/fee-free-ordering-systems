import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ShoppingBag, Users, DollarSign, Clock } from "lucide-react";

export default async function AdminDashboard() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    const { redirect } = await import("next/navigation");
    redirect("/superadmin");
  }

  const [restaurant, orderStats, recentOrders] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.order.groupBy({
      by: ["status"],
      where: { restaurantId },
      _count: true,
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: true },
    }),
  ]);

  const totalOrders = orderStats.reduce((s, g) => s + g._count, 0);
  const totalRevenue = orderStats.reduce((s, g) => s + (g._sum.total || 0), 0);
  const pendingOrders = orderStats.find((g) => g.status === "pending")?._count || 0;
  const customerCount = await prisma.customer.count({ where: { restaurantId } });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    accepted: "bg-blue-100 text-blue-700",
    preparing: "bg-orange-100 text-orange-700",
    ready: "bg-green-100 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{restaurant?.name || "Dashboard"}</h1>
          <p className="text-gray-500 text-sm">Overview of your restaurant</p>
        </div>
        {restaurant && (
          <Link
            href={`/order/${restaurant.slug}`}
            target="_blank"
            className="bg-orange-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition text-sm"
          >
            View Ordering Page →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Orders", value: totalOrders, icon: ShoppingBag, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: "Customers", value: customerCount, icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
          { label: "Pending", value: pendingOrders, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-50" },
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
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/admin/orders" className="text-sm text-orange-500 hover:underline">View all</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No orders yet. Share your ordering page to start receiving orders!</p>
            {restaurant && (
              <Link href={`/order/${restaurant.slug}`} target="_blank" className="text-orange-500 mt-2 inline-block text-sm hover:underline">
                /order/{restaurant.slug}
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
                    {order.orderNumber} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                    {order.status}
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
          { href: "/admin/menu", label: "Manage Menu", desc: "Add items, categories, modifiers" },
          { href: "/admin/hours", label: "Opening Hours", desc: "Set your schedule" },
          { href: "/admin/coupons", label: "Create Coupon", desc: "Run promotions" },
          { href: "/admin/delivery", label: "Delivery Zones", desc: "Configure delivery areas" },
          { href: "/admin/profile", label: "Restaurant Profile", desc: "Edit info & settings" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition">
            <div className="font-semibold text-gray-900 text-sm mb-1">{item.label}</div>
            <div className="text-xs text-gray-500">{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
