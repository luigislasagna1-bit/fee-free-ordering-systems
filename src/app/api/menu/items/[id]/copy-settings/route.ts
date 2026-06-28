/**
 * POST /api/menu/items/[id]/copy-settings
 *
 * Copy a SOURCE item's non-unique settings onto many TARGET items (and/or every
 * item in chosen categories). The owner picks which sections to copy:
 *   basic        → service flags (forPickup/forDelivery/isCatering/isSoldOut)
 *   visibility   → visibilityMode + visible* window
 *   availability → fulfilDays/fulfilFrom/fulfilTo (clears legacy fields)
 *   sizes        → hasVariants + the variant rows (name/price), REPLACING target's
 *   pizza        → pizzaConfig (remapped) — implies copying the modifier groups too
 *   modifiers    → clone the source's modifier groups + options onto each target
 *                  (REPLACES the target's item-level groups)
 *
 * Never copied (item-unique): name, description, price, image, category, sortOrder,
 * combo config. Restaurant-scoped throughout. Each target is applied in its own
 * transaction so one bad target can't abort the batch. Luigi 2026-06-27.
 *
 * Body: { targetItemIds?: string[], targetCategoryIds?: string[], sections: string[] }
 * Response: { ok: number, failed: number }
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const SECTIONS = ["basic", "visibility", "availability", "sizes", "pizza", "modifiers"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: sourceId } = await ctx.params;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const sections: string[] = Array.isArray(body.sections) ? body.sections.filter((s: any) => SECTIONS.includes(s)) : [];
  if (sections.length === 0) return NextResponse.json({ error: "Pick at least one section to copy" }, { status: 400 });
  // Pizza config references the pizza modifier groups, so copying pizza implies
  // copying the modifier groups (otherwise the roles would point at nothing).
  const copyModifiers = sections.includes("modifiers") || sections.includes("pizza");

  // ── Load the source (restaurant-scoped) with everything we might clone ──────
  const source = await prisma.menuItem.findFirst({
    where: { id: sourceId, restaurantId },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      category: { select: { modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!source) return NextResponse.json({ error: "Source item not found" }, { status: 404 });

  // ── Resolve targets: explicit items + every item in chosen categories ───────
  const itemIds = new Set<string>(Array.isArray(body.targetItemIds) ? body.targetItemIds : []);
  const catIds: string[] = Array.isArray(body.targetCategoryIds) ? body.targetCategoryIds : [];
  if (catIds.length) {
    const inCats = await prisma.menuItem.findMany({
      where: { restaurantId, categoryId: { in: catIds } },
      select: { id: true },
    });
    inCats.forEach((i) => itemIds.add(i.id));
  }
  itemIds.delete(sourceId); // never copy onto itself
  // Restaurant-scope the explicit ids (a tampered body could name another store's item).
  const targets = await prisma.menuItem.findMany({
    where: { id: { in: [...itemIds] }, restaurantId },
    select: { id: true, pizzaConfig: true },
  });
  if (targets.length === 0) return NextResponse.json({ error: "Pick at least one target item" }, { status: 400 });

  // The source's EFFECTIVE pizza/modifier groups = its own item-level groups PLUS
  // the category-level groups it inherits. We clone them ALL as item-level on each
  // target so the target works regardless of its category.
  const sourceGroups = [
    ...source.modifierGroups,
    ...((source.category?.modifierGroups ?? []) as any[]),
  ];

  // Remap a source pizzaConfig group-id (item-level id OR libraryGroupId) to the
  // freshly-cloned group on a target. libraryGroupId references survive as-is
  // (clones preserve it); only pure item-level ids need swapping.
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

  let ok = 0, failed = 0;

  for (const target of targets) {
    try {
      await prisma.$transaction(async (tx) => {
        const data: any = {};

        if (sections.includes("basic")) {
          data.forPickup = source.forPickup;
          data.forDelivery = source.forDelivery;
          data.isCatering = source.isCatering;
          data.isSoldOut = source.isSoldOut;
        }
        if (sections.includes("visibility")) {
          data.visibilityMode = source.visibilityMode;
          data.visibleUntil = source.visibleUntil;
          data.visibleStartDate = source.visibleStartDate;
          data.visibleEndDate = source.visibleEndDate;
          data.visibleDays = source.visibleDays;
          data.visibleFrom = source.visibleFrom;
          data.visibleTo = source.visibleTo;
          data.isHidden = source.isHidden;
        }
        if (sections.includes("availability")) {
          data.fulfilDays = source.fulfilDays;
          data.fulfilFrom = source.fulfilFrom;
          data.fulfilTo = source.fulfilTo;
          // Keep one system active — clear legacy availability fields.
          data.availableDays = null; data.availableFrom = null; data.availableTo = null; data.availabilityMode = null;
        }
        if (sections.includes("sizes")) {
          data.hasVariants = source.hasVariants;
        }

        // Modifier-group clone (also runs when "pizza" is selected).
        const idMap = new Map<string, string>();
        if (copyModifiers) {
          // Replace the target's existing item-level groups (variant-scoped + plain).
          await tx.modifierGroup.deleteMany({ where: { menuItemId: target.id } });
          for (const g of sourceGroups) {
            const ng = await tx.modifierGroup.create({
              data: {
                restaurantId,
                menuItemId: target.id,
                // Variant-scoped groups can't be remapped to the target's (different)
                // variants, so attach them at item level instead. Luigi 2026-06-27.
                variantId: null,
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
                options: { create: g.options.map((o: any) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
              },
            });
            idMap.set(g.id, ng.id);
          }
        }

        if (sections.includes("sizes")) {
          // Replace variant rows (size structure + prices). Names often match
          // across a family (Small/Med/Large); when they don't, the owner edits.
          await tx.itemVariant.deleteMany({ where: { menuItemId: target.id } });
          for (const v of source.variants) {
            await tx.itemVariant.create({ data: { menuItemId: target.id, name: v.name, price: v.price, sortOrder: v.sortOrder, isDefault: v.isDefault } });
          }
        }

        if (sections.includes("pizza")) {
          data.pizzaConfig = remapPizzaConfig(source.pizzaConfig, idMap);
        }

        if (Object.keys(data).length > 0) {
          await tx.menuItem.update({ where: { id: target.id }, data });
        }
      });
      ok++;
    } catch (e) {
      console.error(`[copy-settings] target ${target.id} failed`, e);
      failed++;
    }
  }

  return NextResponse.json({ ok, failed });
}
