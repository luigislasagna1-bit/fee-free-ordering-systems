import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { AdminDashboardClient } from "./AdminDashboardClient";
import { isBrandParent, loadBrandSummary } from "@/lib/brand";
import { BrandDashboardClient } from "./BrandDashboardClient";
import { loadSetupProgress } from "@/lib/setup-checklist-loader";
import { getOrderCapUsage } from "@/lib/order-cap";

export default async function AdminDashboard() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    const { redirect } = await import("next/navigation");
    redirect("/superadmin");
  }

  // Setup-incomplete nudge. If there's at least one REQUIRED step still
  // open, the owner needs to see the wizard so they understand exactly
  // what's missing. This fires regardless of publish state because:
  //   - A pre-existing restaurant that was published before the wizard
  //     was built (e.g. Luigi's) may still have required steps that
  //     weren't tracked at publish time — they should still see them
  //   - A restaurant that publishes then has a step regress (e.g.
  //     kitchen device went offline) needs visibility into that too
  //
  // The redirect is dashboard-only — once they're past it they can
  // navigate freely. The header's "Setup X% complete" banner provides
  // a persistent re-entry point so they're never stuck.
  //
  // If they want to escape the wizard, the wizard page itself links to
  // every other admin route, so they always have a way out.
  const progress = await loadSetupProgress(restaurantId!).catch(() => null);
  if (progress && progress.requiredStepsRemaining.length > 0) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/setup");
  }

  // Multi-location detection. If the active restaurantId IS a brand parent
  // (has ≥1 child), show the brand-wide dashboard instead of the single-
  // location dashboard. Children fall through to the normal admin.
  // Note: getSessionUser already applies the active_location cookie, so if
  // the owner has drilled into a child via the LocationSwitcher, this
  // returns false and we render the normal per-location dashboard.
  const showBrand = await isBrandParent(restaurantId!);
  if (showBrand) {
    const summary = await loadBrandSummary(restaurantId!);
    return <BrandDashboardClient summary={summary!} />;
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
  const orderCapUsage = await getOrderCapUsage(restaurantId!);

  return (
    <AdminDashboardClient
      restaurantName={restaurant?.name ?? null}
      restaurantSlug={restaurant?.slug ?? null}
      totalOrders={totalOrders}
      totalRevenue={totalRevenue}
      customerCount={customerCount}
      pendingOrders={pendingOrders}
      recentOrders={recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        status: o.status,
        total: o.total,
        itemsCount: o.items.length,
      }))}
      orderCapUsage={{
        count: orderCapUsage.count,
        cap: orderCapUsage.cap,
        exempt: orderCapUsage.exempt,
        resetAt: orderCapUsage.resetAt ? orderCapUsage.resetAt.toISOString() : null,
        level: orderCapUsage.level,
      }}
    />
  );
}
