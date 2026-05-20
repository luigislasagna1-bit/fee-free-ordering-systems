import prisma from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";
import { CreateTestRestaurantButton } from "./CreateTestRestaurantButton";

type Tone = "default" | "emerald" | "yellow" | "red" | "gray" | "purple" | "blue";

function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone: Tone; hint?: string }) {
  const tones: Record<Tone, string> = {
    default: "bg-gray-50 text-gray-900",
    emerald: "bg-emerald-50 text-emerald-700",
    yellow:  "bg-yellow-50 text-yellow-700",
    red:     "bg-red-50 text-red-700",
    gray:    "bg-gray-100 text-gray-600",
    purple:  "bg-purple-50 text-purple-700",
    blue:    "bg-blue-50 text-blue-700",
  };
  return (
    <div className={`rounded-xl px-3 py-3 ${tones[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      {hint && <div className="text-[10px] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}

// Auth-gated, live data. Never cache.
export const dynamic = "force-dynamic";

export default async function SuperadminRestaurants() {
  // Pull restaurants + the data we need to compute paid-vs-free + activity.
  // We deliberately do NOT include subscriptionPlan/subscriptionStatus —
  // those are remnants of the old 4-tier trial model. The business model
  // is now free-base + paid add-ons, so paid/free is derived from
  // RestaurantAddOn rows.
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { orders: true, customers: true, menuItems: true } },
      // Pull active add-ons inline so we can derive tier + count.
      // "active" + "trialing" both count as "paid tier" — trialing means
      // the owner has committed to billing once their trial ends.
      addOns: {
        where: { status: { in: ["active", "trialing"] } },
        select: {
          id: true,
          status: true,
          addOn: { select: { name: true, monthlyPriceCents: true } },
        },
      },
    },
  });

  // Last order date per restaurant — single grouped query to avoid N+1.
  const lastOrders = await prisma.order.groupBy({
    by: ["restaurantId"],
    _max: { createdAt: true },
  });
  const lastOrderMap = new Map(lastOrders.map((g) => [g.restaurantId, g._max.createdAt]));

  // Platform-wide MRR — sum of monthlyPriceCents for all "active" add-on
  // subscriptions across all restaurants. Trialing is excluded since
  // those aren't billing yet.
  const mrrCents = restaurants.reduce((sum, r) => {
    return sum + r.addOns.reduce((s, ra) => {
      return ra.status === "active" ? s + (ra.addOn.monthlyPriceCents ?? 0) : s;
    }, 0);
  }, 0);

  const stats = {
    total:     restaurants.length,
    published: restaurants.filter((r) => !!r.publishedAt).length,
    paid:      restaurants.filter((r) => r.addOns.length > 0).length,
    free:      restaurants.filter((r) => r.addOns.length === 0).length,
    paused:    restaurants.filter((r) => !r.isActive).length,
    test:      restaurants.filter((r) => r.slug.startsWith("demo-")).length,
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

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <Stat label="Total"          value={stats.total}                       tone="default" />
        <Stat label="Published"      value={stats.published}                   tone="emerald" />
        <Stat label="Paid"           value={stats.paid}     hint=">= 1 add-on" tone="purple"  />
        <Stat label="Free"           value={stats.free}     hint="no add-ons"  tone="gray"    />
        <Stat label="MRR"            value={formatCurrency(mrrCents / 100)} hint="active add-ons" tone="blue" />
        <Stat label="Paused"         value={stats.paused}                      tone="yellow"  />
        <Stat label="Test (demo-*)"  value={stats.test}                        tone="purple"  />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Restaurant", "Live", "Tier", "Orders", "Customers", "Last order", "Ordering Page", "Joined", ""].map((h) => (
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
                  </td>
                </tr>
              ) : (
                restaurants.map((r) => {
                  const addOnCount = r.addOns.length;
                  const isPaid = addOnCount > 0;
                  const lastOrder = lastOrderMap.get(r.id) ?? null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/superadmin/restaurants/${r.id}`} className="font-semibold text-blue-600 hover:underline flex items-center flex-wrap">
                          {r.name}
                          {r.slug.startsWith("demo-") && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">TEST</span>
                          )}
                          {!r.isActive && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">PAUSED</span>
                          )}
                        </Link>
                        <div className="text-xs text-gray-400">{r.email || r.phone || ""}</div>
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
                            PAID · {addOnCount} add-on{addOnCount === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            FREE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r._count.orders}</td>
                      <td className="px-4 py-3 text-gray-600">{r._count.customers}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {lastOrder ? formatDate(lastOrder) : <span className="text-gray-300">—</span>}
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
