/**
 * Dev-only: print category names + items for a restaurant so we can
 * verify which categoryIds the BOGO promo's `groups[].categoryIds` are
 * targeting vs. which items the customer added to their cart.
 *
 * Usage:
 *   npx tsx scripts/dev-inspect-categories.ts <restaurant-slug> [database-url]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const slug = process.argv[2];
  const url = process.argv[3] ?? process.env.DATABASE_URL;
  if (!slug || !url) { console.error("Usage: npx tsx scripts/dev-inspect-categories.ts <slug> [url]"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) { console.error("Restaurant not found"); process.exit(1); }

  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id },
    include: { menuItems: { select: { id: true, name: true, price: true, categoryId: true } } },
    orderBy: { sortOrder: "asc" },
  });

  for (const c of cats) {
    console.log(`\n[${c.id}]  ${c.name}  (${c.menuItems.length} items)`);
    for (const it of c.menuItems) {
      console.log(`   • ${it.name}  ($${it.price})  [${it.id}]`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
