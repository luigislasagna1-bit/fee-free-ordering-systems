import prisma from "@/lib/db";

/**
 * Safely delete one or more modifier groups + their options, WITHOUT relying on
 * database-level cascade/SET-NULL rules being present (older Postgres FKs may
 * predate the schema's onDelete annotations, which is why a plain
 * `modifierGroup.delete()` was throwing "Failed to detach" once a group's
 * options had been used on a real order).
 *
 * Order of operations inside one transaction:
 *   1. NULL out any OrderItemModifier rows that point at these groups' options
 *      (preserves order history; the option name is already denormalised there).
 *   2. Delete the options.
 *   3. Delete any ATTACHED COPIES of these groups (rows whose libraryGroupId
 *      points back at one of them) + their options — so deleting a library
 *      group also cleans up its on-item/on-category chips instead of orphaning
 *      them.
 *   4. Delete the groups themselves.
 *
 * Idempotent and safe to call with ids that may include both library groups
 * and attached copies.
 */
export async function deleteModifierGroupsCascade(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.$transaction(async (tx) => {
    // Pull attached copies (one level — copies never themselves have copies).
    const copies = await tx.modifierGroup.findMany({
      where: { libraryGroupId: { in: ids } },
      select: { id: true },
    });
    const allGroupIds = Array.from(new Set([...ids, ...copies.map((c) => c.id)]));

    const opts = await tx.modifierOption.findMany({
      where: { modifierGroupId: { in: allGroupIds } },
      select: { id: true },
    });
    const optIds = opts.map((o) => o.id);

    if (optIds.length) {
      await tx.orderItemModifier.updateMany({
        where: { modifierOptionId: { in: optIds } },
        data: { modifierOptionId: null },
      });
      await tx.modifierOption.deleteMany({ where: { modifierGroupId: { in: allGroupIds } } });
    }
    await tx.modifierGroup.deleteMany({ where: { id: { in: allGroupIds } } });
  });
}
