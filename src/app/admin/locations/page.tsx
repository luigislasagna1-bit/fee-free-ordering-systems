import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { LocationsClient } from "./LocationsClient";

export default async function LocationsPage() {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) redirect("/login");

  // The brand's parent is the caller's restaurant if it has no parent,
  // otherwise walk up.
  const current = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, parentRestaurantId: true },
  });
  if (!current) redirect("/admin");

  const parentId = current.parentRestaurantId ?? current.id;

  const [parent, children] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        state: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    }),
    prisma.restaurant.findMany({
      where: { parentRestaurantId: parentId },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        state: true,
        subscriptionStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <LocationsClient
      parent={JSON.parse(JSON.stringify(parent))}
      children={JSON.parse(JSON.stringify(children))}
      activeId={user.restaurantId}
    />
  );
}
