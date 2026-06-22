import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { OrderHandlingClient } from "./OrderHandlingClient";

export default async function OrderHandlingPage() {
  const user = await getSessionUser();
  // Authed-but-no-restaurant (superadmin) goes to /superadmin, not /login — see
  // AGENTS.md redirect-loop rule.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: {
      autoAcceptOrders: true,
      allowScheduledOrders: true,
      requireScheduledOrders: true,
      // For the auto-accept help text ("…Pickup: {pickup} min, Delivery: {delivery} min").
      estimatedPickup: true,
      estimatedDelivery: true,
    },
  });

  return (
    <OrderHandlingClient
      initial={{
        autoAcceptOrders: restaurant?.autoAcceptOrders ?? false,
        allowScheduledOrders: restaurant?.allowScheduledOrders ?? true,
        requireScheduledOrders: restaurant?.requireScheduledOrders ?? false,
        pickupEta: restaurant?.estimatedPickup ?? 20,
        deliveryEta: restaurant?.estimatedDelivery ?? 45,
      }}
    />
  );
}
