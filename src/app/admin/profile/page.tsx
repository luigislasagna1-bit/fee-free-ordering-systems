import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getPlatformGoogleKey } from "@/lib/platform-maps";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    : null;
  // Always the platform Google key — the only maps key (Luigi 2026-07-04); any
  // legacy restaurant-own key is ignored.
  if (restaurant) {
    restaurant.googleMapsApiKey = (await getPlatformGoogleKey()) || null;
  }
  return <ProfileClient restaurant={restaurant as any} />;
}
