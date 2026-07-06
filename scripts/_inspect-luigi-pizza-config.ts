/** READ-ONLY prod inspection: dump pizzaConfig pricing fields for Luigi's
 *  Lasagna pizzas to explain why $10/topping isn't charging.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_inspect-luigi-pizza-config.ts */
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
  const rests = await prisma.restaurant.findMany({
    where: { OR: [{ name: { contains: "Lasagna", mode: "insensitive" } }, { name: { contains: "Luigi", mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });
  console.log(`Restaurants: ${rests.map((r) => `${r.name}(${r.slug})`).join(" | ")}`);
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: { in: rests.map((r) => r.id) }, pizzaConfig: { not: null } },
    select: { id: true, name: true, restaurantId: true, pizzaConfig: true, variants: { select: { name: true, price: true } } },
  });
  console.log(`Pizza-config items found: ${items.length}`);
  for (const it of items) {
    let c: any = {};
    try { c = JSON.parse(it.pizzaConfig as string); } catch { /* */ }
    console.log(`\n── ${it.name} (${it.id.slice(0, 9)}) variants=[${it.variants.map((v: any) => v.name).join(", ")}]`);
    console.log(`   includedToppings=${c.includedToppings} extraToppingPrice=${c.extraToppingPrice} halfMult=${c.halfToppingMultiplier} extraQtyMult=${c.extraQuantityMultiplier}`);
    console.log(`   variantToppingPrices=${JSON.stringify(c.variantToppingPrices ?? null)}`);
    console.log(`   toppingGroupIds=${JSON.stringify(c.toppingGroupIds ?? [])}`);
  }
  // Names + sample option prices of the groups referenced as topping groups.
  const allGroupIds = [...new Set(items.flatMap((it) => { try { return JSON.parse(it.pizzaConfig as string)?.toppingGroupIds ?? []; } catch { return []; } }))];
  if (allGroupIds.length) {
    const groups = await prisma.modifierGroup.findMany({
      where: { id: { in: allGroupIds as string[] } },
      select: { id: true, name: true, options: { select: { name: true, priceAdjustment: true }, take: 5 } },
    });
    console.log(`\nTopping groups:`);
    for (const g of groups) console.log(`   ${g.name} (${g.id.slice(0, 9)}): ${g.options.map((o: any) => `${o.name}=$${o.priceAdjustment}`).join(", ")}…`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
