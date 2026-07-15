import prisma from "@/lib/db";
import { formatCurrency , PLATFORM_CURRENCY } from "@/lib/utils";
import { CreateTestRestaurantButton } from "./CreateTestRestaurantButton";
import { RestaurantsTable, type RestaurantRow } from "./RestaurantsTable";

type Tone = "default" | "emerald" | "yellow" | "red" | "gray" | "purple" | "blue";

function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone: Tone; hint?: string }) {
  const tones: Record<Tone, string> = {
    default: "bg-gray-50 text-gray-900",
    emerald: "bg-emerald-50 text-emerald-700",
    yellow:  "bg-yellow-50 text-yellow-700",
    red:     "bg-red-50 text-red-700",
    gray:    "bg-gray-100 text-gray-600",
    purple:  "bg-amber-50 text-amber-700",
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

export const dynamic = "force-dynamic";

export default async function SuperadminRestaurants() {
  const restaurants = await prisma.restaurant.findMany({
    // Exclude UNCLAIMED import-to-try sandboxes — they're anonymous trial menus,
    // not real restaurants, until someone signs up to claim one (claiming deletes
    // the SandboxRestaurant row, so the restaurant reappears here). Luigi 2026-06-21.
    where: { sandbox: { is: null } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { orders: true, customers: true, menuItems: true } },
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

  // "Real" = production restaurants. demo-* (seeded test stores) and try-*
  // (Import-to-Try sandboxes from the GloriaFood menu test-build) are NOT real
  // signups, so they're EXCLUDED from the headline counts and broken out into
  // their own tiles below. Luigi 2026-06-30.
  const real = restaurants.filter((r) => !r.slug.startsWith("demo-") && !r.slug.startsWith("try-"));

  // Platform-wide MRR — active add-on subscriptions on real restaurants only.
  const mrrCents = real.reduce((sum, r) => {
    return sum + r.addOns.reduce((s, ra) => {
      return ra.status === "active" ? s + (ra.addOn.monthlyPriceCents ?? 0) : s;
    }, 0);
  }, 0);

  const stats = {
    real:      real.length,
    published: real.filter((r) => !!r.publishedAt).length,
    paid:      real.filter((r) => r.addOns.length > 0).length,
    free:      real.filter((r) => r.addOns.length === 0).length,
    paused:    real.filter((r) => !r.isActive).length,
    test:      restaurants.filter((r) => r.slug.startsWith("demo-")).length,
    trial:     restaurants.filter((r) => r.slug.startsWith("try-")).length,
  };

  // Shape the data for the client. Dates must be ISO strings so they
  // serialize cleanly through the server/client boundary.
  const rows: RestaurantRow[] = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    email: r.email,
    phone: r.phone,
    isActive: r.isActive,
    isTest: r.slug.startsWith("demo-"),
    isTrial: r.slug.startsWith("try-"),
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    lastOrderAt: lastOrderMap.get(r.id)?.toISOString() ?? null,
    orders: r._count.orders,
    customers: r._count.customers,
    menuItems: r._count.menuItems,
    paidAddOnCount: r.addOns.length,
    paidAddOnNames: r.addOns.map((a) => a.addOn.name),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">All Restaurants</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">{stats.real} real · {restaurants.length} total</span>
          <CreateTestRestaurantButton />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        <Stat label="Real"           value={stats.real}     hint="excl. test/trial" tone="default" />
        <Stat label="Published"      value={stats.published}                   tone="emerald" />
        <Stat label="Paid"           value={stats.paid}     hint=">= 1 add-on" tone="purple"  />
        <Stat label="Free"           value={stats.free}     hint="no add-ons"  tone="gray"    />
        <Stat label="MRR"            value={formatCurrency(mrrCents / 100, PLATFORM_CURRENCY)} hint="active add-ons" tone="blue" />
        <Stat label="Paused"         value={stats.paused}                      tone="yellow"  />
        <Stat label="Test (demo-*)"  value={stats.test}                        tone="purple"  />
        <Stat label="Trials (try-*)" value={stats.trial}    hint="import-to-try" tone="purple" />
      </div>

      <RestaurantsTable rows={rows} />
    </div>
  );
}
