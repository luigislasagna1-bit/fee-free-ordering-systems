/**
 * READ-ONLY diagnostic: dump every Menu (incl. archived/inactive) for a
 * restaurant, with per-menu category + item counts, so we can tell whether a
 * menu was deleted vs merely hidden from the switcher.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/diag-menus.ts "Luigi"
 *
 * The arg is a case-insensitive substring of the restaurant name.
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

  const needle = process.argv[2] ?? "Luigi";
  const restaurants = await prisma.restaurant.findMany({
    where: { name: { contains: needle, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (restaurants.length === 0) {
    console.log(`No restaurant matching "${needle}".`);
    await prisma.$disconnect();
    return;
  }

  for (const r of restaurants) {
    console.log(`\n=== ${r.name}  (slug=${r.slug}, id=${r.id}) ===`);
    const menus = await prisma.menu.findMany({
      where: { restaurantId: r.id },
      orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        isArchived: true,
        scheduledActivateAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(`  ${menus.length} menu row(s):`);
    for (const m of menus) {
      const catCount = await prisma.menuCategory.count({ where: { menuId: m.id } });
      const itemCount = await prisma.menuItem.count({ where: { category: { menuId: m.id } } });
      console.log(
        `   • "${m.name}"  id=${m.id}\n` +
          `       active=${m.isActive} archived=${m.isArchived} ` +
          `categories=${catCount} items=${itemCount}\n` +
          `       created=${m.createdAt.toISOString()} updated=${m.updatedAt.toISOString()}` +
          (m.scheduledActivateAt ? `\n       scheduledActivateAt=${m.scheduledActivateAt.toISOString()}` : "") +
          (m.publishedAt ? `\n       publishedAt=${m.publishedAt.toISOString()}` : ""),
      );
    }

    // Orphan categories — menuId NULL (pre-migration) or pointing at a menu
    // that no longer exists. These would vanish from every menu view.
    const orphanNull = await prisma.menuCategory.count({
      where: { restaurantId: r.id, menuId: null },
    });
    if (orphanNull > 0) {
      const orphanItems = await prisma.menuItem.count({
        where: { category: { restaurantId: r.id, menuId: null } },
      });
      console.log(`  ⚠ ${orphanNull} category(ies) with menuId=NULL (orphaned), holding ${orphanItems} item(s).`);
    }

    // Total categories/items for the restaurant regardless of menu linkage.
    const totalCats = await prisma.menuCategory.count({ where: { restaurantId: r.id } });
    const totalItems = await prisma.menuItem.count({ where: { restaurantId: r.id } });
    console.log(`  TOTAL across restaurant: ${totalCats} categories, ${totalItems} items.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
