import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { isOnMarketplace } from "@/lib/marketplace";
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

  const [promo, restaurant, categories, menuItems, deliveryZones, hasAdvanced, onMarketplace] =
    await Promise.all([
      prisma.promotion.findFirst({
        where: { id, restaurantId },
        // VIP targets: when linked, the wizard replaces the Visible/Hidden +
        // banner controls with a "VIP only" notice (those switches can't make
        // a VIP-linked promo public — Luigi 2026-07-02).
        include: { groupLinks: { select: { group: { select: { name: true } }, email: true, customer: { select: { name: true, email: true } } } } },
      }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { paymentMethods: true, currency: true, rewardsEnabled: true },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId },
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
    channel: promo.channel,
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
    imageUrl: promo.imageUrl,
    displayMode: promo.displayMode,
    highlightThreshold: promo.highlightThreshold,
  };

  // Human labels for the VIP targets this promo is attached to — group names,
  // else the individual's name/email (deduped, capped for the notice).
  const vipGroupNames = [
    ...new Set(
      (promo.groupLinks ?? []).map((l: any) =>
        l.group?.name || l.customer?.name || l.customer?.email || l.email || "VIP",
      ),
    ),
  ].slice(0, 6) as string[];

  return (
    <PromoWizard
      mode="edit"
      hasAdvanced={hasAdvanced}
      categories={categories.map((c: any) => ({ id: c.id, name: c.name, menuId: c.menuId, menuName: c.menu?.name ?? null }))}
      menuItems={menuItems}
      paymentMethods={paymentMethods}
      deliveryZones={deliveryZones}
      initialPromo={initialPromo}
      currencySymbol={currencySymbol((restaurant as any)?.currency)}
      isOnMarketplace={onMarketplace}
      vipGroupNames={vipGroupNames}
      rewardsEnabled={!!(restaurant as any)?.rewardsEnabled}
    />
  );
}
