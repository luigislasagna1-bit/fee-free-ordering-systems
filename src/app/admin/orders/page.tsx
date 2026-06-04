import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrdersClient } from "./OrdersClient";
import { KitchenWorkflowToggle } from "./KitchenWorkflowToggle";

export default async function OrdersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

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
          select: { kitchenWorkflowMode: true, printNodeEnabled: true, autoCallOnNewOrder: true },
        })
      : null,
  ]);

  const mode = (restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple") as
    | "simple"
    | "tracking";
  const printNodeEnabled = !!restaurant?.printNodeEnabled;
  const autoCall = !!restaurant?.autoCallOnNewOrder;

  return (
    <div className="space-y-6">
      <KitchenWorkflowToggle initialMode={mode} initialPrintNodeEnabled={printNodeEnabled} initialAutoCall={autoCall} />
      <OrdersClient orders={orders as any} />
    </div>
  );
}
