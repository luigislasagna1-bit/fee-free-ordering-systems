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
import { findCoverageGaps, openIntervalsFromHours, toMenuWindow } from "@/lib/menu-schedule";

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

  // Recurring daily window (Luigi 2026-06-12). body.window:
  //   null                          → clear (this menu becomes the all-hours default)
  //   { from, to, days? }           → set; from/to are "HH:MM" (from !== to), days
  //                                    an optional [0..6] subset (omitted = every day)
  // After applying the change we validate that the restaurant's open hours stay
  // fully covered by SOME active menu — else we reject so customers never hit an
  // open hour with no menu.
  let windowChanged = false;
  if (body.window !== undefined) {
    windowChanged = true;
    if (body.window === null) {
      data.availableDays = null;
      data.availableFrom = null;
      data.availableTo = null;
    } else {
      const w = body.window as { from?: unknown; to?: unknown; days?: unknown };
      if (typeof w.from !== "string" || typeof w.to !== "string" || !HHMM_RE.test(w.from) || !HHMM_RE.test(w.to)) {
        return NextResponse.json({ error: "Window needs a valid start and end time (HH:MM)." }, { status: 400 });
      }
      if (w.from === w.to) {
        return NextResponse.json({ error: "Start and end time can't be the same." }, { status: 400 });
      }
      let days: number[] | null = null;
      if (Array.isArray(w.days)) {
        days = [...new Set(w.days.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))].sort();
        if (days.length === 0) return NextResponse.json({ error: "Pick at least one day for the menu window." }, { status: 400 });
        if (days.length === 7) days = null; // all days = no day restriction
      }
      data.availableFrom = w.from;
      data.availableTo = w.to;
      data.availableDays = days ? JSON.stringify(days) : null;
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
        select: { id: true, name: true, availableDays: true, availableFrom: true, availableTo: true },
      }),
    ]);
    const windows = menus.map((m) =>
      m.id === id
        ? toMenuWindow({
            id: m.id, name: m.name,
            availableDays: (data.availableDays as string | null) ?? null,
            availableFrom: (data.availableFrom as string | null) ?? null,
            availableTo: (data.availableTo as string | null) ?? null,
          })
        : toMenuWindow(m),
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  await prisma.$transaction(async (tx) => {
    if (catIds.length) {
      const items = await tx.menuItem.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } });
      const itemIds = items.map((i) => i.id);
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
