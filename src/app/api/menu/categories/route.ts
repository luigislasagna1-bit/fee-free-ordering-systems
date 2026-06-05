import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";
import { resolveActiveMenuId } from "@/lib/menu";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations read the brand's menu through this endpoint
  // (used by MenuClient.reload() after edits). Resolve up to the parent
  // when applicable so the client sees the same items the customer page
  // sees.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);
  // Scope to the active menu (Phase 1). With one menu this equals all the
  // restaurant's categories; Phase 2 will let the client pass a menuId to edit
  // a non-active draft.
  const activeMenuId = await resolveActiveMenuId(menuRestaurantId);
  const cats = await prisma.menuCategory.findMany({
    where: activeMenuId ? { menuId: activeMenuId } : { restaurantId: menuRestaurantId },
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
  });
  return NextResponse.json(cats);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations cannot create categories — they must customize first.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json();
  const { name, description, imageUrl, isHidden, isCatering } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // New categories belong to the restaurant's active menu so they appear on the
  // customer page (which now reads the active menu). Phase 2 will let the editor
  // target a specific draft menu instead.
  const activeMenuId = await resolveActiveMenuId(restaurantId);
  const existing = await prisma.menuCategory.count({
    where: activeMenuId ? { menuId: activeMenuId } : { restaurantId },
  });
  const cat = await prisma.menuCategory.create({
    data: {
      restaurantId, menuId: activeMenuId ?? undefined,
      name: name.trim(), description, imageUrl,
      isHidden: isHidden ?? false,
      isCatering: !!isCatering,
      sortOrder: existing,
    },
  });
  return NextResponse.json(cat);
}
