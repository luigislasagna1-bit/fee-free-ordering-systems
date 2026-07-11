/**
 * DEV-ONLY: put one add-on row on the demo restaurant into the free-partner
 * complimentary state (status=trialing, no Stripe sub, trialEndsAt=+6 days)
 * so the /admin/billing/add-ons comped card + convert flow can be verified
 * locally. Prints the owner login to use.
 *   npx tsx scripts/_seed-comp-addon.ts [restaurantSlug] [addOnSlug]
 *
 * GUARDS (adversarial review 2026-07-11): refuses to run against the PROD
 * database (by repo convention — scripts/run-on-prod.ts — prod is the
 * commented-out DATABASE_URL in .env.local), and refuses to overwrite a row
 * that has a real Stripe subscription (detaching one would leave it billing
 * invisibly: the cancel route 404s on stripeSubscriptionId=null).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const restaurantSlug = process.argv[2] || "demo-pizza-palace";
  const addOnSlug = process.argv[3] || "online_payments";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL");

  // Refuse prod: the commented-out DATABASE_URL in .env.local is the prod DB.
  try {
    const envLocal = readFileSync(".env.local", "utf8");
    const m = envLocal.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m);
    if (m && url === m[1]) {
      throw new Error("REFUSING to run: active DATABASE_URL is the PROD database. This seed is dev-only.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REFUSING")) throw e;
    // .env.local unreadable → can't identify prod; continue (local-only setups).
  }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: { id: true, name: true, users: { select: { email: true, role: true }, take: 5 } },
  });
  if (!restaurant) throw new Error(`restaurant ${restaurantSlug} not found`);
  const addOn = await prisma.addOn.findUnique({ where: { slug: addOnSlug }, select: { id: true, name: true } });
  if (!addOn) throw new Error(`add-on ${addOnSlug} not found`);

  const existing = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: addOn.id } },
    select: { stripeSubscriptionId: true },
  });
  if (existing?.stripeSubscriptionId) {
    throw new Error(
      `REFUSING to overwrite: this row has a real Stripe subscription (${existing.stripeSubscriptionId}). ` +
        `Detaching it would leave the sub billing with no in-app Cancel path.`,
    );
  }

  const trialEndsAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  const row = await prisma.restaurantAddOn.upsert({
    where: { restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: addOn.id } },
    create: { restaurantId: restaurant.id, addOnId: addOn.id, status: "trialing", trialEndsAt },
    update: { status: "trialing", stripeSubscriptionId: null, trialEndsAt, cancelAtPeriodEnd: false, currentPeriodEnd: null },
  });
  console.log(`✓ ${restaurant.name}: "${addOn.name}" set complimentary until ${trialEndsAt.toISOString()} (row ${row.id})`);
  console.log(`  owner login candidates:`, restaurant.users.map((u) => `${u.email} (${u.role})`).join(", ") || "(none)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
