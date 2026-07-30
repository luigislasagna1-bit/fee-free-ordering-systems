/** One-off: set Ristorante Test 2 currency usd → eur (Fabrizio cmrkmtva — his
 *  Stripe/restaurant is euro; this makes every one of his restaurants show €).
 *  Only flips if currently "usd"; prints before/after. Read-then-write, scoped
 *  to the exact slug so nothing else is touched. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = "ristorante-test-2";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const before = await p.restaurant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true, currency: true } });
  if (!before) { console.log(`No restaurant with slug ${SLUG}`); await p.$disconnect(); return; }
  console.log(`BEFORE: ${before.name} currency=${JSON.stringify(before.currency)}`);
  if (before.currency !== "usd") {
    console.log(`   Not "usd" — leaving untouched (no change).`);
    await p.$disconnect();
    return;
  }
  await p.restaurant.update({ where: { id: before.id }, data: { currency: "eur" } });
  const after = await p.restaurant.findUnique({ where: { slug: SLUG }, select: { currency: true } });
  console.log(`AFTER:  currency=${JSON.stringify(after?.currency)}  ✅`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
