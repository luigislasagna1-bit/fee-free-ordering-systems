import prisma from "@/lib/db";

/**
 * Re-sync every ATTACHED COPY of a library modifier group with the library
 * group's CURRENT options (Luigi 2026-07-04, prod bug: PIZZA CHEESE gained a
 * "Light Cheese" option and an Extra-Cheese price change in the library, but
 * the copies attached to items/categories kept the option list from the day
 * they were attached — so the customer pizza builder showed 3 options at the
 * OLD price and customers were charged from the stale rows).
 *
 * The PATCH route already propagates the group's SCALAR fields to copies;
 * this is the missing options half. Copies are not individually editable in
 * the UI (chips only reorder/detach), so a wholesale replace is always
 * correct — any divergence IS the staleness bug.
 *
 * Safe against order history: OrderItemModifier rows keep the option NAME
 * denormalised, so we null their modifierOptionId refs before deleting the
 * old rows — the exact pattern deleteModifierGroupsCascade already uses.
 */
export async function syncCopyOptionsFromLibrary(libraryGroupId: string): Promise<number> {
  const [libOptions, copies] = await Promise.all([
    prisma.modifierOption.findMany({
      where: { modifierGroupId: libraryGroupId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.modifierGroup.findMany({
      where: { libraryGroupId },
      select: { id: true },
    }),
  ]);
  if (copies.length === 0) return 0;

  const copyIds = copies.map((c) => c.id);
  await prisma.$transaction(async (tx) => {
    const oldOpts = await tx.modifierOption.findMany({
      where: { modifierGroupId: { in: copyIds } },
      select: { id: true },
    });
    if (oldOpts.length) {
      await tx.orderItemModifier.updateMany({
        where: { modifierOptionId: { in: oldOpts.map((o) => o.id) } },
        data: { modifierOptionId: null },
      });
      await tx.modifierOption.deleteMany({ where: { modifierGroupId: { in: copyIds } } });
    }
    if (libOptions.length) {
      await tx.modifierOption.createMany({
        data: copyIds.flatMap((groupId) =>
          libOptions.map((o, i) => ({
            modifierGroupId: groupId,
            name: o.name,
            priceAdjustment: o.priceAdjustment,
            isDefault: o.isDefault,
            isAvailable: o.isAvailable,
            sortOrder: i,
          })),
        ),
      });
    }
  });
  return copies.length;
}
