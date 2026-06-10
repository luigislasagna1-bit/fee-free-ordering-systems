import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { LocationsClient } from "./LocationsClient";

const LOCATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  city: true,
  state: true,
  subscriptionStatus: true,
  createdAt: true,
} as const;

export default async function LocationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  // Brand role is decided by the CANONICAL owning restaurant (User.restaurantId
  // column), NOT the cookie-swapped active location — so a parent who has
  // switched into a child is still treated as the brand owner. A user whose own
  // restaurant has a parent is a CHILD admin: they may only ever see + manage
  // their OWN location, never the brand HQ or sibling franchises. Only the
  // brand-parent owner sees + manages the whole tree. Luigi 2026-06-10.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { restaurantId: true },
  });
  if (!userRow?.restaurantId) redirect("/superadmin");

  const canonical = await prisma.restaurant.findUnique({
    where: { id: userRow.restaurantId },
    select: { id: true, parentRestaurantId: true },
  });
  if (!canonical) redirect("/admin");

  const isBrandParent = canonical.parentRestaurantId == null;

  if (!isBrandParent) {
    // Child admin — only their own location, no brand tree, no "add location".
    const self = await prisma.restaurant.findUnique({
      where: { id: canonical.id },
      select: LOCATION_SELECT,
    });
    return (
      <LocationsClient
        parent={JSON.parse(JSON.stringify(self))}
        children={[]}
        activeId={user.restaurantId}
        isBrandParent={false}
      />
    );
  }

  const parentId = canonical.id;
  const [parent, children] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: parentId }, select: LOCATION_SELECT }),
    prisma.restaurant.findMany({
      where: { parentRestaurantId: parentId },
      select: LOCATION_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <LocationsClient
      parent={JSON.parse(JSON.stringify(parent))}
      children={JSON.parse(JSON.stringify(children))}
      activeId={user.restaurantId}
      isBrandParent={true}
    />
  );
}
