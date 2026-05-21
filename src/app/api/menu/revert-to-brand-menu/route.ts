import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * POST /api/menu/revert-to-brand-menu
 *
 * Destructive: deletes ALL of this location's local MenuCategories /
 * MenuItems / Variants / ModifierGroups / Options / etc., then flips
 * `useBrandMenu = true` so the menu resolver starts redirecting reads
 * back to the parent (brand) menu.
 *
 * Once reverted:
 *   - Any prices / availability / overrides this location had are GONE.
 *   - The location shows the brand menu read-only at /admin/menu (same
 *     as a freshly-spawned child location).
 *   - The customer order page at /order/<slug> shows the brand menu.
 *
 * Idempotent only in the sense that running it twice on an already-
 * inheriting location is a no-op. Running it on a customized location
 * is permanently destructive — caller MUST confirm with the owner
 * BEFORE calling this endpoint.
 *
 * Mirrors /api/menu/customize-location's auth + parent-required logic.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "restaurant_admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, parentRestaurantId: true, useBrandMenu: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.parentRestaurantId) {
    return NextResponse.json(
      { error: "This restaurant has no parent brand to inherit from." },
      { status: 400 },
    );
  }
  if (restaurant.useBrandMenu) {
    // Already inheriting — nothing to revert. Return ok so the UI can
    // refresh and re-render without surfacing a confusing error.
    return NextResponse.json({ ok: true, alreadyInheriting: true });
  }

  // Delete in a single transaction so we never leave the location in a
  // half-deleted state. The schema's cascade rules (set on
  // MenuCategory → MenuItem, MenuItem → variants/modifiers, etc.) take
  // care of the dependent rows when we delete the categories.
  //
  // We use deleteMany rather than findMany+delete to keep this O(1) in
  // round-trips. Variant/modifier orphans get cleaned by cascading
  // foreign-key onDelete: Cascade rules on the schema.
  const result = await prisma.$transaction(async (tx) => {
    // Delete categories first — items cascade, modifier groups + options
    // cascade off items + categories, variants cascade off items.
    const categoriesDeleted = await tx.menuCategory.deleteMany({
      where: { restaurantId: restaurant.id },
    });
    // Any items that were attached directly to no category (rare edge,
    // but possible from older data) — clean them up too.
    const itemsDeleted = await tx.menuItem.deleteMany({
      where: { restaurantId: restaurant.id },
    });
    // Modifier groups that aren't reachable from a category or item.
    const modifierGroupsDeleted = await tx.modifierGroup.deleteMany({
      where: { restaurantId: restaurant.id },
    });
    // Flip the inheritance flag LAST so a partial failure above leaves
    // the location on its old custom menu (consistent state) rather
    // than pointing at the brand menu while half the local data still
    // exists in the DB.
    await tx.restaurant.update({
      where: { id: restaurant.id },
      data: { useBrandMenu: true },
    });
    return {
      categoriesDeleted: categoriesDeleted.count,
      itemsDeleted: itemsDeleted.count,
      modifierGroupsDeleted: modifierGroupsDeleted.count,
    };
  });

  return NextResponse.json({ ok: true, ...result });
}
