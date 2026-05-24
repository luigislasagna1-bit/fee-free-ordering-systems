import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { KitchenDisplay } from "./KitchenDisplay";

export default async function KitchenPage() {
  const session = await getServerSession(kitchenAuthOptions);
  if (!session) redirect("/kitchen/login");
  const role = (session.user as any)?.role;
  if (!["restaurant_admin", "kitchen_staff", "superadmin"].includes(role)) redirect("/kitchen/login");

  const restaurantId = (session.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) redirect("/kitchen/login");

  let restaurant = null;
  let orders: any[] = [];

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // We need the full restaurant row so the kitchen can know the
    // workflow mode (simple vs tracking) on first paint — without this
    // there's a 4-second flicker between the SSR render and the first
    // poll where the wrong buttons show.
    [restaurant, orders] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: thirtyDaysAgo },
          // Same filter as /api/kitchen/orders polling: never show
          // pre-payment card orders to the kitchen on initial SSR.
          notifiedAt: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          items: {
            include: { modifiers: { select: { name: true, priceAdjustment: true } } },
          },
        },
      }),
    ]);
  } catch (err) {
    console.error("[KitchenPage] DB error:", err);
  }

  return <KitchenDisplay restaurant={restaurant} initialOrders={orders} />;
}
