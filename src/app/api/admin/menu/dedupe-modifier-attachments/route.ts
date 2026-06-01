/**
 * POST /api/admin/menu/dedupe-modifier-attachments
 *
 * One-shot repair endpoint. Finds every menu item whose parent
 * category has a modifier-group attachment with the same
 * `libraryGroupId` as one of the item's own attachments, and deletes
 * the item-level duplicate. The category attachment becomes the
 * single source of truth and the customer no longer sees the same
 * modifier group twice.
 *
 * Why it exists: before today's attach-endpoint fix (2026-06-01),
 * attaching a library group to a category did NOT delete pre-existing
 * item-level attachments. Owners ended up with mixed blue/green chips
 * (blue = item-level, green = inherited) which presented the same
 * modifier group twice to the customer. New attachments are now
 * cleaned up inline; this endpoint repairs the legacy state.
 *
 * Auth: restaurant_admin (scoped to their own restaurant) OR superadmin
 * (operates on every restaurant). Idempotent — re-running with no
 * duplicates is a no-op.
 *
 * Response: { cleaned: number, restaurantsTouched: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function POST(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope the cleanup. Restaurant admins repair only their own data;
  // superadmins can repair everything (useful for the one-time global
  // migration after we ship the fix).
  const restaurantFilter = user.role === "superadmin"
    ? {}
    : user.restaurantId
      ? { id: user.restaurantId }
      : null;
  if (!restaurantFilter) {
    return NextResponse.json({ error: "No restaurant scope" }, { status: 403 });
  }

  // For each restaurant, find item-level modifier groups whose
  // libraryGroupId also appears on the item's parent category.
  // Those item-level rows are the duplicates we want to drop.
  const restaurants = await prisma.restaurant.findMany({
    where: restaurantFilter,
    select: { id: true },
  });

  let totalCleaned = 0;
  let restaurantsTouched = 0;

  for (const r of restaurants) {
    // All category-level attachments for this restaurant, keyed by
    // categoryId + libraryGroupId so we can probe in O(1) below.
    const catAttachments = await prisma.modifierGroup.findMany({
      where: {
        category: { restaurantId: r.id },
        libraryGroupId: { not: null },
      },
      select: { categoryId: true, libraryGroupId: true },
    });
    if (catAttachments.length === 0) continue;
    const probe = new Set<string>(
      catAttachments.map((c) => `${c.categoryId}::${c.libraryGroupId}`),
    );

    // Item-level attachments whose item belongs to a category we
    // know also attaches the same library group.
    const itemAttachments = await prisma.modifierGroup.findMany({
      where: {
        menuItem: { restaurantId: r.id },
        libraryGroupId: { not: null },
      },
      select: {
        id: true,
        libraryGroupId: true,
        menuItem: { select: { categoryId: true } },
      },
    });
    const duplicateIds: string[] = [];
    for (const ia of itemAttachments) {
      const cat = ia.menuItem?.categoryId;
      if (!cat || !ia.libraryGroupId) continue;
      if (probe.has(`${cat}::${ia.libraryGroupId}`)) {
        duplicateIds.push(ia.id);
      }
    }
    if (duplicateIds.length > 0) {
      await prisma.modifierGroup.deleteMany({
        where: { id: { in: duplicateIds } },
      });
      totalCleaned += duplicateIds.length;
      restaurantsTouched += 1;
    }

    // ── Stale pizzaConfig cleanup ─────────────────────────────────
    // After deleting duplicates AND in general, any MenuItem.pizzaConfig
    // role assignments (crustGroupId / sauceGroupId / cheeseGroupId /
    // toppingGroupIds) that point at modifier groups no longer
    // attached to the item (or its parent category) leak into the
    // Pizza Builder's display order as "(Unknown section)" rows or,
    // worse, as resolvable-but-detached library names (the
    // "Choose Sauce" ghost Luigi flagged 2026-06-01).
    //
    // Pass: for every pizza item in this restaurant, recompute the
    // set of "live" library ids (attached at item or category level)
    // and strip any role assignment that doesn't match. Also strip
    // sectionOrder entries pointing at non-live ids.
    const pizzaItems = await prisma.menuItem.findMany({
      where: { restaurantId: r.id, pizzaConfig: { not: null } },
      include: {
        modifierGroups: { select: { libraryGroupId: true, id: true } },
        category: {
          select: {
            modifierGroups: { select: { libraryGroupId: true, id: true } },
          },
        },
      },
    });
    for (const it of pizzaItems) {
      // pizzaConfig is stored as a JSON-encoded string on this schema
      // (see prisma/schema.prisma — `pizzaConfig String?`). Parse it
      // back so we can mutate fields and re-stringify on write.
      let cfg: any = null;
      try { cfg = it.pizzaConfig ? JSON.parse(it.pizzaConfig) : null; } catch { cfg = null; }
      if (!cfg || typeof cfg !== "object") continue;
      const live = new Set<string>();
      for (const g of it.modifierGroups) {
        live.add(g.libraryGroupId ?? g.id);
        if (g.libraryGroupId) live.add(g.id);
      }
      for (const g of it.category?.modifierGroups ?? []) {
        live.add(g.libraryGroupId ?? g.id);
        if (g.libraryGroupId) live.add(g.id);
      }
      let dirty = false;
      const next = { ...cfg };
      const strip = (key: string) => {
        if (next[key] && !live.has(next[key])) {
          next[key] = null;
          dirty = true;
        }
      };
      strip("crustGroupId");
      strip("sauceGroupId");
      strip("cheeseGroupId");
      if (Array.isArray(next.toppingGroupIds)) {
        const filtered = next.toppingGroupIds.filter((id: string) => live.has(id));
        if (filtered.length !== next.toppingGroupIds.length) {
          next.toppingGroupIds = filtered;
          dirty = true;
        }
      }
      if (Array.isArray(next.sectionOrder)) {
        // Sentinel section ids — these aren't modifier-group ids,
        // they're hardcoded marker strings the Pizza Builder renders
        // for the variant size picker / half-half toggle / topping
        // section. Must match the constants in MenuClient.tsx.
        const SENTINEL = new Set(["section:size", "section:halfHalfToggle", "section:toppings"]);
        const filtered = next.sectionOrder.filter(
          (id: string) => SENTINEL.has(id) || live.has(id),
        );
        if (filtered.length !== next.sectionOrder.length) {
          next.sectionOrder = filtered;
          dirty = true;
        }
      }
      if (dirty) {
        await prisma.menuItem.update({
          where: { id: it.id },
          data: { pizzaConfig: JSON.stringify(next) },
        });
        totalCleaned += 1;
      }
    }
  }

  return NextResponse.json({ cleaned: totalCleaned, restaurantsTouched });
}
