import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Store, DollarSign, Users, TrendingUp, AlertCircle } from "lucide-react";
import Link from "next/link";
import { ImpersonateButton } from "./restaurants/ImpersonateButton";

export default async function SuperadminDashboard() {
  const [restaurants, totalOrders, totalRevenue, plans] = await Promise.all([
    prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { subscriptionPlan: true, _count: { select: { orders: true } } },
    }),
    prisma.order.count({ where: { status: "completed" } }),
    prisma.order.aggregate({ where: { status: "completed" }, _sum: { total: true } }),
    prisma.subscriptionPlan.findMany({ include: { _count: { select: { restaurants: true } } } }),
  ]);

  const activeRestaurants = restaurants.filter((r) => r.isActive).length;
  const trialRestaurants = restaurants.filter((r) => r.subscriptionStatus === "trial").length;
  const platformRevenue = plans.reduce((sum, p) => {
    return sum + p.price * p._count.restaurants;
  }, 0);

  const statusColor: Record<string, string> = {
    trial: "bg-yellow-100 text-yellow-700",
    active: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    past_due: "bg-orange-100 text-orange-700",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="text-gray-500 text-sm">Fee Free Ordering Systems — Admin</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Restaurants", value: restaurants.length, icon: Store, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Monthly MRR (est.)", value: formatCurrency(platformRevenue), icon: DollarSign, color: "text-green-500", bg: "bg-green-50" },
          { label: "Orders Processed", value: totalOrders, icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-50" },
          { label: "On Free Trial", value: trialRestaurants, icon: AlertCircle, color: "text-yellow-500", bg: "bg-yellow-50" },
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

      {/* Plans breakdown */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Subscription Plans</h2>
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-800">{p.name}</span>
                  <span className="text-sm text-gray-500 ml-2">${p.price}/mo</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-900">{p._count.restaurants} restaurants</span>
                  <div className="text-xs text-green-600">{formatCurrency(p.price * p._count.restaurants)}/mo MRR</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Platform Stats</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Active restaurants</span><span className="font-semibold">{activeRestaurants}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Trial restaurants</span><span className="font-semibold text-yellow-600">{trialRestaurants}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total orders processed</span><span className="font-semibold">{totalOrders}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total order volume</span><span className="font-semibold text-green-600">{formatCurrency(totalRevenue._sum.total || 0)}</span></div>
          </div>
        </div>
      </div>

      {/* Recent restaurants */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Restaurants</h2>
          <Link href="/superadmin/restaurants" className="text-sm text-orange-500 hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Restaurant", "Plan", "Status", "Orders", "Trial Ends", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {restaurants.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400">/order/{r.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.subscriptionPlan?.name || "None"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor[r.subscriptionStatus] || "bg-gray-100 text-gray-600"}`}>
                      {r.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r._count.orders}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.trialEndsAt ? formatDate(r.trialEndsAt) : "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3"><ImpersonateButton restaurantId={r.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
