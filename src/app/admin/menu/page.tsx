import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { MenuClient } from "./MenuClient";
import { InheritedMenuView } from "./InheritedMenuView";
import { MasterMenuBanner } from "./MasterMenuBanner";
import { isInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";

export default async function MenuPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    return (
      <MenuClient categories={[] as any} libraryGroups={[] as any} restaurantId="" />
    );
  }

  // If this location inherits the brand menu, render the read-only
  // InheritedMenuView with a "Customize" CTA instead of the full editor.
  // Otherwise, fetch the location's own menu and render MenuClient.
  const inheriting = await isInheritingMenu(restaurantId);
  if (inheriting) {
    const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);
    const [parent, categories] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: menuRestaurantId },
        select: { id: true, name: true },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId: menuRestaurantId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          menuItems: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, price: true, imageUrl: true },
          },
        },
      }),
    ]);
    const inheritedCategories = categories.map((c) => ({
      id: c.id,
      name: c.name,
      itemCount: c.menuItems.length,
      items: c.menuItems,
    }));
    return (
      <InheritedMenuView
        brandName={parent?.name ?? "Brand"}
        categories={inheritedCategories}
      />
    );
  }

  // Brand-parent banner data — count how many child locations are
  // currently inheriting this menu so the owner sees "edits flow
  // downstream" before they touch anything.
  const [categories, libraryGroups, childCounts] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
      include: {
        modifierGroups: {
          where: { menuItemId: null },
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
        menuItems: {
          orderBy: { sortOrder: "asc" },
          include: {
            variants: { orderBy: { sortOrder: "asc" } },
            modifierGroups: {
              orderBy: { sortOrder: "asc" },
              include: { options: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    }),
    // Restaurant-level modifier library (menuItemId is null)
    prisma.modifierGroup.findMany({
      where: { restaurantId, menuItemId: null },
      orderBy: { sortOrder: "asc" },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    }),
    // Child-location stats for the master-menu banner. Two counts: total
    // children, and the subset that's currently inheriting.
    (async () => {
      const [total, inheriting] = await Promise.all([
        prisma.restaurant.count({
          where: { parentRestaurantId: restaurantId },
        }),
        prisma.restaurant.count({
          where: { parentRestaurantId: restaurantId, useBrandMenu: true },
        }),
      ]);
      return { total, inheriting };
    })(),
  ]);

  return (
    <>
      <MasterMenuBanner
        inheritingCount={childCounts.inheriting}
        totalChildCount={childCounts.total}
      />
      <MenuClient
        categories={categories as any}
        libraryGroups={libraryGroups as any}
        restaurantId={restaurantId || ""}
      />
    </>
  );
}
