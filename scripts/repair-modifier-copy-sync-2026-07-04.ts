/**
 * One-time repair (Luigi 2026-07-04): re-sync every ATTACHED COPY of a library
 * modifier group with its library source — options AND scalars. Copies were
 * frozen at attach time because the PATCH route never propagated option edits
 * (PIZZA CHEESE: customers saw 3 of 4 options at an old price). The code fix
 * ships alongside; this heals the data that already drifted.
 *
 * Only touches copies that actually DIFFER from their library group. Order
 * history is preserved (OrderItemModifier refs nulled; names are denormalised
 * there — same pattern as deleteModifierGroupsCascade).
 *
 *   npx tsx scripts/repair-modifier-copy-sync-2026-07-04.ts            (dev)
 *   npx tsx scripts/run-on-prod.ts scripts/repair-modifier-copy-sync-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

type Opt = { name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean };
const optKey = (o: Opt) => `${o.name}|${o.priceAdjustment}|${o.isDefault ? 1 : 0}|${o.isAvailable ? 1 : 0}`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const libraries = await prisma.modifierGroup.findMany({
      where: { restaurantId: { not: null }, menuItemId: null, categoryId: null },
      include: {
        options: { orderBy: { sortOrder: "asc" } },
        restaurant: { select: { name: true } },
      },
    });
    let groupsFixed = 0;
    let copiesFixed = 0;
    for (const lib of libraries) {
      const copies = await prisma.modifierGroup.findMany({
        where: { libraryGroupId: lib.id },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
      if (!copies.length) continue;
      const libSig = lib.options.map(optKey).join("||");
      const stale = copies.filter((c) => {
        const optionsDiffer = c.options.map(optKey).join("||") !== libSig;
        const scalarsDiffer =
          c.required !== lib.required || c.minSelect !== lib.minSelect ||
          c.maxSelect !== lib.maxSelect || c.maxPerOption !== lib.maxPerOption ||
          c.supportsHalfHalf !== lib.supportsHalfHalf || c.pizzaRole !== lib.pizzaRole ||
          c.name !== lib.name;
        return optionsDiffer || scalarsDiffer;
      });
      if (!stale.length) continue;

      const staleIds = stale.map((c) => c.id);
      await prisma.$transaction(async (tx) => {
        await tx.modifierGroup.updateMany({
          where: { id: { in: staleIds } },
          data: {
            name: lib.name, description: lib.description, required: lib.required,
            minSelect: lib.minSelect, maxSelect: lib.maxSelect, maxPerOption: lib.maxPerOption,
            supportsHalfHalf: lib.supportsHalfHalf, pizzaRole: lib.pizzaRole,
          },
        });
        const oldOpts = await tx.modifierOption.findMany({
          where: { modifierGroupId: { in: staleIds } },
          select: { id: true },
        });
        if (oldOpts.length) {
          await tx.orderItemModifier.updateMany({
            where: { modifierOptionId: { in: oldOpts.map((o) => o.id) } },
            data: { modifierOptionId: null },
          });
          await tx.modifierOption.deleteMany({ where: { modifierGroupId: { in: staleIds } } });
        }
        if (lib.options.length) {
          await tx.modifierOption.createMany({
            data: staleIds.flatMap((gid) =>
              lib.options.map((o, i) => ({
                modifierGroupId: gid, name: o.name, priceAdjustment: o.priceAdjustment,
                isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: i,
              })),
            ),
          });
        }
      });
      groupsFixed++;
      copiesFixed += stale.length;
      console.log(`  ${lib.restaurant?.name ?? "?"} · "${lib.name}": ${stale.length}/${copies.length} cop${stale.length === 1 ? "y" : "ies"} re-synced (${lib.options.length} options)`);
    }
    console.log(`\n✅ ${copiesFixed} stale cop${copiesFixed === 1 ? "y" : "ies"} across ${groupsFixed} library group(s) re-synced`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
