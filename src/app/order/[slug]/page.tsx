import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { OrderingPageClient } from "./OrderingPageClient";

export default async function OrderingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    include: {
      menuCategories: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          // Category-level modifier groups (inherited by all items in the category)
          modifierGroups: {
            where: { menuItemId: null, isHidden: false },
            orderBy: { sortOrder: "asc" },
            include: {
              options: {
                where: { isAvailable: true },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          menuItems: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
            include: {
              variants: { orderBy: { sortOrder: "asc" } },
              modifierGroups: {
                where: { isHidden: false },
                orderBy: { sortOrder: "asc" },
                include: {
                  options: {
                    where: { isAvailable: true },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      deliveryZones: {
        where: { isActive: true },
        orderBy: [{ radiusKm: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!restaurant) notFound();

  const paymentProvider = await prisma.paymentProvider.findUnique({
    where: { restaurantId: restaurant.id },
    select: { isActive: true, publishableKey: true, mode: true },
  });

  const cardPaymentEnabled = !!(
    paymentProvider?.isActive &&
    paymentProvider.publishableKey &&
    paymentProvider.publishableKey.startsWith("pk_")
  );

  return (
    <OrderingPageClient
      restaurant={restaurant as any}
      cardPaymentEnabled={cardPaymentEnabled}
      stripePublishableKey={cardPaymentEnabled ? paymentProvider!.publishableKey : null}
      themeSettings={(restaurant as any).themeSettings ?? null}
    />
  );
}
