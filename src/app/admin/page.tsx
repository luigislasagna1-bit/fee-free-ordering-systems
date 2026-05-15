import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { AdminDashboardClient } from "./AdminDashboardClient";

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
    />
  );
}
