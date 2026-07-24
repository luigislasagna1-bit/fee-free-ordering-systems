/**
 * ONE-TIME BACKFILL (B2): freeze driverTipCents + tipCurrency onto every already-
 * DELIVERED FeeFree DeliveryAssignment that predates the tip-freeze code, so B3's
 * switch to reading frozen tips doesn't show $0 for drivers' historical deliveries
 * (critique Blocker B1).
 *
 * For each DeliveryAssignment where status='delivered' AND driverTipCents IS NULL:
 *   driverTipCents = round(order.tip * 100)   (0 when the order had no tip)
 *   tipCurrency    = restaurant.currency
 *
 * Idempotent — only touches rows where driverTipCents IS NULL, so re-running is a
 * no-op. Runs against BOTH DATABASE_URLs found in .env.local (dev + prod) via
 * explicit adapter connections (avoids the prisma.config override:true issue).
 *
 *   npx tsx scripts/_backfill-driver-tips.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

function urlsFromEnvLocal(): string[] {
  const content = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

async function backfillOne(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`\n=== ${masked} ===`);
  try {
    const pending = await prisma.deliveryAssignment.findMany({
      where: { status: "delivered", driverTipCents: null },
      select: { id: true, order: { select: { tip: true, restaurant: { select: { currency: true } } } } },
    });
    if (pending.length === 0) {
      console.log("Nothing to backfill (0 delivered rows with null driverTipCents).");
      return;
    }
    console.log(`Backfilling ${pending.length} delivered assignment(s)…`);
    let done = 0;
    for (const a of pending) {
      const cents = Math.round((a.order?.tip ?? 0) * 100);
      const currency = a.order?.restaurant?.currency ?? null;
      await prisma.deliveryAssignment.update({
        where: { id: a.id },
        data: { driverTipCents: cents, tipCurrency: currency },
      });
      done++;
    }
    console.log(`✅ Backfilled ${done} row(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const urls = urlsFromEnvLocal();
  if (urls.length === 0) {
    console.error("No DATABASE_URL found in .env.local");
    process.exit(1);
  }
  for (const url of urls) await backfillOne(url);
  console.log("\nDone.");
}
main().catch((e) => { console.error(e); process.exit(1); });
