import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Store, DollarSign, TrendingUp, Zap, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ImpersonateButton } from "./restaurants/ImpersonateButton";

/**
 * Superadmin dashboard.
 *
 * Reworked from the old 4-tier-trial dashboard to reflect the new
 * free-base + paid-add-ons business model. We no longer surface
 * trial / cancelled / subscription-plan stats — every restaurant is
 * on the Free plan by default, and revenue is driven by per-add-on
 * subscriptions via RestaurantAddOn.
 */
export const dynamic = "force-dynamic";

const STALE_THRESHOLD_DAYS = 30;

export default async function SuperadminDashboard() {
  const [
    restaurants,
    totalOrders,
    totalRevenue,
    addOns,
    activeAddOnRows,
  ] = await Promise.all([
    prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        _count: { select: { orders: true } },
        addOns: {
          where: { status: { in: ["active", "trialing"] } },
          select: { id: true, status: true, addOn: { select: { name: true, monthlyPriceCents: true } } },
        },
      },
    }),
    prisma.order.count({ where: { status: "completed" } }),
    prisma.order.aggregate({ where: { status: "completed" }, _sum: { total: true } }),
    // Per-add-on rollup for the catalog performance table.
    prisma.addOn.findMany({
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        monthlyPriceCents: true,
        isActive: true,
        _count: {
          select: {
            // Active + trialing both count as adopted; we show one number
            // and break out the MRR portion separately below.
            restaurantAddOns: { where: { status: { in: ["active", "trialing"] } } },
          },
        },
      },
    }),
    // All currently-billing add-on subscriptions across the platform.
    // Used to compute MRR (active-only — trialing doesn't bill yet).
    prisma.restaurantAddOn.findMany({
      where: { status: "active" },
      select: { addOn: { select: { monthlyPriceCents: true } } },
    }),
  ]);

  const mrrCents = activeAddOnRows.reduce(
    (sum, row) => sum + (row.addOn.monthlyPriceCents ?? 0),
    0,
  );

  const activeRestaurants = restaurants.filter((r) => r.isActive).length;
  const publishedRestaurants = restaurants.filter((r) => !!r.publishedAt).length;
  const paidRestaurants = restaurants.filter((r) => r.addOns.length > 0).length;

  // Stale-activity: restaurants with no order in the last 30 days.
  // Done with a single grouped query to avoid N+1 across the recent list.
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const recentlyOrderingIds = await prisma.order.findMany({
    where: { createdAt: { gte: staleThreshold } },
    distinct: ["restaurantId"],
    select: { restaurantId: true },
  });
  const recentlyOrderingSet = new Set(recentlyOrderingIds.map((o) => o.restaurantId));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="text-gray-500 text-sm">Fee Free Ordering Systems — Admin</p>
      </div>

      {/* Stats — top-line business numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Restaurants", value: restaurants.length, icon: Store, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Monthly MRR", value: formatCurrency(mrrCents / 100), icon: DollarSign, color: "text-green-500", bg: "bg-green-50", hint: "from active add-ons" },
          { label: "Orders Processed", value: totalOrders, icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-50" },
          { label: "Paid Restaurants", value: paidRestaurants, icon: Zap, color: "text-amber-500", bg: "bg-amber-50", hint: ">= 1 add-on" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{s.label}</span>
              <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            {s.hint && <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">{s.hint}</div>}
          </div>
        ))}
      </div>

      {/* Add-on catalog performance + platform breakdown */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Add-On Catalog Performance</h2>
            <Link href="/superadmin/add-ons" className="text-xs text-emerald-500 hover:underline">Manage →</Link>
          </div>
          {addOns.length === 0 ? (
            <p className="text-sm text-gray-500">No add-ons in catalog yet.</p>
          ) : (
            <div className="space-y-3">
              {addOns.map((a) => {
                const adopters = a._count.restaurantAddOns;
                const mrrFromThisAddOn = adopters * (a.monthlyPriceCents ?? 0);
                return (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className={`font-medium ${a.isActive ? "text-gray-800" : "text-gray-400 line-through"}`}>
                        {a.name}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {formatCurrency((a.monthlyPriceCents ?? 0) / 100)}/mo
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{adopters} restaurant{adopters === 1 ? "" : "s"}</div>
                      <div className="text-xs text-green-600">{formatCurrency(mrrFromThisAddOn / 100)}/mo MRR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Platform Stats</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Active restaurants</span><span className="font-semibold">{activeRestaurants}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Published restaurants</span><span className="font-semibold text-emerald-600">{publishedRestaurants}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Paid restaurants</span><span className="font-semibold text-amber-600">{paidRestaurants}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total orders processed</span><span className="font-semibold">{totalOrders}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Total order volume</span><span className="font-semibold text-green-600">{formatCurrency(totalRevenue._sum.total || 0)}</span></div>
          </div>
        </div>
      </div>

      {/* Recent restaurants */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Restaurants</h2>
          <Link href="/superadmin/restaurants" className="text-sm text-emerald-500 hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Restaurant", "Live", "Tier", "Orders", "Activity", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {restaurants.map((r) => {
                const addOnCount = r.addOns.length;
                const isPaid = addOnCount > 0;
                const isStale = r._count.orders > 0 && !recentlyOrderingSet.has(r.id);
                const neverOrdered = r._count.orders === 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/superadmin/restaurants/${r.id}`} className="font-medium text-blue-600 hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-gray-400">/order/{r.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.publishedAt ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">LIVE</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">SETUP</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <span
                          className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700"
                          title={r.addOns.map((a) => a.addOn.name).join(", ")}
                        >
                          PAID · {addOnCount}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">FREE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r._count.orders}</td>
                    <td className="px-4 py-3 text-xs">
                      {neverOrdered ? (
                        <span className="text-gray-400">No orders yet</span>
                      ) : isStale ? (
                        <span className="text-amber-700 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> No orders in {STALE_THRESHOLD_DAYS}d
                        </span>
                      ) : (
                        <span className="text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3"><ImpersonateButton restaurantId={r.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
