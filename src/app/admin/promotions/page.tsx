import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { PromotionsClient } from "./PromotionsClient";

export default async function PromotionsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [promotions, coupons, categories, menuItems] = await Promise.all([
    prisma.promotion.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" } }),
    prisma.coupon.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" } }),
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
