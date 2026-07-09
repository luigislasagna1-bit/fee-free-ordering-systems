import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { logMenuChange } from "@/lib/menu-change-log";

/**
 * POST: attach a library modifier group to MANY items at once (Luigi
 * 2026-07-09 — dragging one-by-one doesn't scale). Creates the same linked
 * copy per item as the single attach route; items that already carry the
 * group (directly, or inherited from their category) are skipped so the
 * customer never sees it twice. One change-log row for the whole batch.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const blocked = await blockIfInheritingMenu(restaurantId);
    if (blocked) return blocked;

    const { libraryGroupId, menuItemIds } = await req.json();
    if (!libraryGroupId) return NextResponse.json({ error: "libraryGroupId required" }, { status: 400 });
    const ids: string[] = Array.from(new Set(
      (Array.isArray(menuItemIds) ? menuItemIds : []).filter((x: unknown): x is string => typeof x === "string"),
    )).slice(0, 500); // hard cap — nobody has 500 items to attach in one go
    if (ids.length === 0) return NextResponse.json({ error: "menuItemIds required" }, { status: 400 });

    // The source must be THIS restaurant's library group.
    const source = await prisma.modifierGroup.findFirst({
      where: { id: libraryGroupId, restaurantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) return NextResponse.json({ error: "Library group not found" }, { status: 404 });

    // Only items the caller owns (client-supplied ids are never trusted).
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ids }, restaurantId },
      select: { id: true, categoryId: true },
    });

    // Skip items that already carry the group — directly, or via their category.
    const [directAttached, categoryAttached] = await Promise.all([
      prisma.modifierGroup.findMany({
        where: { libraryGroupId, menuItemId: { in: items.map((i) => i.id) } },
        select: { menuItemId: true },
      }),
      prisma.modifierGroup.findMany({
        where: { libraryGroupId, categoryId: { in: Array.from(new Set(items.map((i) => i.categoryId))) } },
        select: { categoryId: true },
      }),
    ]);
    const hasDirect = new Set(directAttached.map((g) => g.menuItemId));
    const hasViaCategory = new Set(categoryAttached.map((g) => g.categoryId));
    const eligible = items.filter((i) => !hasDirect.has(i.id) && !hasViaCategory.has(i.categoryId));

    // Per-item sibling counts in ONE grouped query (sortOrder = append at end).
    const counts = await prisma.modifierGroup.groupBy({
      by: ["menuItemId"],
      where: { menuItemId: { in: eligible.map((i) => i.id) } },
      _count: { _all: true },
    });
    const countByItem = new Map(counts.map((c) => [c.menuItemId, c._count._all]));

    let attached = 0;
    for (const item of eligible) {
      await prisma.modifierGroup.create({
        data: {
          restaurantId: null,
          menuItemId: item.id,
          categoryId: null,
          libraryGroupId: source.id,
          name: source.name,
          description: source.description,
          required: source.required,
          minSelect: source.minSelect,
          maxSelect: source.maxSelect,
          maxPerOption: source.maxPerOption,
          isHidden: source.isHidden,
          sortOrder: countByItem.get(item.id) ?? 0,
          options: {
            create: source.options.map((opt, i) => ({
              name: opt.name,
              priceAdjustment: opt.priceAdjustment,
              isDefault: opt.isDefault,
              isAvailable: opt.isAvailable,
              sortOrder: i,
            })),
          },
        },
      });
      attached += 1;
    }

    // ONE summary row for the whole batch (never per-item) — best-effort.
    try {
      if (attached > 0) {
        await logMenuChange({
          user, restaurantId,
          entityType: "modifier_group", entityId: source.id, entityName: source.name,
          action: "update", summary: `Attached "${source.name}" to ${attached} item(s)`,
        });
      }
    } catch (logErr) { console.error("[attach-bulk log]", logErr); }

    return NextResponse.json({ attached, skipped: ids.length - attached });
  } catch (e: any) {
    console.error("[modifiers/attach-bulk POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
