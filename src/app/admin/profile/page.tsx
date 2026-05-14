import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    : null;
  return <ProfileClient restaurant={restaurant as any} />;
}
