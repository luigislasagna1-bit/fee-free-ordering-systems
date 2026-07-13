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
import { findCoverageGaps, openIntervalsFromHours, expandMenuWindows } from "@/lib/menu-schedule";

async function ownMenu(restaurantId: string, id: string) {
  return prisma.menu.findFirst({ where: { id, restaurantId }, select: { id: true, isActive: true } });
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  // Recurring daily windows (Luigi 2026-06-12; MULTI-window Fabrizio cmrjb8voz
  // 2026-07-13). Accepts either:
  //   body.windows: [{ from, to, days? }, ...] | []  → the full list ([] clears)
  //   body.window:  { from, to, days? } | null       → legacy single (still ok)
  // availableWindows stores the full list when there's 2+; availableFrom/To/Days
  // always mirror window[0] as the legacy envelope. After applying we validate
  // the restaurant's open hours stay fully covered by SOME menu — else we reject
  // so customers never hit an open hour with no menu.
  let windowChanged = false;
  const rawWindows: unknown =
    body.windows !== undefined ? body.windows
    : body.window !== undefined ? (body.window === null ? [] : [body.window])
    : undefined;
  if (rawWindows !== undefined) {
    windowChanged = true;
    if (rawWindows === null || (Array.isArray(rawWindows) && rawWindows.length === 0)) {
      data.availableWindows = null;
      data.availableDays = null;
      data.availableFrom = null;
      data.availableTo = null;
    } else if (Array.isArray(rawWindows)) {
      const parsed: Array<{ from: string; to: string; days: number[] | null }> = [];
      for (const raw of rawWindows) {
        const w = raw as { from?: unknown; to?: unknown; days?: unknown };
        if (typeof w.from !== "string" || typeof w.to !== "string" || !HHMM_RE.test(w.from) || !HHMM_RE.test(w.to)) {
          return NextResponse.json({ error: "Each window needs a valid start and end time (HH:MM)." }, { status: 400 });
        }
        if (w.from === w.to) {
          return NextResponse.json({ error: "A window's start and end time can't be the same." }, { status: 400 });
        }
        let days: number[] | null = null;
        if (Array.isArray(w.days)) {
          days = [...new Set(w.days.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
          if (days.length === 0) return NextResponse.json({ error: "Pick at least one day for each menu window." }, { status: 400 });
          if (days.length === 7) days = null; // all days = no day restriction
        }
        parsed.push({ from: w.from, to: w.to, days });
      }
      // Store the full list only when there's more than one; a single window
      // stays in the legacy fields (no availableWindows) for back-compat.
      data.availableWindows = parsed.length > 1 ? JSON.stringify(parsed) : null;
      data.availableFrom = parsed[0].from;
      data.availableTo = parsed[0].to;
      data.availableDays = parsed[0].days ? JSON.stringify(parsed[0].days) : null;
    } else {
      return NextResponse.json({ error: "Invalid windows payload." }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Coverage guard — only when a window changed, and only when the result would
  // be an all-windowed set (a no-window default makes coverage trivially fine).
  if (windowChanged) {
    const [hours, menus] = await Promise.all([
      prisma.openingHours.findMany({
        where: { restaurantId },
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, service: true },
      }),
      prisma.menu.findMany({
        where: { restaurantId, isArchived: false },
        select: { id: true, name: true, availableDays: true, availableFrom: true, availableTo: true, availableWindows: true },
      }),
    ]);
    const windows = menus.flatMap((m) =>
      m.id === id
        ? expandMenuWindows({
            id: m.id, name: m.name,
            availableWindows: (data.availableWindows as string | null) ?? null,
            availableDays: (data.availableDays as string | null) ?? null,
            availableFrom: (data.availableFrom as string | null) ?? null,
            availableTo: (data.availableTo as string | null) ?? null,
          })
        : expandMenuWindows(m),
    );
    const gaps = findCoverageGaps(openIntervalsFromHours(hours), windows);
    if (gaps.length > 0) {
      const list = gaps.map((g) => `${g.dayLabel} ${g.from}–${g.to}`).join(", ");
      return NextResponse.json(
        {
          error: `Some open hours would have no menu: ${list}. Add a menu covering those hours, or set those hours to closed.`,
          code: "menu_coverage_gap",
          gaps,
        },
        { status: 400 },
      );
    }
  }

  await prisma.menu.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const items = catIds.length
    ? await prisma.menuItem.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } })
    : [];
  const itemIds = items.map((i) => i.id);
  const variants = itemIds.length
    ? await prisma.itemVariant.findMany({ where: { menuItemId: { in: itemIds } }, select: { id: true } })
    : [];

  // Promo delete-guard (Red-team fix 2026-07-06): the per-item / per-category
  // DELETE routes refuse when a promo targets the dish, but deleting a whole
  // (inactive) menu wiped its items/categories/variants with no guard at all —
  // even though a cross-menu promo can legitimately still reference an inactive
  // menu (the serve-time lineage resolver exists for exactly that). Refuse with
  // the promo names unless the owner forces.
  if (req.nextUrl.searchParams.get("force") !== "1") {
    const { promosReferencing } = await import("@/lib/menu");
    const promos = await promosReferencing(restaurantId, { itemIds, categoryIds: catIds, variantIds: variants.map((v) => v.id) });
    if (promos.length > 0) {
      return NextResponse.json(
        { error: "referenced_by_promos", promoNames: promos.map((p) => p.name).slice(0, 8), promoCount: promos.length },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (catIds.length) {
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
