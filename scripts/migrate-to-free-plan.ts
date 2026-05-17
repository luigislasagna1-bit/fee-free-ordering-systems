/**
 * One-shot migration: move every existing restaurant off the legacy 4-tier
 * plans (Starter/Growth/Pro/Enterprise) onto the new Free plan, and mark them
 * as already published + email-verified so nothing breaks for them when
 * Phase 3 (publishing gate) ships.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-free-plan.ts                # dev DB (.env.local)
 *   npx tsx scripts/migrate-to-free-plan.ts <database-url> # explicit (prod)
 *
 * Idempotent — running twice is a no-op for already-migrated rows.
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const explicitUrl = process.argv[2];
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Migrating against: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });
  if (!freePlan) {
    console.error('No "free" plan row exists. Run `npx tsx prisma/seed-addons.ts` first.');
    process.exit(1);
  }

  // Restaurants on any legacy plan slug.
  const legacyRestaurants = await prisma.restaurant.findMany({
    where: {
      subscriptionPlan: {
        slug: { in: ["starter", "growth", "pro", "enterprise"] },
      },
    },
    include: {
      subscriptionPlan: { select: { slug: true } },
      users: { where: { role: "restaurant_admin" }, select: { id: true, email: true, emailVerifiedAt: true } },
    },
  });
  console.log(`Found ${legacyRestaurants.length} restaurant(s) on legacy plans.\n`);

  for (const r of legacyRestaurants) {
    console.log(`  ${r.slug.padEnd(30)} plan=${r.subscriptionPlan?.slug} status=${r.subscriptionStatus}`);

    await prisma.restaurant.update({
      where: { id: r.id },
      data: {
        subscriptionPlanId: freePlan.id,
        // Out of trialing — they were grandfathered, they don't pay anymore.
        subscriptionStatus: "active",
        // Treat them as already published (locked decision: zero friction).
        publishedAt: r.publishedAt ?? r.createdAt,
        // Mark the restaurant-level email-verified timestamp so the publishing
        // gate (Phase 3) doesn't surprise them.
        ownerEmailVerifiedAt: r.ownerEmailVerifiedAt ?? r.createdAt,
      },
    });

    // Also verify the owner User row so Phase 3's per-user check passes.
    for (const u of r.users) {
      if (!u.emailVerifiedAt) {
        await prisma.user.update({
          where: { id: u.id },
          data: { emailVerifiedAt: r.createdAt },
        });
        console.log(`    verified owner ${u.email}`);
      }
    }
  }

  // Also: any restaurant in "trialing" status that's NOT on a legacy plan
  // (edge case) — clear them to "active" since core is now free.
  const stragglers = await prisma.restaurant.updateMany({
    where: {
      subscriptionStatus: "trialing",
      subscriptionPlanId: freePlan.id,
    },
    data: { subscriptionStatus: "active", trialEndsAt: null },
  });
  if (stragglers.count > 0) {
    console.log(`\nCleared trialing status on ${stragglers.count} already-on-free restaurant(s).`);
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
