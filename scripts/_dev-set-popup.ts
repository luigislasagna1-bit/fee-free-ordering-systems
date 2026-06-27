/** DEV: set/clear a ZZTEST promo popup on the demo restaurant to eyeball the modal on /order.
 *    set:   npx tsx scripts/_dev-set-popup.ts
 *    clear: npx tsx scripts/_dev-set-popup.ts --clear
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const CLEAR = process.argv.includes("--clear");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const popup = CLEAR
    ? null
    : { enabled: true, imageUrl: null, title: "🎉 ZZTEST Popup", body: "20% off all pizzas this week — use code PIZZA20 at checkout!", buttonLabel: "Order now", buttonUrl: "#menu" };
  const r = await prisma.restaurant.update({ where: { slug: "demo-pizza-palace" }, data: { orderingPopup: popup as any }, select: { name: true } });
  console.log(`✓ ${r.name} orderingPopup ${CLEAR ? "CLEARED" : "SET (ZZTEST, enabled)"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
