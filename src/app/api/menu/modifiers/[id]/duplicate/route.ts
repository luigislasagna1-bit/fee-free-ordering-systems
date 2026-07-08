import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { blockIfInheritingMenu } from "@/lib/brand";

/**
 * Duplicate a modifier group — deep-clones the group + all its options,
 * preserving its scope (library / item / category / variant). Named "… (copy)",
 * landed at the end of its scope. Luigi 2026-07-07.
 *
 * Ownership is scope-aware (mirrors the DELETE handler): item/variant/category-
 * scoped groups have restaurantId=null, so we verify via the parent we own.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;

  const group = await prisma.modifierGroup.findUnique({
    where: { id },
    include: { options: true },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership: a library group (restaurantId set) we own directly; an
  // item/category-scoped group is ours iff we own its parent.
  let authorized = group.restaurantId === restaurantId;
  if (!authorized && group.menuItemId) {
    authorized = !!(await prisma.menuItem.findFirst({ where: { id: group.menuItemId, restaurantId }, select: { id: true } }));
  }
  if (!authorized && group.categoryId) {
    authorized = !!(await prisma.menuCategory.findFirst({ where: { id: group.categoryId, restaurantId }, select: { id: true } }));
  }
  if (!authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Land the copy at the end of its own scope.
  const maxSort = await prisma.modifierGroup.aggregate({
    where: {
      restaurantId: group.restaurantId,
      menuItemId: group.menuItemId,
      categoryId: group.categoryId,
      variantId: group.variantId,
    },
    _max: { sortOrder: true },
  });

  const copy = await prisma.modifierGroup.create({
    data: {
      restaurantId: group.restaurantId,
      menuItemId: group.menuItemId,
      categoryId: group.categoryId,
      variantId: group.variantId,
      name: `${group.name} (copy)`,
      description: group.description,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      maxPerOption: group.maxPerOption,
      isHidden: group.isHidden,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      libraryGroupId: group.libraryGroupId,
      supportsHalfHalf: group.supportsHalfHalf,
      pizzaRole: group.pizzaRole,
      options: {
        create: group.options.map((o) => ({
          name: o.name,
          priceAdjustment: o.priceAdjustment,
          isDefault: o.isDefault,
          isAvailable: o.isAvailable,
          sortOrder: o.sortOrder,
        })),
      },
    },
  });

  return NextResponse.json({ success: true, groupId: copy.id });
}
