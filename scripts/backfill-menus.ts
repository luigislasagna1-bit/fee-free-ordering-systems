/**
 * Multi-menu Phase 0 backfill. Idempotent. Run on BOTH Neon branches via
 * scripts/run-on-prod.ts (prod) and directly (dev):
 *   npx tsx scripts/backfill-menus.ts                       # active (dev) branch
 *   npx tsx scripts/run-on-prod.ts scripts/backfill-menus.ts  # prod branch
 *
 * For every restaurant:
 *   1. Ensure a "Main Menu" exists and is the single active menu.
 *   2. Assign every category with menuId=null to that Main Menu.
 *   3. Backfill MenuItem.lineageId = id for items missing it.
 *
 * Safe to re-run: only touches rows that still need it.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurants = await prisma.restaurant.findMany({ select: { id: true, name: true } });
  console.log(`Restaurants: ${restaurants.length}`);

  let menusCreated = 0, catsAssigned = 0, lineageSet = 0;

  for (const r of restaurants) {
    // 1. Ensure a single active Main Menu.
    let active = await prisma.menu.findFirst({ where: { restaurantId: r.id, isActive: true } });
    if (!active) {
      // Reuse a non-archived menu named "Main Menu" if one exists, else create.
      active =
        (await prisma.menu.findFirst({ where: { restaurantId: r.id, isArchived: false }, orderBy: { createdAt: "asc" } })) ??
        (await prisma.menu.create({ data: { restaurantId: r.id, name: "Main Menu", isActive: true, publishedAt: new Date() } }));
      if (!active.isActive) {
        active = await prisma.menu.update({ where: { id: active.id }, data: { isActive: true, publishedAt: active.publishedAt ?? new Date() } });
      }
      menusCreated++;
    }

    // 2. Assign orphan categories to the active menu.
    const res = await prisma.menuCategory.updateMany({
      where: { restaurantId: r.id, menuId: null },
      data: { menuId: active.id },
    });
    catsAssigned += res.count;
  }

  // 3. Backfill lineageId = id for items missing it (single bulk pass).
  //    Prisma can't do "set col = other col" in updateMany, so page through.
  const missing = await prisma.menuItem.findMany({ where: { lineageId: null }, select: { id: true } });
  for (const it of missing) {
    await prisma.menuItem.update({ where: { id: it.id }, data: { lineageId: it.id } });
    lineageSet++;
  }

  console.log(`\n✅ Backfill complete:`);
  console.log(`   menus created/activated: ${menusCreated}`);
  console.log(`   categories assigned:     ${catsAssigned}`);
  console.log(`   lineageId set:           ${lineageSet}`);

  // Sanity: every restaurant has exactly one active menu; no orphan categories.
  const orphanCats = await prisma.menuCategory.count({ where: { menuId: null } });
  const noActive = (await prisma.restaurant.findMany({ select: { id: true } })).length -
    (await prisma.menu.groupBy({ by: ["restaurantId"], where: { isActive: true } })).length;
  console.log(`\n   orphan categories left:  ${orphanCats}  (want 0)`);
  console.log(`   restaurants w/o active:  ${noActive}  (want 0)`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
