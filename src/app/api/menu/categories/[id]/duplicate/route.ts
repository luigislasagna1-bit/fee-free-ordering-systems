import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

/**
 * Duplicate a whole category — deep-clones the category, all its items
 * (scalars + availability windows + pizzaConfig), each item's variants,
 * and every modifier group (item-level + category-level) with its options.
 * (Report cmpxdzr9y — "option to duplicate the menu".)
 *
 * The copy is created HIDDEN (isHidden=true) so it never appears on the
 * customer page until the owner reviews + unhides it — this is the safe
 * "make changes, publish later" workflow without any destructive menu swap
 * (order history is untouched; nothing is deleted).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const restaurantId = user.restaurantId;

  const source = await prisma.menuCategory.findFirst({
    where: { id, restaurantId },
    include: {
      menuItems: { include: { variants: true } },
      // category-level shared modifier groups
      modifierGroups: { include: { options: true } },
    },
  });
  if (!source) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  // Item-level modifier groups for every item in this category, with options.
  const itemIds = source.menuItems.map((i) => i.id);
  const itemGroups = itemIds.length
    ? await prisma.modifierGroup.findMany({
        where: { menuItemId: { in: itemIds } },
        include: { options: true },
      })
    : [];
  const itemGroupsByItem = new Map<string, typeof itemGroups>();
  for (const g of itemGroups) {
    const arr = itemGroupsByItem.get(g.menuItemId!) ?? [];
    arr.push(g);
    itemGroupsByItem.set(g.menuItemId!, arr);
  }

  // Next sortOrder so the copy lands at the end.
  const maxSort = await prisma.menuCategory.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });

  const newCategory = await prisma.$transaction(async (tx) => {
    const cat = await tx.menuCategory.create({
      data: {
        restaurantId,
        // Keep the copy in the SAME menu version as the source.
        menuId: (source as any).menuId ?? undefined,
        name: `${source.name} (copy)`,
        description: source.description,
        imageUrl: source.imageUrl,
        isActive: source.isActive,
        isHidden: true, // hidden until the owner reviews + publishes
        isCatering: source.isCatering,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    // Category-level modifier groups.
    for (const g of source.modifierGroups) {
      await tx.modifierGroup.create({
        data: {
          restaurantId: g.restaurantId,
          categoryId: cat.id,
          name: g.name,
          description: g.description,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          maxPerOption: g.maxPerOption,
          isHidden: g.isHidden,
          sortOrder: g.sortOrder,
          libraryGroupId: g.libraryGroupId,
          supportsHalfHalf: g.supportsHalfHalf,
          options: {
            create: g.options.map((o) => ({
              name: o.name,
              priceAdjustment: o.priceAdjustment,
              isDefault: o.isDefault,
              isAvailable: o.isAvailable,
              sortOrder: o.sortOrder,
            })),
          },
        },
      });
    }

    // Items + their variants + item-level modifier groups.
    for (const item of source.menuItems) {
      const newItem = await tx.menuItem.create({
        data: {
          restaurantId,
          categoryId: cat.id,
          // Preserve lineage so promotions referencing this item can be
          // remapped across menu versions (Phase 4).
          lineageId: (item as any).lineageId ?? item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl,
          isAvailable: item.isAvailable,
          isFeatured: item.isFeatured,
          isSoldOut: item.isSoldOut,
          isHidden: item.isHidden,
          hasVariants: item.hasVariants,
          forPickup: item.forPickup,
          forDelivery: item.forDelivery,
          isCatering: item.isCatering,
          availableDays: item.availableDays,
          availableFrom: item.availableFrom,
          availableTo: item.availableTo,
          sortOrder: item.sortOrder,
          calories: item.calories,
          allergens: item.allergens,
          pizzaConfig: item.pizzaConfig,
        },
      });

      // Variants — keep an old→new id map so variant-scoped modifier
      // groups can be re-pointed at the cloned variant.
      const variantIdMap = new Map<string, string>();
      for (const v of item.variants) {
        const nv = await tx.itemVariant.create({
          data: {
            menuItemId: newItem.id,
            name: v.name,
            price: v.price,
            sortOrder: v.sortOrder,
            isDefault: v.isDefault,
          },
        });
        variantIdMap.set(v.id, nv.id);
      }

      for (const g of itemGroupsByItem.get(item.id) ?? []) {
        await tx.modifierGroup.create({
          data: {
            restaurantId: g.restaurantId,
            menuItemId: newItem.id,
            variantId: g.variantId ? variantIdMap.get(g.variantId) ?? null : null,
            name: g.name,
            description: g.description,
            required: g.required,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            maxPerOption: g.maxPerOption,
            isHidden: g.isHidden,
            sortOrder: g.sortOrder,
            libraryGroupId: g.libraryGroupId,
            supportsHalfHalf: g.supportsHalfHalf,
            options: {
              create: g.options.map((o) => ({
                name: o.name,
                priceAdjustment: o.priceAdjustment,
                isDefault: o.isDefault,
                isAvailable: o.isAvailable,
                sortOrder: o.sortOrder,
              })),
            },
          },
        });
      }
    }

    return cat;
  });

  return NextResponse.json({ success: true, categoryId: newCategory.id });
}
