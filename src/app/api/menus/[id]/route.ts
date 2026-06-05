/**
 * /api/menus/[id]
 *   PATCH  — rename / archive / unarchive / set-or-clear scheduledActivateAt.
 *   DELETE — delete a NON-active menu (and its categories/items). Order history
 *            survives (OrderItem.menuItemId → null, name/price snapshot kept).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";

async function ownMenu(restaurantId: string, id: string) {
  return prisma.menu.findFirst({ where: { id, restaurantId }, select: { id: true, isActive: true } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;
  const menu = await ownMenu(restaurantId, id);
  if (!menu) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.isArchived === "boolean") {
    if (body.isArchived && menu.isActive) {
      return NextResponse.json({ error: "Can't archive the active menu — activate another first." }, { status: 400 });
    }
    data.isArchived = body.isArchived;
  }
  // scheduledActivateAt: ISO string to set, null to clear. Must be in the future.
  if (body.scheduledActivateAt !== undefined) {
    if (body.scheduledActivateAt === null) {
      data.scheduledActivateAt = null;
    } else {
      const d = new Date(body.scheduledActivateAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      if (d.getTime() <= Date.now()) return NextResponse.json({ error: "Pick a future date/time" }, { status: 400 });
      data.scheduledActivateAt = d;
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await prisma.menu.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;
  const menu = await ownMenu(restaurantId, id);
  if (!menu) return NextResponse.json({ error: "Menu not found" }, { status: 404 });
  if (menu.isActive) return NextResponse.json({ error: "Can't delete the active menu." }, { status: 400 });

  // Delete the menu's categories + their items/variants/modifiers. Order rows
  // keep their snapshot (OrderItem.menuItemId is SetNull). Delete in FK order.
  const cats = await prisma.menuCategory.findMany({ where: { menuId: id }, select: { id: true } });
  const catIds = cats.map((c) => c.id);
  await prisma.$transaction(async (tx) => {
    if (catIds.length) {
      const items = await tx.menuItem.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } });
      const itemIds = items.map((i) => i.id);
      // Modifier groups (category-, item-, variant-level) → cascade their options.
      await tx.modifierGroup.deleteMany({ where: { OR: [{ categoryId: { in: catIds } }, { menuItemId: { in: itemIds } }] } });
      await tx.itemVariant.deleteMany({ where: { menuItemId: { in: itemIds } } });
      await tx.menuItem.deleteMany({ where: { id: { in: itemIds } } });
      await tx.menuCategory.deleteMany({ where: { id: { in: catIds } } });
    }
    await tx.menu.delete({ where: { id } });
  }, { timeout: 30_000 });

  return NextResponse.json({ ok: true });
}
