import prisma from "@/lib/db";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";

export default async function SuperadminRestaurants() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptionPlan: true,
      _count: { select: { orders: true, customers: true, menuItems: true } },
    },
  });

  const statusColor: Record<string, string> = {
    trial: "bg-yellow-100 text-yellow-700",
    active: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    past_due: "bg-orange-100 text-orange-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Restaurants</h1>
        <span className="text-gray-500 text-sm">{restaurants.length} total</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Restaurant", "Plan", "Status", "Orders", "Customers", "Menu Items", "Ordering Page", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {restaurants.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400">{r.email || r.phone || ""}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.subscriptionPlan?.name || <span className="text-gray-400">None</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor[r.subscriptionStatus] || "bg-gray-100 text-gray-600"}`}>
                      {r.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r._count.orders}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.customers}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.menuItems}</td>
                  <td className="px-4 py-3">
                    <Link href={`/order/${r.slug}`} target="_blank" className="text-orange-500 hover:underline text-xs">
                      /order/{r.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <ImpersonateButton restaurantId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
