import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { copyBrandMenuToLocation } from "@/lib/brand";

/**
 * POST /api/menu/customize-location
 *
 * Flip this location off the inherited brand menu and onto its own
 * independent menu. Steps:
 *   1. Verify the caller is an admin of a CHILD location (has a
 *      parentRestaurantId) currently inheriting (useBrandMenu = true).
 *   2. Copy every category/item/variant from the parent into this
 *      location (idempotent — skips by name, doesn't overwrite).
 *   3. Set useBrandMenu = false so the resolver stops redirecting reads
 *      to the parent and admin endpoints can now edit local rows.
 *
 * Reversing this (going back to brand inheritance) is a separate
 * endpoint — `POST /api/menu/revert-to-brand-menu` — and intentionally
 * destructive (it would wipe local edits), so it lives behind a confirm
 * dialog. Not implemented yet — Phase 2 follow-up.
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
      { error: "This restaurant is not a child location — there's no brand menu to customize." },
      { status: 400 },
    );
  }
  if (!restaurant.useBrandMenu) {
    return NextResponse.json(
      { error: "This location already has a custom menu." },
      { status: 400 },
    );
  }

  // Copy the parent's menu into this child. Idempotent — re-running
  // is a no-op for existing categories/items.
  const result = await copyBrandMenuToLocation(restaurant.parentRestaurantId, restaurant.id);

  // Flip the inheritance flag last so a partial failure above leaves the
  // location still on the brand menu (consistent state) rather than on
  // an empty custom menu.
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { useBrandMenu: false },
  });

  return NextResponse.json({
    ok: true,
    categoriesCopied: result.categoriesCopied,
    itemsCopied: result.itemsCopied,
  });
}
