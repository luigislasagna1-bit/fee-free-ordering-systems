/** READ-ONLY prod: SUPER PARTY SIZE attached modifier groups vs pizzaConfig. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const item: any = await prisma.menuItem.findFirst({
    where: { name: { startsWith: "SUPER PARTY SIZE" } },
    select: {
      id: true, name: true, pizzaConfig: true,
      restaurant: { select: { name: true, slug: true } },
      category: { select: { name: true, modifierGroups: { where: { menuItemId: null }, select: { id: true, name: true, libraryGroupId: true, options: { select: { priceAdjustment: true }, take: 3 } } } } },
      modifierGroups: { select: { id: true, name: true, libraryGroupId: true, isHidden: true, options: { select: { name: true, priceAdjustment: true }, take: 3 } } },
    },
  });
  const c = JSON.parse(item.pizzaConfig);
  console.log(`Item: ${item.name} @ ${item.restaurant.name} (${item.restaurant.slug}), category=${item.category?.name}`);
  console.log(`config.toppingGroupIds=${JSON.stringify(c.toppingGroupIds)} crust=${c.crustGroupId} sauce=${c.sauceGroupId} cheese=${c.cheeseGroupId}`);
  console.log(`config.sectionOrder=${JSON.stringify(c.sectionOrder ?? null)}`);
  console.log(`\nITEM-attached groups:`);
  for (const g of item.modifierGroups) {
    console.log(`  ${g.name} id=${g.id.slice(0, 9)} lib=${g.libraryGroupId ? g.libraryGroupId.slice(0, 9) : "null"} hidden=${g.isHidden} opts: ${g.options.map((o: any) => `${o.name}=$${o.priceAdjustment}`).join(", ")}`);
  }
  console.log(`\nCATEGORY-level groups (inherited):`);
  for (const g of item.category?.modifierGroups ?? []) {
    console.log(`  ${g.name} id=${g.id.slice(0, 9)} lib=${g.libraryGroupId ? g.libraryGroupId.slice(0, 9) : "null"} opts: ${g.options.map((o: any) => `$${o.priceAdjustment}`).join(", ")}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
