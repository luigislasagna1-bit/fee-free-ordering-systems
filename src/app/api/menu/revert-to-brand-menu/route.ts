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
  // half-deleted state.
  //
  // ⚠️ ORDER MATTERS — the schema has Restrict FKs (Prisma's default
  // when no onDelete is set) on:
  //   - MenuItem.category   → MenuCategory  (line 483)
  //   - ModifierGroup.menuItem  → MenuItem  (line 530)
  //   - ModifierGroup.category → MenuCategory (line 532)
  //
  // If you try to delete categories first, every MenuItem referencing
  // them blocks the delete and the transaction fails with a foreign-key
  // violation (which Vercel surfaces as a 500 with empty body — that's
  // what was breaking the UAT click).
  //
  // Correct order: deepest references first.
  //   1. ModifierGroup — references both MenuItem + MenuCategory
  //   2. MenuItem      — references MenuCategory
  //   3. MenuCategory  — top of the tree, nothing references it after (1)+(2)
  //
  // ItemVariant + ModifierOption auto-cascade off MenuItem/ModifierGroup
  // via onDelete: Cascade rules (lines 502 etc.), so we don't need to
  // delete them explicitly.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const modifierGroupsDeleted = await tx.modifierGroup.deleteMany({
        where: { restaurantId: restaurant.id },
      });
      const itemsDeleted = await tx.menuItem.deleteMany({
        where: { restaurantId: restaurant.id },
      });
      const categoriesDeleted = await tx.menuCategory.deleteMany({
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
  } catch (err) {
    // Surface the real error to the caller instead of letting Vercel
    // return an empty-body 500 (which produces a confusing
    // "Unexpected end of JSON input" on the client). Common cause: an
    // unhandled foreign-key reference to a MenuItem or MenuCategory
    // that we didn't account for in the deletion order above.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[revert-to-brand-menu] failed", { restaurantId: restaurant.id, err: message });
    return NextResponse.json(
      { error: `Could not revert menu: ${message}` },
      { status: 500 },
    );
  }
}
