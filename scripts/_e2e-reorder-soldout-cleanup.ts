/** Restore demo-pizza-palace sold-out fixtures after the reorder e2e:
 *  Tiramisu (test target) → available; Spaghetti (promo-display fixture) → sold out.
 *  Prints the final state. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) { console.log("demo store not found"); return; }
  await p.menuItem.updateMany({ where: { category: { restaurantId: r.id }, name: { contains: "Tiramisu" } }, data: { isSoldOut: false } });
  await p.menuItem.updateMany({ where: { category: { restaurantId: r.id }, name: { contains: "Spaghetti" } }, data: { isSoldOut: true } });
  const soldOut = await p.menuItem.findMany({ where: { category: { restaurantId: r.id }, isSoldOut: true }, select: { name: true } });
  console.log("sold-out now:", soldOut.map(i => i.name).join(", ") || "(none)");
}
main();
