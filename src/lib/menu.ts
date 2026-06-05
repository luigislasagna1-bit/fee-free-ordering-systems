import prisma from "@/lib/db";

/**
 * Resolve the id of a restaurant's single ACTIVE menu — the one customers see.
 * Returns null only if a restaurant somehow has no active menu (shouldn't happen
 * after the Phase 0 backfill); callers fall back to a restaurant-wide query so
 * the menu never disappears. Multi-menu manager. Luigi 2026-06-05.
 */
export async function resolveActiveMenuId(restaurantId: string): Promise<string | null> {
  const m = await prisma.menu.findFirst({
    where: { restaurantId, isActive: true },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return m?.id ?? null;
}

/**
 * Activate `menuId` for a restaurant, atomically deactivating whichever menu
 * was active. Stamps publishedAt + clears any pending schedule. Enforces the
 * "exactly one active menu" invariant. Used by manual activation and the
 * scheduled-publish cron.
 */
export async function activateMenu(restaurantId: string, menuId: string): Promise<void> {
  // Capture the menu that was live so we can re-point promotions afterward.
  const prevActive = await prisma.menu.findFirst({
    where: { restaurantId, isActive: true, id: { not: menuId } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.menu.updateMany({
      where: { restaurantId, isActive: true, id: { not: menuId } },
      data: { isActive: false },
    }),
    prisma.menu.update({
      where: { id: menuId },
      data: { isActive: true, isArchived: false, publishedAt: new Date(), scheduledActivateAt: null },
    }),
  ]);

  // Re-point item-specific promotions from the old menu's item/category ids to
  // the new menu's equivalents (matched by item lineageId / category name), so
  // a price-update menu swap doesn't silently stop those promos applying.
  if (prevActive && prevActive.id !== menuId) {
    try {
      await remapPromotionsBetweenMenus(restaurantId, prevActive.id, menuId);
    } catch (e) {
      console.error("[menu] remapPromotionsBetweenMenus failed", { restaurantId, fromMenuId: prevActive.id, toMenuId: menuId, e });
    }
  }
}

/**
 * Re-map every promotion's ruleConfig item/category references from one menu
 * version to another. Items match by `lineageId` (shared across versions);
 * categories match by name (case-insensitive). Ids already valid in the target
 * menu are kept (idempotent); ids with no equivalent are dropped from that
 * group. Returns the count of promotions changed + any unmatched references
 * (so callers can warn the owner). Best-effort, only writes when something
 * actually changed. Multi-menu Phase 4. Luigi 2026-06-05.
 */
export async function remapPromotionsBetweenMenus(
  restaurantId: string,
  fromMenuId: string,
  toMenuId: string,
): Promise<{ changed: number; unmatchedItems: number; unmatchedCategories: number }> {
  const [fromItems, toItems, fromCats, toCats, promos] = await Promise.all([
    prisma.menuItem.findMany({ where: { category: { menuId: fromMenuId } }, select: { id: true, lineageId: true } }),
    prisma.menuItem.findMany({ where: { category: { menuId: toMenuId } }, select: { id: true, lineageId: true } }),
    prisma.menuCategory.findMany({ where: { menuId: fromMenuId }, select: { id: true, name: true } }),
    prisma.menuCategory.findMany({ where: { menuId: toMenuId }, select: { id: true, name: true } }),
    prisma.promotion.findMany({ where: { restaurantId }, select: { id: true, ruleConfig: true } }),
  ]);

  const oldItemLineage = new Map(fromItems.map((i) => [i.id, i.lineageId ?? i.id]));
  const lineageToNewItem = new Map(toItems.map((i) => [i.lineageId ?? i.id, i.id]));
  const newItemIds = new Set(toItems.map((i) => i.id));
  const oldCatName = new Map(fromCats.map((c) => [c.id, c.name.trim().toLowerCase()]));
  const nameToNewCat = new Map(toCats.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const newCatIds = new Set(toCats.map((c) => c.id));

  let changed = 0, unmatchedItems = 0, unmatchedCategories = 0;

  for (const p of promos) {
    if (!p.ruleConfig || typeof p.ruleConfig !== "object") continue;
    const rc = JSON.parse(JSON.stringify(p.ruleConfig)) as any; // deep clone
    if (!Array.isArray(rc.groups)) continue;
    let mutated = false;

    for (const g of rc.groups) {
      if (Array.isArray(g.itemIds)) {
        const next: string[] = [];
        for (const id of g.itemIds) {
          if (newItemIds.has(id)) { next.push(id); continue; }          // already current
          const lin = oldItemLineage.get(id);
          const mapped = lin ? lineageToNewItem.get(lin) : undefined;
          if (mapped) next.push(mapped); else unmatchedItems++;
        }
        const deduped = [...new Set(next)];
        if (JSON.stringify(deduped) !== JSON.stringify(g.itemIds)) { g.itemIds = deduped; mutated = true; }
      }
      if (Array.isArray(g.categoryIds)) {
        const next: string[] = [];
        for (const id of g.categoryIds) {
          if (newCatIds.has(id)) { next.push(id); continue; }
          const nm = oldCatName.get(id);
          const mapped = nm ? nameToNewCat.get(nm) : undefined;
          if (mapped) next.push(mapped); else unmatchedCategories++;
        }
        const deduped = [...new Set(next)];
        if (JSON.stringify(deduped) !== JSON.stringify(g.categoryIds)) { g.categoryIds = deduped; mutated = true; }
      }
    }

    if (mutated) {
      await prisma.promotion.update({ where: { id: p.id }, data: { ruleConfig: rc } });
      changed++;
    }
  }

  return { changed, unmatchedItems, unmatchedCategories };
}

/**
 * Deep-clone an entire menu (every category, item, variant, and category-/
 * item-/variant-level modifier group) into a NEW draft menu (isActive=false).
 * Items keep their `lineageId` so promotions can be remapped across versions.
 * Mirrors the category-duplicate clone exactly. Returns the new menu id.
 */
export async function duplicateMenu(restaurantId: string, sourceMenuId: string, name: string): Promise<string> {
  const cats = await prisma.menuCategory.findMany({
    where: { menuId: sourceMenuId, restaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      // Category-level modifier groups (menuItemId null).
      modifierGroups: { where: { menuItemId: null }, include: { options: true } },
      menuItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          variants: true,
          // Item-/variant-level modifier groups (menuItemId set).
          modifierGroups: { include: { options: true } },
        },
      },
    },
  });

  return prisma.$transaction(async (tx) => {
    const sortAgg = await tx.menu.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
    const menu = await tx.menu.create({
      data: { restaurantId, name: name.slice(0, 80) || "Menu copy", isActive: false, sortOrder: (sortAgg._max.sortOrder ?? 0) + 1 },
    });

    for (const c of cats) {
      const newCat = await tx.menuCategory.create({
        data: {
          restaurantId, menuId: menu.id, name: c.name, description: c.description, imageUrl: c.imageUrl,
          isActive: c.isActive, isHidden: c.isHidden, isCatering: c.isCatering, sortOrder: c.sortOrder,
        },
      });
      // Category-level modifier groups.
      for (const g of c.modifierGroups) {
        await tx.modifierGroup.create({
          data: {
            restaurantId: g.restaurantId, categoryId: newCat.id, name: g.name, description: g.description,
            required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption,
            isHidden: g.isHidden, sortOrder: g.sortOrder, libraryGroupId: g.libraryGroupId, supportsHalfHalf: g.supportsHalfHalf,
            options: { create: g.options.map((o) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
          },
        });
      }
      // Items + variants + item/variant-level modifier groups.
      for (const item of c.menuItems) {
        const newItem = await tx.menuItem.create({
          data: {
            restaurantId, categoryId: newCat.id, lineageId: item.lineageId ?? item.id,
            name: item.name, description: item.description, price: item.price, imageUrl: item.imageUrl,
            isAvailable: item.isAvailable, isFeatured: item.isFeatured, isSoldOut: item.isSoldOut, isHidden: item.isHidden,
            hasVariants: item.hasVariants, forPickup: item.forPickup, forDelivery: item.forDelivery, isCatering: item.isCatering,
            availableDays: item.availableDays, availableFrom: item.availableFrom, availableTo: item.availableTo,
            sortOrder: item.sortOrder, calories: item.calories, allergens: item.allergens, pizzaConfig: item.pizzaConfig,
          },
        });
        const variantIdMap = new Map<string, string>();
        for (const v of item.variants) {
          const nv = await tx.itemVariant.create({ data: { menuItemId: newItem.id, name: v.name, price: v.price, sortOrder: v.sortOrder, isDefault: v.isDefault } });
          variantIdMap.set(v.id, nv.id);
        }
        for (const g of item.modifierGroups) {
          await tx.modifierGroup.create({
            data: {
              restaurantId: g.restaurantId, menuItemId: newItem.id,
              variantId: g.variantId ? variantIdMap.get(g.variantId) ?? null : null,
              name: g.name, description: g.description, required: g.required, minSelect: g.minSelect,
              maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, isHidden: g.isHidden, sortOrder: g.sortOrder,
              libraryGroupId: g.libraryGroupId, supportsHalfHalf: g.supportsHalfHalf,
              options: { create: g.options.map((o) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
            },
          });
        }
      }
    }
    return menu.id;
  }, { timeout: 30_000 });
}
