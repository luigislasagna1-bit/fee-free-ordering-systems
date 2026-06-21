/* Dev-only: delete all import-to-try sandbox restaurants (slug "try-*" or having
 * a SandboxRestaurant row) and everything under them. Run: npx tsx scripts/_clean-sandboxes.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function deleteSandbox(rid: string) {
  const [items, cats] = await Promise.all([
    prisma.menuItem.findMany({ where: { restaurantId: rid }, select: { id: true } }),
    prisma.menuCategory.findMany({ where: { restaurantId: rid }, select: { id: true } }),
  ]);
  const itemIds = items.map((i: { id: string }) => i.id);
  const catIds = cats.map((c: { id: string }) => c.id);
  const groups = await prisma.modifierGroup.findMany({
    where: { OR: [{ menuItemId: { in: itemIds } }, { categoryId: { in: catIds } }, { restaurantId: rid }] },
    select: { id: true },
  });
  const groupIds = groups.map((g: { id: string }) => g.id);
  await prisma.modifierOption.deleteMany({ where: { modifierGroupId: { in: groupIds } } });
  await prisma.modifierGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: { in: itemIds } } });
  await prisma.menuItem.deleteMany({ where: { restaurantId: rid } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId: rid } });
  await prisma.openingHours.deleteMany({ where: { restaurantId: rid } });
  await prisma.sandboxRestaurant.deleteMany({ where: { restaurantId: rid } });
  await prisma.restaurant.delete({ where: { id: rid } });
}

async function main() {
  const rows = await prisma.restaurant.findMany({
    where: { OR: [{ slug: { startsWith: "try-" } }, { sandbox: { isNot: null } }] },
    select: { id: true, slug: true },
  });
  for (const r of rows) {
    try { await deleteSandbox(r.id); console.log("deleted", r.slug); }
    catch (e) { console.error("FAILED", r.slug, String(e).slice(0, 120)); }
  }
  console.log(`cleaned ${rows.length} sandbox restaurant(s)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
