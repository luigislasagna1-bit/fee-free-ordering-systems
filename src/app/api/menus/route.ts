/**
 * /api/menus — manage a restaurant's menu versions (multi-menu manager).
 *   GET  — list this restaurant's menus (with category counts).
 *   POST — create a new empty draft menu.
 *
 * Inheriting (brand) locations can't manage menus — they customize first.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const menus = await prisma.menu.findMany({
    where: { restaurantId },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, isActive: true, isArchived: true,
      scheduledActivateAt: true, publishedAt: true, createdAt: true, updatedAt: true,
      _count: { select: { categories: true } },
    },
  });
  return NextResponse.json(
    menus.map((m) => ({
      id: m.id, name: m.name, isActive: m.isActive, isArchived: m.isArchived,
      scheduledActivateAt: m.scheduledActivateAt?.toISOString() ?? null,
      publishedAt: m.publishedAt?.toISOString() ?? null,
      categoryCount: m._count.categories,
    })),
  );
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 80) || "New menu";

  const agg = await prisma.menu.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
  const menu = await prisma.menu.create({
    data: { restaurantId, name, isActive: false, sortOrder: (agg._max.sortOrder ?? 0) + 1 },
  });
  return NextResponse.json({ id: menu.id, name: menu.name });
}
