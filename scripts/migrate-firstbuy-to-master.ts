/**
 * One-off migration: bring existing Kickstarter first-buy promos onto the new
 * default stacking rule. They were created with stackingRule="exclusive" (the
 * old default); campaign promos now default to "master" (stacks with everything)
 * per Luigi 2026-06-09. We ONLY touch rows still on the old "exclusive" default
 * so any intentional owner change is preserved.
 *
 * Runs against BOTH Neon branches found in .env.local (active + commented),
 * mirroring scripts/push-schema-to-both.ts so dev + prod stay aligned.
 *
 *   npx tsx scripts/migrate-firstbuy-to-master.ts
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

function readDatabaseUrls(): string[] {
  const content = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

async function migrateOne(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const res = await prisma.promotion.updateMany({
      where: { campaignRef: "kickstarter_first_buy", stackingRule: "exclusive" },
      data: { stackingRule: "master" },
    });
    console.log(`  ✅ ${masked} — updated ${res.count} first-buy promo(s) → master`);
  } catch (e) {
    console.error(`  ❌ ${masked} —`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const urls = readDatabaseUrls();
  if (urls.length === 0) {
    console.error("No DATABASE_URL lines found in .env.local");
    process.exit(1);
  }
  console.log(`Migrating first-buy promos → master on ${urls.length} database(s):`);
  for (const url of urls) await migrateOne(url);
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
