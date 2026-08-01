/**
 * Correct account holders who were recorded as opted-OUT without ever being asked.
 *
 * Customer.marketingConsent defaults to FALSE and the signup routes never set
 * it, so anyone who created an account was stored as opted-out. Checkout then
 * pre-filled its tickbox from that stored false, so they stayed opted out
 * permanently. Signup now shows a ticked box and records the answer — this
 * repairs the rows created before that fix.
 *
 * SCOPE, deliberately narrow: only rows that
 *   - are account-grade (signedUpAt / passwordHash / customerAccountId), AND
 *   - have marketingConsent = false, AND
 *   - have marketingConsentAt = NULL  ← never made a choice
 *
 * That last condition is the whole safety of this script. A NULL timestamp means
 * nothing ever recorded a decision, so the false is the schema default rather
 * than a customer's wish. Anyone who ticked or UNTICKED a box at checkout has a
 * timestamp and is left completely alone — this can never re-subscribe someone
 * who deliberately opted out.
 *
 * Sets marketingConsentAt to now, so the record shows when consent was
 * established and these rows can never be swept again.
 *
 * DRY RUN BY DEFAULT. Add --apply to write.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_fix-signup-marketing-consent.ts
 *   npx tsx scripts/run-on-prod.ts scripts/_fix-signup-marketing-consent.ts --apply
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL is not set."); process.exit(1); }
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const APPLY = process.argv.includes("--apply");

async function main() {
  const where = {
    marketingConsent: false,
    // Never touched a consent control — the false is the schema default.
    marketingConsentAt: null,
    OR: [
      { signedUpAt: { not: null } },
      { passwordHash: { not: null } },
      { customerAccountId: { not: null } },
    ],
  } as any;

  const rows = await prisma.customer.findMany({
    where,
    select: {
      id: true, email: true, name: true, signedUpAt: true, totalOrders: true,
      restaurant: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — account holders never asked about marketing\n`);
  if (rows.length === 0) {
    console.log("  Nothing to fix. Every account holder already has a recorded choice.\n");
    return;
  }

  const byRestaurant = new Map<string, number>();
  for (const r of rows) {
    const k = r.restaurant?.name ?? "(unknown)";
    byRestaurant.set(k, (byRestaurant.get(k) ?? 0) + 1);
  }
  for (const [name, n] of byRestaurant) console.log(`  ${name}: ${n}`);
  console.log("");
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${(r.email ?? "(no email)").padEnd(34)} ${r.name ?? ""}  orders=${r.totalOrders}`);
  }
  if (rows.length > 20) console.log(`  … and ${rows.length - 20} more`);

  // Sanity check: how many DID make a choice? Those must stay untouched.
  const explicitOptOuts = await prisma.customer.count({
    where: { marketingConsent: false, marketingConsentAt: { not: null } },
  });
  console.log(`\n  ${rows.length} row(s) would be set to opted-IN.`);
  console.log(`  ${explicitOptOuts} customer(s) opted out ON PURPOSE and are NOT touched.`);

  if (!APPLY) {
    console.log("\n  Dry run only. Re-run with --apply to write.\n");
    return;
  }

  const res = await prisma.customer.updateMany({
    where,
    data: { marketingConsent: true, marketingConsentAt: new Date() },
  });
  console.log(`\n  ✅ Updated ${res.count} customer(s).\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
