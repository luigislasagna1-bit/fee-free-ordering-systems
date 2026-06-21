/**
 * Backfill appetizing photos onto the EXISTING demo restaurant (the app-review
 * login demo@feefreeordering.com): item images + the storefront banner, so it
 * looks real for Google Play / App Store reviewers instead of blank cards + a
 * plain green banner. create-demo-restaurant.ts is idempotent (it won't touch an
 * already-existing demo), so THIS is the update path for the live demo.
 *
 * Images live in public/marketing/demo/*.jpg (committed), served from the
 * platform host. Idempotent + safe: only touches the demo restaurant's own rows.
 *
 * Usage (DEV — current .env.local):
 *   npx tsx scripts/update-demo-images.ts
 * Usage (PROD — the DB the published app talks to):
 *   npx tsx scripts/run-on-prod.ts scripts/update-demo-images.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "demo@feefreeordering.com";
const BANNER_URL = "/marketing/demo/banner.jpg";
const SLOGAN = "Wood-fired pizza & fresh pasta — order direct, zero fees.";
const ITEM_IMAGES: Record<string, string> = {
  "Margherita Pizza": "margherita",
  "Pepperoni Pizza": "pepperoni",
  "Quattro Formaggi": "quattro",
  "Spaghetti Bolognese": "spaghetti",
  "Penne Arrabbiata": "penne",
  "Coca-Cola": "cola",
  "Sparkling Water": "water",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL in env (.env.local / .env)."); process.exit(1); }
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`DB: ${url.replace(/:[^:@]+@/, ":***@")}  (${isNeon ? "Neon" : "Pg"})`);

  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { restaurantId: true } });
  if (!user?.restaurantId) {
    console.error(`Demo account ${EMAIL} not found on this DB — run create-demo-restaurant.ts first.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const rid = user.restaurantId;

  await prisma.restaurant.update({ where: { id: rid }, data: { bannerUrl: BANNER_URL, slogan: SLOGAN } });
  console.log(`✅ banner + slogan set`);

  let total = 0;
  for (const [name, key] of Object.entries(ITEM_IMAGES)) {
    const res = await prisma.menuItem.updateMany({
      where: { restaurantId: rid, name },
      data: { imageUrl: `/marketing/demo/${key}.jpg` },
    });
    total += res.count;
    console.log(`  ${name} → ${key}.jpg  (${res.count} row)`);
  }
  console.log(`✅ ${total} item images set`);
  console.log(`\n🎉 Demo storefront: https://www.feefreeordering.com/order/fee-free-demo-restaurant`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
