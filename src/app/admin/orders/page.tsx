import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrdersClient } from "./OrdersClient";

export default async function OrdersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const orders = await prisma.order.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      items: { include: { modifiers: true } },
      customer: true,
    },
  });

  return <OrdersClient orders={orders as any} />;
}
