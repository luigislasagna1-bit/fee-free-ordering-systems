/** READ-ONLY: dump Meat Supreme's pizzaConfig.presetToppings + the option ids/names
 *  of its attached + category + library topping groups, to see why seeding fails.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_check-meat-supreme-presets.ts */
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

  const candidates = await prisma.menuItem.findMany({
    where: { name: { contains: "Meat Supreme", mode: "insensitive" }, restaurant: { slug: "luigis-lasagna-pizzeria" } },
    select: { id: true, name: true, pizzaConfig: true },
  });
  console.log("CANDIDATES:", candidates.map((c) => `${c.name} (${c.id}) pizzaConfig=${c.pizzaConfig ? "YES" : "no"}`).join(" | "));
  const target = candidates.find((c) => c.pizzaConfig && JSON.parse(c.pizzaConfig)?.isPizza) ?? candidates[0];
  const item = await prisma.menuItem.findFirst({
    where: { id: target?.id ?? "none" },
    include: {
      modifierGroups: { include: { options: true } },
      category: { include: { modifierGroups: { where: { menuItemId: null }, include: { options: true } } } },
    },
  });
  if (!item) { console.log("No Meat Supreme found"); await prisma.$disconnect(); return; }

  console.log(`ITEM: ${item.name} (${item.id})`);
  const pc = item.pizzaConfig ? JSON.parse(item.pizzaConfig) : null;
  console.log("pizzaConfig.presetToppings =", JSON.stringify(pc?.presetToppings));
  console.log("pizzaConfig.toppingGroupIds =", JSON.stringify(pc?.toppingGroupIds));
  console.log("pizzaConfig.includedToppings =", pc?.includedToppings, " reduceOnRemove =", pc?.reduceOnRemove);

  const dump = (label: string, groups: any[]) => {
    for (const g of groups) {
      console.log(`\n[${label}] group "${g.name}" id=${g.id} libraryGroupId=${g.libraryGroupId ?? "-"}`);
      for (const o of g.options) console.log(`   opt id=${o.id}  name="${o.name}"  avail=${o.isAvailable}`);
    }
  };
  dump("ITEM-ATTACHED", item.modifierGroups as any[]);
  dump("CATEGORY", (item.category as any)?.modifierGroups ?? []);

  // Library topping groups referenced by the config
  const tgi: string[] = Array.isArray(pc?.toppingGroupIds) ? pc.toppingGroupIds : [];
  if (tgi.length) {
    const libs = await prisma.modifierGroup.findMany({ where: { id: { in: tgi } }, include: { options: true } });
    dump("LIBRARY(config-ref)", libs as any[]);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
