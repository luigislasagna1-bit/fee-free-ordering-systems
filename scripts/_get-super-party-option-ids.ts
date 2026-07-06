/** READ-ONLY prod: SUPER PARTY topping option ids for the live proof order. */
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
    select: { id: true, price: true, modifierGroups: { select: { name: true, options: { select: { id: true, name: true, priceAdjustment: true }, take: 3 } } } },
  });
  const toppings = item.modifierGroups.find((g: any) => g.name === "PIZZA TOPPINGS");
  const crust = item.modifierGroups.find((g: any) => g.name === "PIZZA CRUST");
  console.log(JSON.stringify({ itemId: item.id, base: item.price, toppings: toppings?.options, crust: crust?.options?.[0] }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
