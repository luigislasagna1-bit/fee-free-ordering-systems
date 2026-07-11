import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrdersClient } from "./OrdersClient";

export default async function OrdersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  // The kitchen-workflow / backup-printer / phone-call / vibration toggles moved
  // to admin > Settings ("Kitchen & order alerts") so this screen is purely the
  // live orders list. Luigi 2026-06-16.
  // Reward fields gate + label the expanded row's credit lines (standing rule:
  // a disabled feature must not show anywhere). Luigi 2026-07-11.
  const [orders, restaurant] = await Promise.all([
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { include: { modifiers: true } },
        customer: true,
      },
    }),
    restaurantId
      ? prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <OrdersClient
      orders={orders as any}
      rewardsEnabled={restaurant?.rewardsEnabled === true}
      rewardLabelSingular={restaurant?.rewardLabelSingular ?? null}
      rewardLabelPlural={restaurant?.rewardLabelPlural ?? null}
    />
  );
}
