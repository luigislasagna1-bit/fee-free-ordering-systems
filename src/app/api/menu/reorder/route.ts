import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";

// POST { type: "categories"|"items"|"modifiers", ids: string[] }
// Reorders by assigning sortOrder 0..n based on array position
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { type, ids } = await req.json();
  if (!type || !Array.isArray(ids)) return NextResponse.json({ error: "type and ids required" }, { status: 400 });

  for (let i = 0; i < ids.length; i++) {
    if (type === "categories") {
      await prisma.menuCategory.updateMany({ where: { id: ids[i], restaurantId }, data: { sortOrder: i } });
    } else if (type === "items") {
      await prisma.menuItem.updateMany({ where: { id: ids[i], restaurantId }, data: { sortOrder: i } });
    } else if (type === "modifiers") {
      // Ownership check: a modifier group is owned by this restaurant
      // when EITHER it's a library group (restaurantId set) OR it's
      // attached to a menu item / category that belongs here. Without
      // this OR clause the previous implementation (plain
      // `update({ where: { id }})`) let any authenticated user reorder
      // any restaurant's modifier groups by guessing the IDs.
      await prisma.modifierGroup.updateMany({
        where: {
          id: ids[i],
          OR: [
            { restaurantId },
            { menuItem: { restaurantId } },
            { category: { restaurantId } },
          ],
        },
        data: { sortOrder: i },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
