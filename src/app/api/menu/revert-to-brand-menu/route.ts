import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { deleteLocationMenuAndInherit } from "@/lib/brand";
import { isLocked } from "@/lib/inherited-settings";

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
    select: { id: true, parentRestaurantId: true, useBrandMenu: true, lockedSettings: true },
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
  // The brand parent has LOCKED the menu — the child may not change it.
  if (isLocked(restaurant, "menu")) {
    return NextResponse.json(
      { error: "The menu is managed by your brand and can't be changed here.", code: "locked", setting: "menu" },
      { status: 403 },
    );
  }
  if (restaurant.useBrandMenu) {
    // Already inheriting — nothing to revert. Return ok so the UI can
    // refresh and re-render without surfacing a confusing error.
    return NextResponse.json({ ok: true, alreadyInheriting: true });
  }

  // Shared, FK-ordered delete + inherit flip — see deleteLocationMenuAndInherit
  // in src/lib/brand.ts (same logic the brand parent's per-child control uses).
  try {
    const result = await deleteLocationMenuAndInherit(restaurant.id);
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
