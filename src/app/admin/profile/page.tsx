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
  // Fall back to the platform Google key so the profile pin map renders with
  // Google even when this restaurant hasn't set its own key (Luigi 2026-06-13).
  if (restaurant && !restaurant.googleMapsApiKey) {
    restaurant.googleMapsApiKey = (await getPlatformGoogleKey()) || null;
  }
  return <ProfileClient restaurant={restaurant as any} />;
}
