import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { currencySymbol } from "@/lib/utils";
import { PromoWizard, PromoRow } from "../../_wizard/PromoWizard";

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurantId = user.restaurantId;
  const { id } = await params;

  const [promo, restaurant, categories, menuItems, deliveryZones, hasAdvanced] =
    await Promise.all([
      prisma.promotion.findFirst({
        where: { id, restaurantId },
      }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { paymentMethods: true, currency: true },
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

  if (!promo) notFound();

  let paymentMethods: string[] = [];
  if (restaurant?.paymentMethods) {
    try {
      const parsed = JSON.parse(restaurant.paymentMethods);
      if (Array.isArray(parsed)) paymentMethods = parsed.map((s) => String(s));
    } catch {
      paymentMethods = [];
    }
  }

  // Serialise Date → ISO so the client component receives plain JSON.
  const initialPromo: PromoRow = {
    id: promo.id,
    name: promo.name,
    description: promo.description,
    promotionType: promo.promotionType,
    isActive: promo.isActive,
    stackingRule: promo.stackingRule,
    orderType: promo.orderType,
    customerType: promo.customerType,
    minimumOrder: promo.minimumOrder,
    rules: promo.rules,
    ruleConfig: promo.ruleConfig,
    daysOfWeek: promo.daysOfWeek,
    startsAt: promo.startsAt ? promo.startsAt.toISOString() : null,
    endsAt: promo.endsAt ? promo.endsAt.toISOString() : null,
    usageLimit: promo.usageLimit,
    autoApply: promo.autoApply,
    couponCode: promo.couponCode,
    usableHourStart: promo.usableHourStart,
    usableHourEnd: promo.usableHourEnd,
    showOnBanner: promo.showOnBanner,
    bannerHeadline: promo.bannerHeadline,
    paymentMethodSlugs: promo.paymentMethodSlugs,
    deliveryZoneIds: promo.deliveryZoneIds,
    onceLifetimePerClient: promo.onceLifetimePerClient,
    limitedShowtimeSchedules: promo.limitedShowtimeSchedules,
    imageUrl: promo.imageUrl,
    displayMode: promo.displayMode,
    highlightThreshold: promo.highlightThreshold,
  };

  return (
    <PromoWizard
      mode="edit"
      hasAdvanced={hasAdvanced}
      categories={categories}
      menuItems={menuItems}
      paymentMethods={paymentMethods}
      deliveryZones={deliveryZones}
      initialPromo={initialPromo}
      currencySymbol={currencySymbol((restaurant as any)?.currency)}
    />
  );
}
