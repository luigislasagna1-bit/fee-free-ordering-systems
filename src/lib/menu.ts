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
}
