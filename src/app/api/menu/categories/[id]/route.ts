import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

async function getOwned(id: string, restaurantId: string) {
  return prisma.menuCategory.findFirst({ where: { id, restaurantId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!await getOwned(id, restaurantId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, imageUrl, isActive, isHidden, sortOrder } = body;
  const cat = await prisma.menuCategory.update({
    where: { id },
    data: { name, description, imageUrl, isActive, isHidden, sortOrder },
  });
  return NextResponse.json(cat);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
