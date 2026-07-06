import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { deleteModifierGroupsCascade } from "@/lib/modifier-delete";
import { syncCopyOptionsFromLibrary } from "@/lib/modifier-sync";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const group = await prisma.modifierGroup.findFirst({
    where: {
      id,
      OR: [{ restaurantId }, { menuItem: { restaurantId } }],
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;

  // Ownership (stabilization C1): PATCH previously updated the group by id with
  // NO restaurant scoping — a cross-tenant IDOR letting any admin rewrite
  // another restaurant's modifier options/prices. Mirror the DELETE handler's
  // check: a group belongs to us directly (library group) OR via an item/
  // category we own. Item-scoped groups have restaurantId=null, so the OR logic
  // is required (a naive where:{id,restaurantId} would break pizza/item groups).
  {
    const g = await prisma.modifierGroup.findUnique({ where: { id }, select: { restaurantId: true, menuItemId: true, categoryId: true } });
    if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let ok = g.restaurantId === restaurantId;
    if (!ok && g.menuItemId) ok = !!(await prisma.menuItem.findFirst({ where: { id: g.menuItemId, restaurantId }, select: { id: true } }));
    if (!ok && g.categoryId) ok = !!(await prisma.menuCategory.findFirst({ where: { id: g.categoryId, restaurantId }, select: { id: true } }));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, description, required, minSelect, maxSelect, maxPerOption, isHidden, supportsHalfHalf, pizzaRole, sortOrder, options } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (required !== undefined) updateData.required = required;
  if (minSelect !== undefined) updateData.minSelect = minSelect;
  if (maxSelect !== undefined) updateData.maxSelect = maxSelect;
  if (maxPerOption !== undefined) updateData.maxPerOption = maxPerOption;
  if (isHidden !== undefined) updateData.isHidden = isHidden;
  if (supportsHalfHalf !== undefined) updateData.supportsHalfHalf = supportsHalfHalf;
  if (pizzaRole !== undefined) updateData.pizzaRole = pizzaRole || null;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  await prisma.modifierGroup.update({ where: { id }, data: updateData });

  // If this is a library group (restaurantId set, no menuItemId/categoryId),
  // propagate structural changes to every attached copy so the customer view stays in sync.
  const current = await prisma.modifierGroup.findUnique({ where: { id }, select: { restaurantId: true, menuItemId: true, categoryId: true } });
  if (current?.restaurantId && !current.menuItemId && !current.categoryId) {
    const propagate: any = {};
    if (required !== undefined) propagate.required = required;
    if (minSelect !== undefined) propagate.minSelect = minSelect;
    if (maxSelect !== undefined) propagate.maxSelect = maxSelect;
    if (maxPerOption !== undefined) propagate.maxPerOption = maxPerOption;
    if (supportsHalfHalf !== undefined) propagate.supportsHalfHalf = supportsHalfHalf;
    if (pizzaRole !== undefined) propagate.pizzaRole = pizzaRole || null;
    if (name !== undefined) propagate.name = name;
    if (description !== undefined) propagate.description = description;
    if (Object.keys(propagate).length > 0) {
      await prisma.modifierGroup.updateMany({ where: { libraryGroupId: id }, data: propagate });
    }
  }

  // Sync options if provided
  if (Array.isArray(options)) {
    // Delete removed options (those not in new list by id)
    const keepIds = options.filter((o: any) => o.id).map((o: any) => o.id);
    await prisma.modifierOption.deleteMany({
      where: { modifierGroupId: id, id: { notIn: keepIds } },
    });
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (opt.id) {
        await prisma.modifierOption.update({
          where: { id: opt.id },
          data: { name: opt.name, priceAdjustment: parseFloat(opt.priceAdjustment ?? 0), isDefault: opt.isDefault ?? false, isAvailable: opt.isAvailable ?? true, sortOrder: i },
        });
      } else {
        await prisma.modifierOption.create({
          data: { modifierGroupId: id, name: opt.name, priceAdjustment: parseFloat(opt.priceAdjustment ?? 0), isDefault: opt.isDefault ?? false, isAvailable: opt.isAvailable ?? true, sortOrder: i },
        });
      }
    }
    // Library group → push the fresh option list to every attached copy.
    // The scalar fields already propagate above; without this half, copies
    // kept the options from the day they were attached — customers saw stale
    // choices and were charged OLD prices (Luigi 2026-07-04, PIZZA CHEESE).
    if (current?.restaurantId && !current.menuItemId && !current.categoryId) {
      const synced = await syncCopyOptionsFromLibrary(id);
      if (synced > 0) console.log(`[modifiers PATCH] options re-synced to ${synced} attached cop${synced === 1 ? "y" : "ies"} of ${id}`);
    }
  }

  const updated = await prisma.modifierGroup.findUnique({
    where: { id },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;
  const { id } = await params;

  // Ownership: only delete a group that belongs to this restaurant — either a
  // restaurant-level library group, or one scoped to an item/category we own.
  const group = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let authorized = group.restaurantId === restaurantId;
  if (!authorized && group.menuItemId) {
    authorized = !!(await prisma.menuItem.findFirst({ where: { id: group.menuItemId, restaurantId }, select: { id: true } }));
  }
  if (!authorized && group.categoryId) {
    authorized = !!(await prisma.menuCategory.findFirst({ where: { id: group.categoryId, restaurantId }, select: { id: true } }));
  }
  if (!authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Cascade-safe: nulls OrderItemModifier refs + removes attached copies so a
    // group that's been used on a real order can still be deleted.
    await deleteModifierGroupsCascade([id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[modifiers/:id DELETE]", e);
    return NextResponse.json({ error: e.message ?? "Delete failed" }, { status: 500 });
  }
}
