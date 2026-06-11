/** READ-ONLY: inspect the categories behind the "Drink/Salad 50%" combo promo
 *  vs the cart items (Gift Card, Wings Combo), then REPLAY the engine calc on a
 *  synthetic cart to reproduce the discount bug.
 *   npx tsx scripts/run-on-prod.ts scripts/diag-combo-promo.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcDiscount } from "../src/lib/promo-engine";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rid = "cmp7xhd3900000al2jz0db5vi";
  const drinkCat = "cmpuex6to0b3204kvgk6v1vik";
  const saladCat = "cmpuex6op0b0f04kvwavq8ra6";

  const cats = await prisma.menuCategory.findMany({
    where: { id: { in: [drinkCat, saladCat] } },
    select: { id: true, name: true },
  });
  console.log("Promo target categories:");
  for (const c of cats) console.log(`  ${c.id} = "${c.name}"`);

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: rid, OR: [{ name: { contains: "Gift", mode: "insensitive" } }, { name: { contains: "Wing", mode: "insensitive" } }, { name: { contains: "Combo", mode: "insensitive" } }] },
    select: { id: true, name: true, categoryId: true, price: true, category: { select: { name: true } } },
  });
  console.log("\nCart-ish items:");
  for (const i of items) console.log(`  "${i.name}"  cat=${i.categoryId} ("${i.category?.name}")  price=${i.price}`);

  const promo = await prisma.promotion.findFirst({ where: { restaurantId: rid, name: "Drink/Salad save 50%" } });
  if (!promo) { console.log("\npromo not found"); await prisma.$disconnect(); return; }

  // Replay with the EXACT cart from the screenshot. categoryId of each item
  // pulled from the DB above (find by name).
  const gift = items.find((i) => /gift/i.test(i.name));
  const wings = items.find((i) => /wing|combo/i.test(i.name));
  const synthetic = [
    { menuItemId: gift?.id ?? "gift", categoryId: gift?.categoryId ?? undefined, variantId: null, price: 25, quantity: 3, subtotal: 75 },
    { menuItemId: wings?.id ?? "wings", categoryId: wings?.categoryId ?? undefined, variantId: null, price: 39.99, quantity: 1, subtotal: 39.99 },
  ];
  const ctx: any = { subtotal: 114.99, items: synthetic, orderType: "pickup" };
  const d = calcDiscount(promo as any, ctx);
  console.log(`\nReplayed calcDiscount("Drink/Salad save 50%") on [Gift×3=$75, Wings=$39.99] → $${d}`);
  console.log(`(Expected $0 — neither item is a drink or salad. Bug if > 0.)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
