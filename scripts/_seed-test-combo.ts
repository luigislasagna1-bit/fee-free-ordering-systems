/** DEV-ONLY: ensure demo-pizza-palace has a GloriaFood-style test combo:
 *  2 pizzas + a "Choose 4 Pop" slot (min 4 / max 4) — Luigi's exact complaint
 *  case — with a shared-toppings pool ready to toggle (cmsajnvkm-adjacent
 *  combo work, 2026-08-02).
 *    npx tsx scripts/_seed-test-combo.ts [--pool N]
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const poolArg = process.argv.indexOf("--pool");
const poolN = poolArg > -1 ? Math.max(0, parseInt(process.argv[poolArg + 1], 10) || 0) : 0;

async function main() {
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) { console.error("seed demo-pizza-palace first"); process.exit(1); }

  const menu = await prisma.menu.findFirst({ where: { restaurantId: r.id, isActive: true }, select: { id: true } });
  if (!menu) { console.error("no active menu"); process.exit(1); }
  const cats = await prisma.menuCategory.findMany({
    where: { menuId: menu.id },
    select: { id: true, name: true, menuItems: { select: { id: true, name: true, price: true, pizzaConfig: true, isAvailable: true } } },
  });
  const all = cats.flatMap((c) => c.menuItems.map((i) => ({ ...i, catName: c.name })));
  const pizzas = all.filter((i) => { try { return i.pizzaConfig && JSON.parse(i.pizzaConfig)?.isPizza === true; } catch { return false; } });
  const drinks = all.filter((i) =>
    /coke|pepsi|sprite|pop|soda|drink|water|juice|ale/i.test(i.name) && !i.pizzaConfig
    && !/combo/i.test(i.name), // never the combo itself (self-reference)
  );
  if (pizzas.length === 0) { console.error("no pizza-builder items on the demo store"); process.exit(1); }
  if (drinks.length < 2) { console.error("not enough drink items; found: " + drinks.map((d) => d.name).join(", ")); process.exit(1); }
  // DISTINCT pizzas per slot when the store has them — disjoint slot pools are
  // what makes the pool-order canonicalization testable (with overlapping
  // pools, any child order is honestly composable). 2026-08-02.
  const pz1 = pizzas[0];
  const pz2 = pizzas[1] ?? pizzas[0];

  const comboConfig = {
    slots: [
      { id: "slot-pz1", label: "Choose your 1st pizza", min: 1, max: 1, itemIds: [pz1.id], categoryIds: [] },
      { id: "slot-pz2", label: "Choose your 2nd pizza", min: 1, max: 1, itemIds: [pz2.id], categoryIds: [] },
      { id: "slot-pop", label: "Choose 4 Pop", min: 4, max: 4, itemIds: drinks.map((d) => d.id), categoryIds: [] },
    ],
    extrasCharge: true,
    ...(poolN >= 1 ? { sharedToppings: poolN } : {}),
  };

  const existing = await prisma.menuItem.findFirst({
    where: { name: "TEST Double Pizza + 4 Pop Combo", category: { menu: { restaurantId: r.id } } },
    select: { id: true },
  });
  const cat = cats.find((c) => /special/i.test(c.name)) ?? cats[0];
  if (existing) {
    await prisma.menuItem.update({ where: { id: existing.id }, data: { comboConfig: JSON.stringify(comboConfig), isAvailable: true } });
    console.log(`updated combo ${existing.id} (pool=${poolN || "off"})`);
  } else {
    const created = await prisma.menuItem.create({
      data: {
        categoryId: cat.id, restaurantId: r.id, name: "TEST Double Pizza + 4 Pop Combo",
        description: "2 pizzas + 4 cans of pop (test combo)",
        price: 39.99, isAvailable: true, comboConfig: JSON.stringify(comboConfig),
      },
      select: { id: true },
    });
    console.log(`created combo ${created.id} in "${cat.name}" (pool=${poolN || "off"})`);
  }
  console.log(`pizzas: ${pz1.name} / ${pz2.name} · drinks: ${drinks.map((d) => d.name).join(", ")}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
