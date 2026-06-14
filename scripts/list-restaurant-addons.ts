/**
 * READ-ONLY: list the add-on subscriptions on a restaurant account (default
 * info@luigislasagna.com). Shows each add-on's status + whether it has a REAL
 * Stripe subscription, so we can tell free/test activations from paid ones
 * before removing anything. Luigi 2026-06-14.
 *
 *   npx tsx scripts/list-restaurant-addons.ts          # prod (commented .env.local URL)
 *   npx tsx scripts/list-restaurant-addons.ts <url>    # explicit URL
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const OWNER_EMAIL = process.env.ADDON_OWNER_EMAIL || "info@luigislasagna.com";

function resolveUrl(): string {
  const arg = process.argv[2];
  if (arg && arg !== "prod") return arg;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  dotenvConfig({ path: ".env.local" });
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("No DATABASE_URL found in .env.local");
}

async function main() {
  const url = resolveUrl();
  console.log(`Reading from: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { restaurantId: true } });
    if (!user?.restaurantId) throw new Error(`No restaurant for ${OWNER_EMAIL}`);
    const restaurant = await prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select: { name: true } });
    const rows = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: user.restaurantId },
      include: { addOn: { select: { slug: true, name: true, monthlyPriceCents: true } } },
      orderBy: { activatedAt: "asc" },
    });
    console.log(`\n${restaurant?.name ?? "store"} (${OWNER_EMAIL}) — ${rows.length} add-on(s):\n`);
    if (rows.length === 0) console.log("  (none — account is already clean)");
    for (const r of rows) {
      const price = (r.addOn.monthlyPriceCents / 100).toFixed(2);
      const stripe = r.stripeSubscriptionId ? `STRIPE-SUB ${r.stripeSubscriptionId}` : "no-stripe (free/test)";
      console.log(`  - ${r.addOn.slug.padEnd(20)} status=${r.status.padEnd(10)} $${price}/mo   ${stripe}`);
    }
    console.log();
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
