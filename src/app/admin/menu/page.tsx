import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { MenuClient } from "./MenuClient";
import { MenuSwitcher, type MenuLite } from "./MenuSwitcher";
import { RevertToBrandMenuBanner } from "./RevertToBrandMenuBanner";
import { InheritedMenuView } from "./InheritedMenuView";
import { MasterMenuBanner } from "./MasterMenuBanner";
import { isInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";
import { resolveActiveMenuId } from "@/lib/menu";
import { hasFeature } from "@/lib/entitlements";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ menu?: string }>;
}) {
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
    // Mirror the brand's ACTIVE menu only (multi-menu) — not every version.
    const brandActiveMenuId = await resolveActiveMenuId(menuRestaurantId);
    const [parent, categories] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: menuRestaurantId },
        select: { id: true, name: true },
      }),
      prisma.menuCategory.findMany({
        where: brandActiveMenuId ? { menuId: brandActiveMenuId } : { restaurantId: menuRestaurantId },
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

  // Determine if THIS restaurant is a CHILD that's gone custom (not
  // inheriting from a brand parent). If so, surface the revert banner.
  const selfRow = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      parentRestaurantId: true,
      parentRestaurant: { select: { name: true } },
      hoursFormat: true,
    },
  });
  const isChildOnCustomMenu = !!selfRow?.parentRestaurantId;
  const menuHoursFormat = selfRow?.hoursFormat === "12h" ? "12h" : "24h";

  // Multi-menu: which menu version is being edited? ?menu=<id> (validated to
  // belong to this restaurant) or the active menu. Phase 2. Luigi 2026-06-05.
  const sp = await searchParams;
  const activeMenuId = await resolveActiveMenuId(restaurantId);
  let selectedMenuId = activeMenuId;
  if (sp.menu) {
    const owned = await prisma.menu.findFirst({ where: { id: sp.menu, restaurantId }, select: { id: true } });
    if (owned) selectedMenuId = owned.id;
  }
  const menusRaw = await prisma.menu.findMany({
    where: { restaurantId },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, isActive: true, isArchived: true,
      scheduledActivateAt: true, publishedAt: true,
      _count: { select: { categories: true } },
    },
  });
  // Combos are gated behind the Advanced Promotions add-on.
  const canUseCombos = await hasFeature(restaurantId, "advanced_promo_types");
  const menus = menusRaw.map((m) => ({
    id: m.id, name: m.name, isActive: m.isActive, isArchived: m.isArchived,
    scheduledActivateAt: m.scheduledActivateAt?.toISOString() ?? null,
    publishedAt: m.publishedAt?.toISOString() ?? null,
    categoryCount: m._count.categories,
  }));

  // Brand-parent banner data — count how many child locations are
  // currently inheriting this menu so the owner sees "edits flow
  // downstream" before they touch anything.
  const [categories, libraryGroups, childCounts] = await Promise.all([
    prisma.menuCategory.findMany({
      // Edit the SELECTED menu version (defaults to the live one).
      where: selectedMenuId ? { menuId: selectedMenuId } : { restaurantId },
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
      {isChildOnCustomMenu && (
        <RevertToBrandMenuBanner
          brandName={selfRow?.parentRestaurant?.name ?? "the brand"}
        />
      )}
      <MasterMenuBanner
        inheritingCount={childCounts.inheriting}
        totalChildCount={childCounts.total}
      />
      {menus.length > 0 && selectedMenuId && (
        <MenuSwitcher menus={menus as MenuLite[]} selectedMenuId={selectedMenuId} />
      )}
      <MenuClient
        categories={categories as any}
        libraryGroups={libraryGroups as any}
        restaurantId={restaurantId || ""}
        hoursFormat={menuHoursFormat}
        menuId={selectedMenuId ?? undefined}
        canUseCombos={canUseCombos}
      />
    </>
  );
}
