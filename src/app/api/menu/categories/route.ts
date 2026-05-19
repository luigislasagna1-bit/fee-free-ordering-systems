import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu, resolveMenuRestaurantId } from "@/lib/brand";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Inheriting locations read the brand's menu through this endpoint
  // (used by MenuClient.reload() after edits). Resolve up to the parent
  // when applicable so the client sees the same items the customer page
  // sees.
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);
  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: menuRestaurantId },
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
  const { name, description, imageUrl, isHidden } = body;
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const existing = await prisma.menuCategory.count({ where: { restaurantId } });
  const cat = await prisma.menuCategory.create({
    data: { restaurantId, name: name.trim(), description, imageUrl, isHidden: isHidden ?? false, sortOrder: existing },
  });
  return NextResponse.json(cat);
}
