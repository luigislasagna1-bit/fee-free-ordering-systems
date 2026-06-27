/** DEV: set a promo-action popup (button opens the "10% off" promo) on the demo restaurant
 *  to verify the new popup→promo flow on /order. Clear with --clear.
 *    set:   npx tsx scripts/_dev-set-popup-promo.ts
 *    clear: npx tsx scripts/_dev-set-popup-promo.ts --clear
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
    : {
        enabled: true,
        imageUrl: null,
        title: "🍕 ZZTEST — Today's deal!",
        body: "Tap below to see this week's promo.",
        buttonLabel: "See the deal",
        buttonAction: "promo",
        buttonUrl: null,
        buttonPromoId: "cmpr83uss000600vhayg811xq", // "10% off 30$ or more"
        buttonCouponCode: null,
      };
  const r = await prisma.restaurant.update({ where: { slug: "demo-pizza-palace" }, data: { orderingPopup: popup as any }, select: { name: true } });
  console.log(`✓ ${r.name} orderingPopup ${CLEAR ? "CLEARED" : "SET (promo action → 10% off)"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
