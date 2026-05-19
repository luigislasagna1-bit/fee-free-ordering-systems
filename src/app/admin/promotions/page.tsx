import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { PromotionsClient } from "./PromotionsClient";

export default async function PromotionsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return <PromotionsClient promotions={[] as any} coupons={[] as any} categories={[]} menuItems={[]} />;
  }

  // Resolve owner-id set for promo/coupon lookups. A child location's
  // /admin/promotions page also shows the parent's brand-scoped rows
  // (read-only at the API level — edit/delete rejects non-owner attempts).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownerIds: string[] = [restaurantId];
  if (restaurant?.parentRestaurantId) ownerIds.push(restaurant.parentRestaurantId);

  const [promotions, coupons, categories, menuItems] = await Promise.all([
    prisma.promotion.findMany({
      where: {
        OR: [
          { restaurantId },
          { restaurantId: { in: ownerIds }, scope: "brand" },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.coupon.findMany({
      where: {
        OR: [
          { restaurantId },
          { restaurantId: { in: ownerIds }, scope: "brand" },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, categoryId: true, price: true },
    }),
  ]);

  return (
    <PromotionsClient
      promotions={promotions as any}
      coupons={coupons as any}
      categories={categories}
      menuItems={menuItems}
    />
  );
}
