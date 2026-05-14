import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { subscriptionPlan: true },
      })
    : null;

  const allPlans = await prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } });

  return <SettingsClient restaurant={restaurant} allPlans={allPlans} />;
}
