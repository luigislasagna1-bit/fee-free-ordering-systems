/**
 * Hold the GrowthNet add-ons Customer SMS, ContentPilot, and Marketing Studio
 * back from sale by setting comingSoon=true (Luigi 2026-06-13). The catalog and
 * the GrowthNet page already hide the price + disable purchase when comingSoon
 * is true, and the sidebar shows a "Soon" badge.
 *
 * ADDITIVE: only these three slugs are touched — every other add-on's flag is
 * left exactly as-is (unlike fix-coming-soon-flags.ts, which rewrites all).
 *
 *   npx tsx scripts/set-addons-coming-soon.ts          # active .env.local URL (dev)
 *   npx tsx scripts/set-addons-coming-soon.ts prod     # the commented (prod) URL in .env.local
 *   npx tsx scripts/set-addons-coming-soon.ts "<url>"  # an explicit URL
 */
import { config as dotenvConfig } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const SLUGS = ["customer_sms", "contentpilot", "marketing_studio"];

function resolveUrl(): string {
  const arg = process.argv[2];
  if (arg === "prod") {
    // The COMMENTED DATABASE_URL line in .env.local is the prod branch.
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
    throw new Error("No commented (prod) DATABASE_URL found in .env.local");
  }
  if (arg) return arg; // explicit URL
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
  if (!process.env.DATABASE_URL) throw new Error("No DATABASE_URL set");
  return process.env.DATABASE_URL;
}

async function main() {
  const url = resolveUrl();
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Setting comingSoon=true for [${SLUGS.join(", ")}] against ${url.replace(/:[^:@]+@/, ":****@")}`);
  for (const slug of SLUGS) {
    const a = await prisma.addOn.findUnique({ where: { slug } });
    if (!a) { console.log(`  ${slug.padEnd(18)} (no such add-on — skipped)`); continue; }
    if (a.comingSoon === true) { console.log(`  ${slug.padEnd(18)} already comingSoon=true`); continue; }
    await prisma.addOn.update({ where: { id: a.id }, data: { comingSoon: true } });
    console.log(`  ${slug.padEnd(18)} ${a.comingSoon} -> true  ✓`);
  }
  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
