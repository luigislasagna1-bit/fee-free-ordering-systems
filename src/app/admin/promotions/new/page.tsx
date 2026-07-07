import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { resolvePaymentCapabilities, usablePaymentMethods } from "@/lib/payment-capabilities";
import { isOnMarketplace } from "@/lib/marketplace";
import { currencySymbol } from "@/lib/utils";
import { PromoWizard } from "../_wizard/PromoWizard";

export default async function NewPromotionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurantId = user.restaurantId;

  const [restaurant, categories, menuItems, deliveryZones, hasAdvanced, onMarketplace] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { paymentMethods: true, currency: true, rewardsEnabled: true, paypalAccountStatus: true },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId },
        // Group by menu (contiguous) so the picker can show menu sub-headers
        // for multi-menu stores. Luigi 2026-06-26.
        orderBy: [{ menuId: "asc" }, { sortOrder: "asc" }],
        select: { id: true, name: true, menuId: true, menu: { select: { name: true } } },
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
      isOnMarketplace(restaurantId),
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
  // Only offer payment methods that are actually LIVE — an online-card / PayPal
  // reward (or restriction) can't target a method customers can't use because
  // the Online Payments add-on isn't active. Luigi 2026-07-07.
  const caps = await resolvePaymentCapabilities(restaurantId, (restaurant as any)?.paypalAccountStatus);
  const usableMethods = usablePaymentMethods(paymentMethods, caps);

  return (
    <PromoWizard
      mode="new"
      hasAdvanced={hasAdvanced}
      categories={categories.map((c: any) => ({ id: c.id, name: c.name, menuId: c.menuId, menuName: c.menu?.name ?? null }))}
      menuItems={menuItems}
      paymentMethods={usableMethods}
      deliveryZones={deliveryZones}
      currencySymbol={currencySymbol(restaurant?.currency)}
      isOnMarketplace={onMarketplace}
      // Feature-gated visibility (Luigi 2026-07-03): the Grant Reward Dollars
      // type only shows when the Reward Dollars program is ON.
      rewardsEnabled={!!(restaurant as any)?.rewardsEnabled}
    />
  );
}
