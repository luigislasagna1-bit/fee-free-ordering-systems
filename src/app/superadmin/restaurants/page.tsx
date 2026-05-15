import prisma from "@/lib/db";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";
import { CreateTestRestaurantButton } from "./CreateTestRestaurantButton";

type Tone = "default" | "emerald" | "yellow" | "red" | "gray" | "purple";

function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const tones: Record<Tone, string> = {
    default: "bg-gray-50 text-gray-900",
    emerald: "bg-emerald-50 text-emerald-700",
    yellow:  "bg-yellow-50 text-yellow-700",
    red:     "bg-red-50 text-red-700",
    gray:    "bg-gray-100 text-gray-600",
    purple:  "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-xl px-3 py-3 ${tones[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

export default async function SuperadminRestaurants() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptionPlan: true,
      _count: { select: { orders: true, customers: true, menuItems: true } },
    },
  });

  const stats = {
    total:     restaurants.length,
    active:    restaurants.filter((r) => r.subscriptionStatus === "active").length,
    trial:     restaurants.filter((r) => r.subscriptionStatus === "trial").length,
    cancelled: restaurants.filter((r) => r.subscriptionStatus === "cancelled").length,
    inactive:  restaurants.filter((r) => !r.isActive).length,
    test:      restaurants.filter((r) => r.slug.startsWith("demo-")).length,
  };

  const statusColor: Record<string, string> = {
    trial: "bg-yellow-100 text-yellow-700",
    active: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    past_due: "bg-orange-100 text-orange-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">All Restaurants</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">{restaurants.length} total</span>
          <CreateTestRestaurantButton />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
        <Stat label="Total"           value={stats.total}     tone="default" />
        <Stat label="Active"          value={stats.active}    tone="emerald" />
        <Stat label="Trial"           value={stats.trial}     tone="yellow"  />
        <Stat label="Cancelled"       value={stats.cancelled} tone="red"     />
        <Stat label="Inactive"        value={stats.inactive}  tone="gray"    />
        <Stat label="Test (demo-*)"   value={stats.test}      tone="purple"  />
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
              {restaurants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center px-4 py-12 text-gray-500">
                    <div className="font-semibold text-gray-700 mb-1">No restaurants in the database</div>
                    <p className="text-sm">New restaurants appear here automatically when an owner registers at{" "}
                      <a href="/signup" className="text-orange-500 hover:underline">/signup</a>
                      , or click <strong>Create test restaurant</strong> above to seed one for testing.
                    </p>
                    <p className="text-sm mt-2 text-gray-400">
                      If you expected restaurants to be here, your dev server may be pointed at the wrong database. Verify with:{" "}
                      <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">DATABASE_URL="file:./dev.db" npx tsx scripts/check-restaurants.ts</code>
                    </p>
                  </td>
                </tr>
              ) : (
                restaurants.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 flex items-center flex-wrap">
                        {r.name}
                        {r.slug.startsWith("demo-") && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">TEST</span>
                        )}
                        {!r.isActive && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">INACTIVE</span>
                        )}
                      </div>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
