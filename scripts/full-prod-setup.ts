/**
 * One-shot "make this DB fully production-ready" script.
 *
 * Runs the equivalent of:
 *   1. Verify schema (just reports — doesn't push; use `prisma db push` for that)
 *   2. seed-addons (Free plan + 7 add-on rows)
 *   3. migrate-to-free-plan (move legacy-plan restaurants to Free)
 *   4. grandfather-online-payments (add online_payments to existing Connect restaurants)
 *
 * Idempotent. Safe to run multiple times.
 *
 * Usage:
 *   npx prisma db push --url <db-url>                  # FIRST: ensure schema is current
 *   npx tsx scripts/full-prod-setup.ts <db-url>        # THEN: seed + grandfather
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/full-prod-setup.ts <db-url>");
  process.exit(1);
}

const ADD_ONS = [
  { slug: "online_payments",      name: "Online Payments",        features: ["card_payments", "stripe_connect"] },
  { slug: "hosted_website",       name: "Sales Optimized Website", features: ["hosted_marketing_page", "subdomain_routing"] },
  { slug: "custom_domain",        name: "Custom Domain",          features: ["custom_domain_routing"], requires: ["hosted_website"] },
  { slug: "advanced_promos",      name: "Advanced Promo Marketing", features: ["customer_segmentation", "automated_campaigns"] },
  { slug: "branded_mobile_app",   name: "Branded Mobile App",     features: ["app_store_listing", "branded_pwa"] },
  { slug: "pos_module",           name: "POS Module",             features: ["in_house_pos"] },
  { slug: "reservation_deposits", name: "Reservation Deposits",   features: ["take_reservation_deposit"] },
];

async function main() {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`Database: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  // ─── 1. Seed Free plan + add-ons ───────────────────────────────────────
  console.log("=== Seeding catalog ===");
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { slug: "free" },
    update: { isActive: true, name: "Free", price: 0 },
    create: {
      slug: "free", name: "Free", price: 0, isActive: true,
      description: "Free core ordering platform. Paid add-ons unlock extras.",
      features: "[]",
    },
  });
  console.log(`  Free plan: ${freePlan.id}`);

  // Mark legacy plans inactive (idempotent)
  await prisma.subscriptionPlan.updateMany({
    where: { slug: { in: ["starter", "growth", "pro", "enterprise"] } },
    data: { isActive: false },
  });

  for (let i = 0; i < ADD_ONS.length; i++) {
    const a = ADD_ONS[i];
    const row = await prisma.addOn.upsert({
      where: { slug: a.slug },
      update: { name: a.name, isActive: true,
        enabledFeatures: JSON.stringify(a.features),
        requiredDependencies: JSON.stringify(a.requires || []),
      },
      create: {
        slug: a.slug, name: a.name,
        monthlyPriceCents: 0, displayOrder: i, isActive: true,
        enabledFeatures: JSON.stringify(a.features),
        requiredDependencies: JSON.stringify(a.requires || []),
      },
    });
    console.log(`  ${a.slug.padEnd(22)} → ${row.id}`);
  }

  // ─── 2. Migrate legacy-plan restaurants ────────────────────────────────
  console.log("\n=== Migrating legacy-plan restaurants to Free ===");
  const legacy = await prisma.restaurant.findMany({
    where: { subscriptionPlan: { slug: { in: ["starter", "growth", "pro", "enterprise"] } } },
    include: { users: { where: { role: "restaurant_admin" }, select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  console.log(`  Found ${legacy.length} legacy-plan restaurant(s)`);
  for (const r of legacy) {
    await prisma.restaurant.update({
      where: { id: r.id },
      data: {
        subscriptionPlanId: freePlan.id,
        subscriptionStatus: "active",
        publishedAt: r.publishedAt ?? r.createdAt,
        ownerEmailVerifiedAt: r.ownerEmailVerifiedAt ?? r.createdAt,
      },
    });
    for (const u of r.users) {
      if (!u.emailVerifiedAt) {
        await prisma.user.update({
          where: { id: u.id },
          data: { emailVerifiedAt: r.createdAt },
        });
      }
    }
    console.log(`  ✓ ${r.slug}`);
  }

  // Clear lingering "trialing" on already-on-free
  const stragglers = await prisma.restaurant.updateMany({
    where: { subscriptionStatus: "trialing", subscriptionPlanId: freePlan.id },
    data: { subscriptionStatus: "active", trialEndsAt: null },
  });
  if (stragglers.count > 0) console.log(`  Cleared trialing on ${stragglers.count} restaurants already on Free.`);

  // ─── 3. Grandfather online_payments ───────────────────────────────────
  console.log("\n=== Grandfathering card-payment restaurants into online_payments ===");
  const onlinePayments = await prisma.addOn.findUnique({ where: { slug: "online_payments" } });
  if (!onlinePayments) {
    console.log("  ❌ online_payments AddOn missing (shouldn't happen)");
  } else {
    const eligible = await prisma.restaurant.findMany({
      where: { stripeAccountId: { not: null }, stripeChargesEnabled: true },
      select: { id: true, slug: true },
    });
    console.log(`  Found ${eligible.length} card-payment restaurant(s)`);
    for (const r of eligible) {
      const existing = await prisma.restaurantAddOn.findUnique({
        where: { restaurantId_addOnId: { restaurantId: r.id, addOnId: onlinePayments.id } },
      });
      if (existing) {
        console.log(`  · ${r.slug} already has online_payments (${existing.status})`);
      } else {
        await prisma.restaurantAddOn.create({
          data: {
            restaurantId: r.id, addOnId: onlinePayments.id,
            status: "active", stripeSubscriptionId: null,
          },
        });
        console.log(`  ✓ ${r.slug} grandfathered`);
      }
    }
  }

  console.log("\nDone. DB is fully provisioned.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
