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
      await prisma.modifierGroup.update({ where: { id: ids[i] }, data: { sortOrder: i } });
    }
  }
  return NextResponse.json({ ok: true });
}
