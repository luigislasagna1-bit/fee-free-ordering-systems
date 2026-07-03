/**
 * One-time backfill for the promoExcluded → rewardRedeemExcluded split
 * (Luigi 2026-07-02). Until today one flag did BOTH "no promo discounts" and
 * "can't be paid with Reward Dollars"; they're now independent columns. Any
 * row already flagged promoExcluded (e.g. Gift Cards) gets
 * rewardRedeemExcluded=true so the protection that existed before the split
 * carries over — owners can then untick either independently.
 *
 * Runs against EVERY DATABASE_URL found in .env.local (active + commented),
 * same convention as push-schema-to-both. Idempotent — re-running matches
 * nothing new. Run AFTER push-schema-to-both:
 *   npx tsx scripts/backfill-redeem-excluded.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const content = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}
if (urls.length === 0) {
  console.error("No DATABASE_URL lines found in .env.local");
  process.exit(1);
}

async function backfill(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  // Same adapter selection as src/lib/db.ts (Neon HTTP protocol).
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
  try {
    const cats = await prisma.menuCategory.updateMany({
      where: { promoExcluded: true, rewardRedeemExcluded: false },
      data: { rewardRedeemExcluded: true },
    });
    const items = await prisma.menuItem.updateMany({
      where: { promoExcluded: true, rewardRedeemExcluded: false },
      data: { rewardRedeemExcluded: true },
    });
    console.log(`  ${masked}\n    categories backfilled: ${cats.count} · items backfilled: ${items.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  for (const url of urls) await backfill(url);
  console.log("✅ redeem-exclusion backfill complete on all databases.");
})().catch((e) => { console.error(e); process.exit(1); });
