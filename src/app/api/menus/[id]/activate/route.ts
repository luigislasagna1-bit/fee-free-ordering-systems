/**
 * POST /api/menus/[id]/activate — make this menu the live one immediately.
 * Atomically deactivates whichever menu was active (one-active invariant).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { activateMenu } from "@/lib/menu";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;
  const menu = await prisma.menu.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!menu) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

  await activateMenu(restaurantId, id);
  return NextResponse.json({ ok: true });
}
