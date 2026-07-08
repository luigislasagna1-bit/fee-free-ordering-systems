import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { blockIfInheritingMenu } from "@/lib/brand";

/**
 * Duplicate a single menu item — deep-clones its scalars (incl. visibility +
 * fulfilment windows, catering, reward/promo flags, pizzaConfig, comboConfig),
 * its size variants, and its item-level modifier groups (with options), remapping
 * variant-scoped groups + any pizzaConfig group ids old→new. Luigi 2026-07-07.
 *
 * The copy is created HIDDEN so a duplicate never shows on the customer menu
 * until the owner reviews + unhides it — the same safe "edit then publish"
 * workflow as the category-duplicate route.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const { id } = await params;

  const source = await prisma.menuItem.findFirst({
    where: { id, restaurantId },
    include: {
      variants: true,
      modifierGroups: { include: { options: true } },
    },
  });
  if (!source) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Land the copy at the end of its category.
  const maxSort = await prisma.menuItem.aggregate({
    where: { restaurantId, categoryId: source.categoryId },
    _max: { sortOrder: true },
  });

  // Remap a pizzaConfig group-id (item-level id → freshly-cloned id). Library
  // group ids are preserved on the clone, so only item-level ids need swapping.
  const remapPizzaConfig = (rawCfg: string | null, idMap: Map<string, string>): string | null => {
    if (!rawCfg) return null;
    let cfg: any;
    try { cfg = JSON.parse(rawCfg); } catch { return rawCfg; }
    const swap = (v: any) => (typeof v === "string" && idMap.has(v) ? idMap.get(v)! : v);
    if (cfg.crustGroupId) cfg.crustGroupId = swap(cfg.crustGroupId);
    if (cfg.sauceGroupId) cfg.sauceGroupId = swap(cfg.sauceGroupId);
    if (cfg.cheeseGroupId) cfg.cheeseGroupId = swap(cfg.cheeseGroupId);
    if (Array.isArray(cfg.toppingGroupIds)) cfg.toppingGroupIds = cfg.toppingGroupIds.map(swap);
    if (Array.isArray(cfg.sectionOrder)) cfg.sectionOrder = cfg.sectionOrder.map(swap);
    return JSON.stringify(cfg);
  };

  const newItem = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        restaurantId,
        categoryId: source.categoryId,
        lineageId: source.lineageId ?? source.id,
        name: `${source.name} (copy)`,
        description: source.description,
        price: source.price,
        imageUrl: source.imageUrl,
        isAvailable: source.isAvailable,
        isFeatured: source.isFeatured,
        pinnedToTop: source.pinnedToTop,
        isSoldOut: source.isSoldOut,
        // Hidden until the owner reviews + publishes the copy.
        isHidden: true,
        visibilityMode: source.visibilityMode,
        visibleUntil: source.visibleUntil,
        visibleStartDate: source.visibleStartDate,
        visibleEndDate: source.visibleEndDate,
        visibleDays: source.visibleDays,
        visibleFrom: source.visibleFrom,
        visibleTo: source.visibleTo,
        visibleWindows: source.visibleWindows ?? undefined,
        hasVariants: source.hasVariants,
        forPickup: source.forPickup,
        forDelivery: source.forDelivery,
        isCatering: source.isCatering,
        availableDays: source.availableDays,
        availableFrom: source.availableFrom,
        availableTo: source.availableTo,
        availabilityMode: source.availabilityMode,
        fulfilDays: source.fulfilDays,
        fulfilFrom: source.fulfilFrom,
        fulfilTo: source.fulfilTo,
        fulfilWindows: source.fulfilWindows ?? undefined,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        calories: source.calories,
        allergens: source.allergens,
        rewardEarnExcluded: source.rewardEarnExcluded,
        promoExcluded: source.promoExcluded,
        rewardRedeemExcluded: source.rewardRedeemExcluded,
        // Carry the refundable deposit onto the copy (a duplicated keg keeps
        // its $50 deposit). Luigi 2026-07-08.
        isRefundableDeposit: source.isRefundableDeposit,
        depositAmount: source.depositAmount,
        // pizzaConfig is remapped AFTER the groups clone (needs their new ids).
        pizzaConfig: source.pizzaConfig,
        comboConfig: source.comboConfig,
      },
    });

    // Variants — old→new id map so variant-scoped groups re-point correctly.
    const variantIdMap = new Map<string, string>();
    for (const v of source.variants) {
      const nv = await tx.itemVariant.create({
        data: {
          menuItemId: item.id,
          name: v.name,
          price: v.price,
          sortOrder: v.sortOrder,
          isDefault: v.isDefault,
        },
      });
      variantIdMap.set(v.id, nv.id);
    }

    // Item-level modifier groups — old→new id map for the pizzaConfig remap.
    const groupIdMap = new Map<string, string>();
    for (const g of source.modifierGroups) {
      const ng = await tx.modifierGroup.create({
        data: {
          restaurantId: g.restaurantId,
          menuItemId: item.id,
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
          pizzaRole: g.pizzaRole,
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
      groupIdMap.set(g.id, ng.id);
    }

    // Now the cloned pizza groups exist, remap the item's pizzaConfig ids.
    if (source.pizzaConfig && groupIdMap.size > 0) {
      const remapped = remapPizzaConfig(source.pizzaConfig, groupIdMap);
      if (remapped !== source.pizzaConfig) {
        await tx.menuItem.update({ where: { id: item.id }, data: { pizzaConfig: remapped } });
      }
    }

    return item;
  });

  return NextResponse.json({ success: true, itemId: newItem.id });
}
