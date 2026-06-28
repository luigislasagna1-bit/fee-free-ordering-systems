/**
 * POST /api/admin/menu/dedupe-categories
 *
 * Merges DUPLICATE CATEGORIES (the thing the "Fix duplicates" button never did —
 * it only cleaned duplicate modifier attachments). Two categories are duplicates
 * when they share the same NORMALIZED name within the same menu version. The merge
 * is non-destructive to order history:
 *   - survivor = the duplicate with the MOST items (tie → lowest sortOrder)
 *   - every item from the other duplicates is MOVED into the survivor, EXCEPT an
 *     item whose normalized name already exists in the survivor → that exact
 *     duplicate item is deleted (safe: Order.menuItemId is SetNull, so the order
 *     keeps its name/price snapshot — no history loss)
 *   - the now-empty duplicate category's category-level modifier groups are
 *     removed, then the empty category shell is deleted
 *
 * Restaurant-scoped (the admin's own restaurant). Idempotent — a clean menu is a
 * no-op. Each name-group runs in its own transaction so a single odd group can't
 * abort the whole sweep. Luigi 2026-06-27.
 *
 * Response: { mergedCategories, movedItems, removedItems }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { planCategoryMerges } from "@/lib/menu-dedupe";

export async function POST(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurantId = user.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "No restaurant scope" }, { status: 403 });

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    select: {
      id: true, name: true, menuId: true, sortOrder: true, createdAt: true,
      menuItems: { select: { id: true, name: true } },
    },
  });

  const plans = planCategoryMerges(categories);
  let mergedCategories = 0, movedItems = 0, removedItems = 0;

  for (const plan of plans) {
    const ops: any[] = [];
    if (plan.deleteItemIds.length) ops.push(prisma.menuItem.deleteMany({ where: { id: { in: plan.deleteItemIds } } }));
    if (plan.moveItemIds.length) ops.push(prisma.menuItem.updateMany({ where: { id: { in: plan.moveItemIds } }, data: { categoryId: plan.survivorId } }));
    // Drop the losers' category-level modifier attachments, then the empty shells.
    ops.push(prisma.modifierGroup.deleteMany({ where: { categoryId: { in: plan.loserIds } } }));
    ops.push(prisma.menuCategory.deleteMany({ where: { id: { in: plan.loserIds } } }));

    try {
      await prisma.$transaction(ops);
      mergedCategories += plan.loserIds.length;
      movedItems += plan.moveItemIds.length;
      removedItems += plan.deleteItemIds.length;
    } catch (e) {
      console.error(`[dedupe-categories] group merge failed (survivor ${plan.survivorId})`, e);
    }
  }

  return NextResponse.json({ mergedCategories, movedItems, removedItems });
}
