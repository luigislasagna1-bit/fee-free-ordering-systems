/**
 * GET /api/kitchen/menu-stock
 *
 * List every menu item for the kitchen's restaurant with its stock
 * state — used by the kitchen's stock-management panel so staff can
 * toggle items out of stock without leaving the kitchen tablet.
 *
 * Returns compact shape: { id, name, category name, isSoldOut }
 * to keep the response light when polled.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";

export async function GET() {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await prisma.menuItem.findMany({
    where: { restaurantId, isHidden: false },
    select: {
      id: true,
      name: true,
      isSoldOut: true,
      // Surface base price so the kitchen's Settings > Item availability
      // & pricing panel can show + edit it inline without forcing the
      // owner to open /admin/menu. PATCH below accepts price updates
      // scoped to this restaurant only.
      price: true,
      category: { select: { name: true, sortOrder: true } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ items });
}
