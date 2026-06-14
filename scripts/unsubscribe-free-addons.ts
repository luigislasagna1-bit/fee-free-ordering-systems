/**
 * UNSUBSCRIBE (do NOT delete) the FREE/TEST add-on activations on a restaurant
 * account: set status = "cancelled" so the account is no longer subscribed,
 * while keeping every record. Only touches rows WITHOUT a Stripe subscription
 * (the free/test grants); Stripe-backed ones are left for the app's Billing-page
 * cancel. Entitlements only count active/trialing rows, so "cancelled" cleanly
 * un-subscribes. Luigi 2026-06-14.
 *
 * Dry-run by default; pass --confirm to apply:
 *   npx tsx scripts/unsubscribe-free-addons.ts             # DRY RUN (prod)
 *   npx tsx scripts/unsubscribe-free-addons.ts --confirm   # apply (prod)
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const OWNER_EMAIL = process.env.ADDON_OWNER_EMAIL || "info@luigislasagna.com";
const CONFIRM = process.argv.includes("--confirm");

function resolveUrl(): string {
  const arg = process.argv.slice(2).find((a) => a !== "--confirm" && a !== "prod");
  if (arg) return arg;
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
  console.log(`${CONFIRM ? "*** APPLYING ***" : "DRY RUN"} against: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { restaurantId: true } });
    if (!user?.restaurantId) throw new Error(`No restaurant for ${OWNER_EMAIL}`);

    const free = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: user.restaurantId, stripeSubscriptionId: null, status: { not: "cancelled" } },
      include: { addOn: { select: { slug: true } } },
    });
    const paid = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: user.restaurantId, NOT: { stripeSubscriptionId: null } },
      include: { addOn: { select: { slug: true } } },
    });

    console.log(`\nFREE/TEST (no Stripe) — ${free.length} to mark "cancelled" (records KEPT):`);
    for (const r of free) console.log(`  - ${r.addOn.slug}`);
    console.log(`\nPAID (Stripe-backed) — ${paid.length} LEFT UNTOUCHED (cancel from the Billing page):`);
    for (const r of paid) console.log(`  - ${r.addOn.slug}  (${r.stripeSubscriptionId})`);

    if (!CONFIRM) {
      console.log(`\n(dry run — nothing changed. Re-run with --confirm to apply.)`);
      return;
    }
    const res = await prisma.restaurantAddOn.updateMany({
      where: { id: { in: free.map((r) => r.id) } },
      data: { status: "cancelled" },
    });
    console.log(`\n✓ Marked ${res.count} free/test add-on(s) as cancelled. Nothing deleted; paid ones untouched.`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
