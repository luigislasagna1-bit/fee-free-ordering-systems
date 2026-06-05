/**
 * POST /api/menus/[id]/duplicate — deep-clone a whole menu into a new draft.
 * Body: { name? }. Returns the new menu id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { duplicateMenu } from "@/lib/menu";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;
  const source = await prisma.menu.findFirst({ where: { id, restaurantId }, select: { id: true, name: true } });
  if (!source) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = (String(body?.name ?? "").trim() || `${source.name} (copy)`).slice(0, 80);

  const newId = await duplicateMenu(restaurantId, id, name);
  return NextResponse.json({ id: newId, name });
}
