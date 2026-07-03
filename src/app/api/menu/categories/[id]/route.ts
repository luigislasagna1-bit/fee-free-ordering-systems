import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { buildVisibilityData } from "@/lib/menu-visibility";

async function getOwned(id: string, restaurantId: string) {
  return prisma.menuCategory.findFirst({ where: { id, restaurantId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  if (!await getOwned(id, restaurantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, imageUrl, isActive, isHidden, isCatering, sortOrder, visibility, rewardEarnExcluded, promoExcluded, rewardRedeemExcluded } = body;
  let visData: Record<string, unknown> = {};
  if (visibility !== undefined) {
    const v = buildVisibilityData(visibility);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    visData = v.data;
  }
  const cat = await prisma.menuCategory.update({
    where: { id },
    data: {
      name, description, imageUrl, isActive, isHidden, sortOrder,
      // Only assign when caller sent the field — undefined preserves
      // the existing value (matches Prisma's update semantics for the
      // other optional flags above).
      ...(isCatering !== undefined ? { isCatering: !!isCatering } : {}),
      ...(rewardEarnExcluded !== undefined ? { rewardEarnExcluded: !!rewardEarnExcluded } : {}),
      ...(promoExcluded !== undefined ? { promoExcluded: !!promoExcluded } : {}),
      ...(rewardRedeemExcluded !== undefined ? { rewardRedeemExcluded: !!rewardRedeemExcluded } : {}),
      ...visData,
    },
  });
  return NextResponse.json(cat);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;
  if (!await getOwned(id, restaurantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Delete all items in the category first (menuItemId on OrderItem is now nullable/SetNull)
    await prisma.menuItem.deleteMany({ where: { categoryId: id } });
    await prisma.menuCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[DELETE /api/menu/categories/:id]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
