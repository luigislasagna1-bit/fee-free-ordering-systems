import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  // FREE-by-default model: we no longer fetch SubscriptionPlan here. The
  // legacy 4-tier upgrade grid was retired and add-ons live at /admin/billing.
  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    : null;

  return <SettingsClient restaurant={restaurant} />;
}
