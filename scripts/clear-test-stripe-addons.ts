/**
 * Clear the TEST Stripe-backed add-on subscriptions on a restaurant account:
 * cancel the test Stripe subscription AND mark the RestaurantAddOn row
 * "cancelled". Only touches rows WITH a stripeSubscriptionId. TEST-MODE ONLY —
 * uses the sk_test STRIPE_SECRET_KEY from .env.local and REFUSES a live key.
 * Nothing is deleted. Luigi 2026-06-14.
 *
 * Dry-run by default (just verifies it can see each sub); pass --confirm to act:
 *   npx tsx scripts/clear-test-stripe-addons.ts            # DRY RUN (prod DB read + Stripe read)
 *   npx tsx scripts/clear-test-stripe-addons.ts --confirm  # cancel the test subs + mark cancelled
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import Stripe from "stripe";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

dotenvConfig({ path: ".env.local" });
const OWNER_EMAIL = process.env.ADDON_OWNER_EMAIL || "info@luigislasagna.com";
const CONFIRM = process.argv.includes("--confirm");

function resolveDbUrl(): string {
  const arg = process.argv.slice(2).find((a) => a !== "--confirm" && a !== "prod");
  if (arg) return arg;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("No DATABASE_URL found in .env.local");
}

async function main() {
  const skey = process.env.STRIPE_SECRET_KEY;
  if (!skey) throw new Error("No STRIPE_SECRET_KEY in .env.local");
  if (skey.startsWith("sk_live")) {
    throw new Error("REFUSING: STRIPE_SECRET_KEY is a LIVE key — this script is test-only.");
  }
  const stripe = new Stripe(skey);

  const dbUrl = resolveDbUrl();
  console.log(`${CONFIRM ? "*** CANCELLING ***" : "DRY RUN"} — DB ${dbUrl.replace(/:[^:@]+@/, ":****@")} | Stripe=TEST`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(dbUrl);
  const adapter = isNeon ? new PrismaNeon({ connectionString: dbUrl }) : new PrismaPg({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const user = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { restaurantId: true } });
    if (!user?.restaurantId) throw new Error(`No restaurant for ${OWNER_EMAIL}`);
    const rows = await prisma.restaurantAddOn.findMany({
      where: {
        restaurantId: user.restaurantId,
        NOT: { stripeSubscriptionId: null },
        status: { in: ["active", "trialing", "past_due"] },
      },
      include: { addOn: { select: { slug: true } } },
    });
    console.log(`\n${rows.length} Stripe-backed add-on(s):`);
    for (const r of rows) {
      const subId = r.stripeSubscriptionId!;
      let stripeState = "?";
      try {
        stripeState = (await stripe.subscriptions.retrieve(subId)).status;
      } catch (e: any) {
        stripeState = `NOT-FOUND (${e?.code || e?.message})`;
      }
      if (!CONFIRM) {
        console.log(`  - ${r.addOn.slug.padEnd(18)} sub=${subId}  stripe=${stripeState}`);
        continue;
      }
      if (!stripeState.startsWith("NOT-FOUND") && stripeState !== "canceled") {
        try { await stripe.subscriptions.cancel(subId); }
        catch (e: any) { console.log(`    (stripe cancel warning: ${e?.message})`); }
      }
      await prisma.restaurantAddOn.update({
        where: { id: r.id },
        data: { status: "cancelled", cancelAtPeriodEnd: false },
      });
      console.log(`  - ${r.addOn.slug.padEnd(18)} cancelled (stripe was ${stripeState})  ✓`);
    }
    console.log(CONFIRM ? `\n✓ Done — account is now subscribed to nothing.` : `\n(dry run — nothing changed. Re-run with --confirm.)`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
