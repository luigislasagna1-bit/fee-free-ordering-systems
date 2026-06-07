import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { PromoWizard } from "../_wizard/PromoWizard";

export default async function NewPromotionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurantId = user.restaurantId;

  const [restaurant, categories, menuItems, deliveryZones, hasAdvanced] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { paymentMethods: true },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, categoryId: true, price: true,
          variants: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, price: true },
          },
        },
      }),
      prisma.deliveryZone.findMany({
        where: { restaurantId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      hasFeature(restaurantId, "advanced_promo_types"),
    ]);

  let paymentMethods: string[] = [];
  if (restaurant?.paymentMethods) {
    try {
      const parsed = JSON.parse(restaurant.paymentMethods);
      if (Array.isArray(parsed)) paymentMethods = parsed.map((s) => String(s));
    } catch {
      paymentMethods = [];
    }
  }

  return (
    <PromoWizard
      mode="new"
      hasAdvanced={hasAdvanced}
      categories={categories}
      menuItems={menuItems}
      paymentMethods={paymentMethods}
      deliveryZones={deliveryZones}
    />
  );
}
