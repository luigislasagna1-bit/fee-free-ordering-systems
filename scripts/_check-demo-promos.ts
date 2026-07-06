/* DEV-only: list demo restaurant's promotions + a few simple menu items. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("no demo restaurant");
  const promos = await prisma.promotion.findMany({
    where: { restaurantId: r.id },
    select: { id: true, name: true, promotionType: true, isActive: true, displayMode: true, showOnBanner: true, autoApply: true, customerType: true, minimumOrder: true, daysOfWeek: true, orderType: true, stackingRule: true, usableHourStart: true, usableHourEnd: true, couponCode: true },
  });
  for (const p of promos) console.log(JSON.stringify(p));
  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: r.id },
    select: { id: true, name: true, menuItems: { select: { id: true, name: true, hasVariants: true, _count: { select: { modifierGroups: true } } }, take: 4 } },
    take: 6,
  });
  for (const c of cats) {
    console.log(`CAT ${c.name} (${c.id})`);
    for (const m of c.menuItems) console.log(`   ${m.name} variants=${m.hasVariants} mods=${m._count.modifierGroups} (${m.id})`);
  }
}
main().finally(() => prisma.$disconnect());
