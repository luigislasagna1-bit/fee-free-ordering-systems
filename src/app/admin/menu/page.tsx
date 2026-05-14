import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { MenuClient } from "./MenuClient";

export default async function MenuPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [categories, libraryGroups] = await Promise.all([
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
  ]);

  return (
    <MenuClient
      categories={categories as any}
      libraryGroups={libraryGroups as any}
      restaurantId={restaurantId || ""}
    />
  );
}
