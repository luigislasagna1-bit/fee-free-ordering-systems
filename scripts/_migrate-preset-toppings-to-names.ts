/** One-off: convert pizzaConfig.presetToppings LIBRARY OPTION IDS → option NAMES
 *  (the format the builder resolves). Scans every pizza item; only rewrites when
 *  an entry matches a library modifier option id of the same restaurant.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_migrate-preset-toppings-to-names.ts */
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

  const items = await prisma.menuItem.findMany({
    where: { pizzaConfig: { contains: "presetToppings" } },
    select: { id: true, name: true, restaurantId: true, pizzaConfig: true },
  });
  console.log(`${items.length} item(s) with presetToppings`);

  for (const it of items) {
    let pc: any;
    try { pc = JSON.parse(it.pizzaConfig!); } catch { continue; }
    const presets: unknown[] = Array.isArray(pc?.presetToppings) ? pc.presetToppings : [];
    if (presets.length === 0) continue;

    // Library options for THIS restaurant (id → name).
    const libGroups = await prisma.modifierGroup.findMany({
      where: { restaurantId: it.restaurantId, menuItemId: null },
      include: { options: { select: { id: true, name: true } } },
    });
    const idToName = new Map<string, string>();
    for (const g of libGroups) for (const o of g.options) idToName.set(o.id, o.name);

    const next = Array.from(new Set(presets.map((p) => (typeof p === "string" && idToName.has(p) ? idToName.get(p)! : p))));
    const changed = JSON.stringify(next) !== JSON.stringify(presets);
    console.log(`- ${it.name}: ${JSON.stringify(presets)} -> ${JSON.stringify(next)} ${changed ? "(UPDATING)" : "(no change)"}`);
    if (changed) {
      pc.presetToppings = next;
      await prisma.menuItem.update({ where: { id: it.id }, data: { pizzaConfig: JSON.stringify(pc) } });
    }
  }
  console.log("✅ done");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
