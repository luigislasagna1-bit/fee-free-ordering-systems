import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";

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
 * SERVE-TIME lineage resolution for promo item/category references
 * (Fabrizio cmr80t9rk, 2026-07-05).
 *
 * remapPromotionsBetweenMenus above rewrites promos when a menu is SET LIVE —
 * but a promo created AFTERWARDS can still reference items of an inactive
 * menu (the promo picker is multi-menu by design, and Fabrizio built his
 * MENU PRANZO bundle against the original "Main Menu" a month after its copy
 * went live → every group resolved to zero items → "No eligible items for
 * this slot"). This resolver is the missing half: at SERVE time, translate
 * stale references through MenuItem.lineageId (categories by name — the same
 * rules the write-time remap uses) to the currently-ACTIVE menu's ids.
 *
 * Guarantees:
 *   - ADDITIVE ONLY: original refs are kept, live equivalents are appended —
 *     a promo that resolves today keeps resolving identically; one that
 *     didn't gains matches. No ref is ever dropped, nothing is written to
 *     the DB (pure per-request view).
 *   - FAIL-OPEN: any error returns the promos untouched.
 *   - Zero extra queries when every ref is already live (the common case
 *     costs one PK-indexed lookup on the referenced ids).
 *
 * Used by BOTH checkout routes (via buildPromoOrderContext — the preview ==
 * charge seam), the customer order page's promo payload, and the orders
 * route's bundle validation, so all surfaces agree.
 */
export async function resolvePromoMenuRefsForServing<
  T extends { ruleConfig?: unknown; rules?: string | null },
>(restaurantId: string, promos: T[]): Promise<T[]> {
  try {
    if (!promos.length) return promos;

    // Group-bearing shapes across every promo type: groups / itemGroups
    // arrays + the single eligibleGroup/paidGroup/freeGroup objects.
    const groupsOf = (rc: any): any[] => {
      const out: any[] = [];
      if (Array.isArray(rc?.groups)) out.push(...rc.groups);
      if (Array.isArray(rc?.itemGroups)) out.push(...rc.itemGroups);
      for (const k of ["eligibleGroup", "paidGroup", "freeGroup"]) {
        if (rc?.[k] && typeof rc[k] === "object") out.push(rc[k]);
      }
      return out.filter((g) => g && typeof g === "object");
    };
    const parseRc = (p: T): any | null => {
      let rc: any = (p as any).ruleConfig;
      if (typeof rc === "string") { try { rc = JSON.parse(rc); } catch { rc = null; } }
      if (!rc || typeof rc !== "object") { try { rc = JSON.parse((p as any).rules ?? "{}"); } catch { rc = null; } }
      return rc && typeof rc === "object" ? rc : null;
    };

    // 1. Collect every referenced id across the pool.
    const itemRefs = new Set<string>();
    const catRefs = new Set<string>();
    for (const p of promos) {
      const rc = parseRc(p);
      if (!rc) continue;
      for (const g of groupsOf(rc)) {
        for (const id of [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])]) itemRefs.add(String(id));
        for (const id of g.categoryIds ?? []) catRefs.add(String(id));
      }
    }
    if (itemRefs.size === 0 && catRefs.size === 0) return promos;

    // 2. Which refs point at an INACTIVE menu? (menuId null = legacy
    //    single-menu restaurant → nothing to resolve, treated as live.)
    const [refItems, refCats] = await Promise.all([
      itemRefs.size
        ? prisma.menuItem.findMany({
            where: { id: { in: [...itemRefs] } },
            select: { id: true, lineageId: true, category: { select: { menu: { select: { isActive: true } } } } },
          })
        : Promise.resolve([] as any[]),
      catRefs.size
        ? prisma.menuCategory.findMany({
            where: { id: { in: [...catRefs] } },
            select: { id: true, name: true, menu: { select: { isActive: true } } },
          })
        : Promise.resolve([] as any[]),
    ]);
    const staleItems = refItems.filter((i: any) => i.category?.menu && i.category.menu.isActive === false);
    const staleCats = refCats.filter((c: any) => c.menu && c.menu.isActive === false);
    if (staleItems.length === 0 && staleCats.length === 0) return promos;

    // 3. Find the live equivalents on the DISPLAYED menu owner (brand
    //    children display the parent's menu).
    const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
    const staleLineages = [...new Set(staleItems.map((i: any) => i.lineageId ?? i.id))] as string[];
    const staleCatNames = [...new Set(staleCats.map((c: any) => c.name.trim().toLowerCase()))] as string[];
    const [liveMatches, liveCats] = await Promise.all([
      staleLineages.length
        ? prisma.menuItem.findMany({
            where: { restaurantId: menuOwnerId, lineageId: { in: staleLineages }, category: { menu: { isActive: true } } },
            select: { id: true, lineageId: true },
          })
        : Promise.resolve([] as any[]),
      staleCatNames.length
        ? prisma.menuCategory.findMany({
            where: { restaurantId: menuOwnerId, menu: { isActive: true } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    const lineageToLive = new Map(liveMatches.map((i: any) => [i.lineageId as string, i.id as string]));
    const itemAdd = new Map<string, string>(); // stale ref id → live id
    for (const i of staleItems) {
      const live = lineageToLive.get((i.lineageId ?? i.id) as string);
      if (live && live !== i.id) itemAdd.set(i.id, live);
    }
    const nameToLiveCat = new Map(liveCats.map((c: any) => [c.name.trim().toLowerCase(), c.id as string]));
    const catAdd = new Map<string, string>();
    for (const c of staleCats) {
      const live = nameToLiveCat.get(c.name.trim().toLowerCase());
      if (live && live !== c.id) catAdd.set(c.id, live);
    }
    if (itemAdd.size === 0 && catAdd.size === 0) return promos;

    // 4. Rebuild affected promos with UNIONed refs (originals + live ids).
    const withAdds = (ids: unknown, add: Map<string, string>): string[] => {
      const arr = Array.isArray(ids) ? ids.map(String) : [];
      const out = new Set<string>(arr);
      for (const id of arr) { const live = add.get(id); if (live) out.add(live); }
      return [...out];
    };
    return promos.map((p) => {
      const rc = parseRc(p);
      if (!rc) return p;
      let touched = false;
      const clone = JSON.parse(JSON.stringify(rc));
      for (const g of groupsOf(clone)) {
        if (Array.isArray(g.itemIds) && g.itemIds.some((id: string) => itemAdd.has(String(id)))) { g.itemIds = withAdds(g.itemIds, itemAdd); touched = true; }
        if (Array.isArray(g.menuItemIds) && g.menuItemIds.some((id: string) => itemAdd.has(String(id)))) { g.menuItemIds = withAdds(g.menuItemIds, itemAdd); touched = true; }
        if (Array.isArray(g.categoryIds) && g.categoryIds.some((id: string) => catAdd.has(String(id)))) { g.categoryIds = withAdds(g.categoryIds, catAdd); touched = true; }
      }
      return touched ? ({ ...p, ruleConfig: clone } as T) : p;
    });
  } catch (e) {
    console.error("[menu] resolvePromoMenuRefsForServing failed — serving promos unresolved", e);
    return promos;
  }
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
            availabilityMode: item.availabilityMode,
            sortOrder: item.sortOrder, calories: item.calories, allergens: item.allergens, pizzaConfig: item.pizzaConfig,
            comboConfig: item.comboConfig,
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
