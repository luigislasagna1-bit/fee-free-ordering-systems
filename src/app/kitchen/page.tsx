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
          // Same filter set as /api/kitchen/orders polling. The polling
          // shape MUST match SSR exactly or the kitchen flashes stale
          // rows for ~4 seconds between hydration and the first poll —
          // which is what happened when these two diverged before Luigi
          // 2026-06-02 caught it.
          //   - notifiedAt: filters pre-payment card orders the kitchen
          //     mustn't start cooking until Stripe webhook confirms.
          //   - clearedFromKitchenAt: filters orders the owner already
          //     cleared from the kitchen tablet (Clear / Clear complete).
          notifiedAt: { not: null },
          clearedFromKitchenAt: null,
        },
        orderBy: { createdAt: "desc" },
        // Match the polling cap (500) so a busy kitchen doesn't see
        // "extra" rows briefly appear on first poll. Cap stays as a
        // safety net; well below the size where it'd hurt SSR latency.
        take: 500,
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
