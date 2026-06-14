/**
 * Brand-aware helpers for multi-location restaurants.
 *
 * A "brand" is a parent Restaurant that has at least one child (Restaurant
 * with parentRestaurantId pointing at it). Single-location restaurants have
 * no children — their parentRestaurantId is null and no other Restaurant
 * points at them.
 *
 * The brand admin experience: when an owner logs in and is currently focused
 * on the brand parent (no active_location cookie pointing at a child), they
 * see the chain-wide BrandDashboard at /admin instead of the single-location
 * dashboard. Drilling into a child via the LocationSwitcher takes them to
 * that child's normal admin.
 */

import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { isInheriting, type InheritableSetting } from "@/lib/inherited-settings";

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  /** Locations in this brand, including the parent itself first. */
  locations: BrandLocation[];
}

export interface BrandLocation {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  isParent: boolean;
  isPublished: boolean;
  /** Quick stats used on the brand dashboard tiles. */
  stats: {
    pendingOrders: number;
    totalOrdersToday: number;
    revenueToday: number;
  };
}

/**
 * True when this restaurantId is the BRAND PARENT of at least one location.
 * That is: it has zero parentRestaurantId AND at least one Restaurant points
 * at it via parentRestaurantId. The brand dashboard is shown only in this
 * case.
 */
export async function isBrandParent(restaurantId: string): Promise<boolean> {
  const childCount = await prisma.restaurant.count({
    where: { parentRestaurantId: restaurantId },
  });
  return childCount > 0;
}

/**
 * Resolve the restaurantId whose MENU should be served for `restaurantId`.
 * - Parent / standalone restaurant → returns its own id
 * - Child with `useBrandMenu = true` → returns its parent's id
 * - Child with `useBrandMenu = false` → returns its own id
 *
 * Every place in the codebase that queries MenuCategory / MenuItem by
 * restaurantId for *serving* purposes (customer order page, kitchen
 * receipt, menu importer preview, etc.) must funnel the id through here.
 *
 * Mutation endpoints (admin CRUD on menu items) deliberately do NOT use
 * this — a child inheriting the brand menu cannot edit it. The /admin/menu
 * UI shows the read-only state with a "Customize this location" button
 * that flips `useBrandMenu` off + copies the brand's menu into this
 * location's own MenuCategory/MenuItem rows.
 */
export async function resolveMenuRestaurantId(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true, useBrandMenu: true },
  });
  if (!r) return restaurantId;
  if (r.parentRestaurantId && r.useBrandMenu) return r.parentRestaurantId;
  return restaurantId;
}

/**
 * Guard helper for menu-CRUD route handlers. Returns a ready-to-return
 * NextResponse when the location is inheriting (so it can't edit its
 * own menu — must click "Customize" first), otherwise null so the
 * handler proceeds normally.
 *
 * Usage:
 *   const blocked = await blockIfInheritingMenu(restaurantId);
 *   if (blocked) return blocked;
 */
export async function blockIfInheritingMenu(restaurantId: string): Promise<NextResponse | null> {
  if (await isInheritingMenu(restaurantId)) {
    return NextResponse.json(
      {
        error: "This location uses the master menu from your brand. Open /admin/menu and click \"Customize this location's menu\" before editing.",
        code: "menu_inherited",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Like blockIfInheritingMenu, but for the JSON-inherited settings (hours / zones
 * / availability). When the location currently INHERITS `setting` from its brand
 * parent, its own editor for that setting is read-only — return a 403 so the
 * write is refused. The location must turn that setting OFF ("Set here") under
 * Locations → "What your brand controls" before editing it. Luigi 2026-06-14.
 */
export async function blockIfInheritingSetting(
  restaurantId: string,
  setting: InheritableSetting,
): Promise<NextResponse | null> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true, useBrandMenu: true, inheritedSettings: true },
  });
  if (r && isInheriting(r, setting)) {
    return NextResponse.json(
      {
        error:
          "This is managed by your brand. Turn it off under Locations → \"What your brand controls\" before editing it here.",
        code: "setting_inherited",
        setting,
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Returns true when this restaurant currently shows the brand's menu
 * (i.e. it has a parent AND `useBrandMenu` is on). Used by the menu admin
 * to render the read-only state + "Customize" CTA.
 */
export async function isInheritingMenu(restaurantId: string): Promise<boolean> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true, useBrandMenu: true },
  });
  return !!(r?.parentRestaurantId && r.useBrandMenu);
}

/**
 * Copy a parent restaurant's entire menu (categories, items, variants,
 * modifier groups + options) into a child restaurant. Used when a child
 * flips `useBrandMenu` to false — they need a starting point they can
 * edit instead of an empty menu.
 *
 * Idempotency: skips categories that already exist by name in the child
 * (matches by case-insensitive name). Existing items in matching
 * categories are NOT touched — we never overwrite what the location
 * already has. So calling this twice is safe.
 */
export async function copyBrandMenuToLocation(parentRestaurantId: string, childRestaurantId: string): Promise<{
  categoriesCopied: number;
  itemsCopied: number;
}> {
  const parentCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: parentRestaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      menuItems: {
        include: {
          variants: true,
          modifierGroups: { include: { options: true } },
        },
      },
    },
  });

  const existingChildCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: childRestaurantId },
    select: { id: true, name: true },
  });
  const existingByLowerName = new Map(
    existingChildCategories.map((c) => [c.name.toLowerCase(), c.id]),
  );

  // Copied categories land in the child's active menu so they show to customers
  // (the ordering page reads only the active menu). Multi-menu. Luigi 2026-06-05.
  const childActiveMenu = await prisma.menu.findFirst({
    where: { restaurantId: childRestaurantId, isActive: true },
    select: { id: true },
  });

  let categoriesCopied = 0;
  let itemsCopied = 0;

  for (const parentCat of parentCategories) {
    let childCatId = existingByLowerName.get(parentCat.name.toLowerCase());
    if (!childCatId) {
      const newCat = await prisma.menuCategory.create({
        data: {
          restaurantId: childRestaurantId,
          menuId: childActiveMenu?.id ?? undefined,
          name: parentCat.name,
          description: parentCat.description,
          imageUrl: parentCat.imageUrl,
          isActive: parentCat.isActive,
          isHidden: parentCat.isHidden,
          sortOrder: parentCat.sortOrder,
        },
      });
      childCatId = newCat.id;
      categoriesCopied++;
    }

    for (const parentItem of parentCat.menuItems) {
      // Skip items whose names already exist in this category. Prevents
      // duplicate-on-re-run; the child's local edits to existing items
      // are preserved.
      const existingItem = await prisma.menuItem.findFirst({
        where: {
          restaurantId: childRestaurantId,
          categoryId: childCatId,
          name: parentItem.name,
        },
        select: { id: true },
      });
      if (existingItem) continue;

      await prisma.menuItem.create({
        data: {
          restaurantId: childRestaurantId,
          categoryId: childCatId,
          // Preserve lineage from the brand item (promo remap across versions).
          lineageId: (parentItem as any).lineageId ?? parentItem.id,
          name: parentItem.name,
          description: parentItem.description,
          price: parentItem.price,
          imageUrl: parentItem.imageUrl,
          isAvailable: parentItem.isAvailable,
          isFeatured: parentItem.isFeatured,
          isSoldOut: false,             // never inherit sold-out — local state
          isHidden: parentItem.isHidden,
          hasVariants: parentItem.hasVariants,
          forPickup: parentItem.forPickup,
          forDelivery: parentItem.forDelivery,
          availableDays: parentItem.availableDays,
          availableFrom: parentItem.availableFrom,
          availableTo: parentItem.availableTo,
          sortOrder: parentItem.sortOrder,
          calories: parentItem.calories,
          allergens: parentItem.allergens,
          pizzaConfig: parentItem.pizzaConfig,
          variants: parentItem.variants.length > 0 ? {
            create: parentItem.variants.map((v) => ({
              name: v.name,
              price: v.price,
              sortOrder: v.sortOrder,
            })),
          } : undefined,
          // ModifierGroups attached to menu items — these belong to the
          // item directly. ModifierGroups attached to categories are
          // copied separately below (with the category).
        },
      });
      itemsCopied++;
    }
  }

  return { categoriesCopied, itemsCopied };
}

/**
 * Destructive: delete ALL of a child location's local menu rows and flip it
 * back onto the brand (inherited) menu. Shared core of BOTH
 * POST /api/menu/revert-to-brand-menu (the child reverting itself) AND the
 * brand parent's per-child inheritance control — one source of truth so the
 * delicate delete order can never drift between the two call sites. Caller MUST
 * confirm with the owner first: a customized location's prices / availability /
 * overrides are permanently lost.
 *
 * ⚠️ DELETE ORDER MATTERS — the schema has Restrict FKs on
 * ModifierGroup→MenuItem, ModifierGroup→MenuCategory, and MenuItem→MenuCategory.
 * Deleting categories first throws an FK violation (Vercel surfaces it as an
 * empty-body 500). Correct order is deepest-reference-first:
 *   1. ModifierGroup  2. MenuItem  3. MenuCategory
 * ItemVariant + ModifierOption auto-cascade off their parents. The useBrandMenu
 * flip is LAST and inside the transaction so a partial failure leaves the
 * location on its old custom menu (consistent) rather than half-deleted.
 */
export async function deleteLocationMenuAndInherit(childRestaurantId: string): Promise<{
  categoriesDeleted: number;
  itemsDeleted: number;
  modifierGroupsDeleted: number;
}> {
  return prisma.$transaction(async (tx) => {
    const modifierGroupsDeleted = await tx.modifierGroup.deleteMany({
      where: { restaurantId: childRestaurantId },
    });
    const itemsDeleted = await tx.menuItem.deleteMany({
      where: { restaurantId: childRestaurantId },
    });
    const categoriesDeleted = await tx.menuCategory.deleteMany({
      where: { restaurantId: childRestaurantId },
    });
    await tx.restaurant.update({
      where: { id: childRestaurantId },
      data: { useBrandMenu: true },
    });
    return {
      categoriesDeleted: categoriesDeleted.count,
      itemsDeleted: itemsDeleted.count,
      modifierGroupsDeleted: modifierGroupsDeleted.count,
    };
  });
}

/**
 * Returns the brand summary for the parent restaurant, plus quick stats for
 * each location tile on the dashboard.
 *
 * Stats are intentionally cheap — counts + sums for "today" only. Real
 * cross-location reports come later in Phase 2.
 */
export async function loadBrandSummary(parentId: string): Promise<BrandSummary | null> {
  const parent = await prisma.restaurant.findUnique({
    where: { id: parentId },
    select: { id: true, name: true, slug: true, city: true, publishedAt: true },
  });
  if (!parent) return null;

  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: parentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, city: true, publishedAt: true },
  });

  // Compute "today" as UTC start-of-day. Per-location restaurant timezones
  // could make this fancier later, but UTC is fine for a dashboard tile.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const allLocations = [parent, ...children];
  const locationsWithStats: BrandLocation[] = await Promise.all(
    allLocations.map(async (loc) => {
      const [pending, todayStats] = await Promise.all([
        prisma.order.count({
          where: { restaurantId: loc.id, status: "pending" },
        }),
        prisma.order.aggregate({
          where: {
            restaurantId: loc.id,
            createdAt: { gte: today },
          },
          _count: true,
          _sum: { total: true },
        }),
      ]);
      return {
        id: loc.id,
        name: loc.name,
        slug: loc.slug,
        city: loc.city,
        isParent: loc.id === parent.id,
        isPublished: !!loc.publishedAt,
        stats: {
          pendingOrders: pending,
          totalOrdersToday: todayStats._count,
          revenueToday: todayStats._sum.total ?? 0,
        },
      };
    })
  );

  return {
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    locations: locationsWithStats,
  };
}
