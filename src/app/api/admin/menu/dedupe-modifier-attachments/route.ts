/**
 * POST /api/admin/menu/dedupe-modifier-attachments
 *
 * One-shot repair endpoint. Finds every menu item whose parent
 * category has a modifier-group attachment with the same
 * `libraryGroupId` as one of the item's own attachments, and deletes
 * the item-level duplicate. The category attachment becomes the
 * single source of truth and the customer no longer sees the same
 * modifier group twice.
 *
 * Why it exists: before today's attach-endpoint fix (2026-06-01),
 * attaching a library group to a category did NOT delete pre-existing
 * item-level attachments. Owners ended up with mixed blue/green chips
 * (blue = item-level, green = inherited) which presented the same
 * modifier group twice to the customer. New attachments are now
 * cleaned up inline; this endpoint repairs the legacy state.
 *
 * Auth: restaurant_admin (scoped to their own restaurant) OR superadmin
 * (operates on every restaurant). Idempotent — re-running with no
 * duplicates is a no-op.
 *
 * Response: { cleaned: number, restaurantsTouched: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function POST(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope the cleanup. Restaurant admins repair only their own data;
  // superadmins can repair everything (useful for the one-time global
  // migration after we ship the fix).
  const restaurantFilter = user.role === "superadmin"
    ? {}
    : user.restaurantId
      ? { id: user.restaurantId }
      : null;
  if (!restaurantFilter) {
    return NextResponse.json({ error: "No restaurant scope" }, { status: 403 });
  }

  // For each restaurant, find item-level modifier groups whose
  // libraryGroupId also appears on the item's parent category.
  // Those item-level rows are the duplicates we want to drop.
  const restaurants = await prisma.restaurant.findMany({
    where: restaurantFilter,
    select: { id: true },
  });

  let totalCleaned = 0;
  let restaurantsTouched = 0;

  for (const r of restaurants) {
    // All category-level attachments for this restaurant, keyed by
    // categoryId + libraryGroupId so we can probe in O(1) below.
    const catAttachments = await prisma.modifierGroup.findMany({
      where: {
        category: { restaurantId: r.id },
        libraryGroupId: { not: null },
      },
      select: { categoryId: true, libraryGroupId: true },
    });
    if (catAttachments.length === 0) continue;
    const probe = new Set<string>(
      catAttachments.map((c) => `${c.categoryId}::${c.libraryGroupId}`),
    );

    // Item-level attachments whose item belongs to a category we
    // know also attaches the same library group.
    const itemAttachments = await prisma.modifierGroup.findMany({
      where: {
        menuItem: { restaurantId: r.id },
        libraryGroupId: { not: null },
      },
      select: {
        id: true,
        libraryGroupId: true,
        menuItem: { select: { categoryId: true } },
      },
    });
    const duplicateIds: string[] = [];
    for (const ia of itemAttachments) {
      const cat = ia.menuItem?.categoryId;
      if (!cat || !ia.libraryGroupId) continue;
      if (probe.has(`${cat}::${ia.libraryGroupId}`)) {
        duplicateIds.push(ia.id);
      }
    }
    if (duplicateIds.length > 0) {
      await prisma.modifierGroup.deleteMany({
        where: { id: { in: duplicateIds } },
      });
      totalCleaned += duplicateIds.length;
      restaurantsTouched += 1;
    }
  }

  return NextResponse.json({ cleaned: totalCleaned, restaurantsTouched });
}
