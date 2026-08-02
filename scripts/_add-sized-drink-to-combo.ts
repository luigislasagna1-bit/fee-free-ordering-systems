/** DEV-ONLY: put one item WITH sizes into the test combo's pop slot so the
 *  customize-once ×N path is exercisable in the browser (2026-08-02). */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  const combo = await prisma.menuItem.findFirst({
    where: { name: "TEST Double Pizza + 4 Pop Combo", restaurant: { slug: "demo-pizza-palace" } },
    select: { id: true, comboConfig: true, restaurantId: true },
  });
  if (!combo) throw new Error("no test combo");
  const sized = await prisma.menuItem.findFirst({
    where: {
      restaurantId: combo.restaurantId, hasVariants: true, pizzaConfig: null, comboConfig: null,
      isAvailable: true, variants: { some: {} },
    },
    select: { id: true, name: true, variants: { select: { name: true } } },
  });
  if (!sized) { console.log("no sized non-pizza item found"); process.exit(1); }
  const cfg2 = JSON.parse(combo.comboConfig!);
  const pop = cfg2.slots.find((s: { id: string }) => s.id === "slot-pop");
  if (!pop.itemIds.includes(sized.id)) pop.itemIds.push(sized.id);
  await prisma.menuItem.update({ where: { id: combo.id }, data: { comboConfig: JSON.stringify(cfg2) } });
  console.log(`added "${sized.name}" (sizes: ${sized.variants.map((v) => v.name).join("/")}) to the pop slot`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
