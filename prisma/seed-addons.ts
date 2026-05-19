/**
 * One-shot seed: the Free plan + the initial add-on catalog.
 *
 * Run after `prisma db push`:
 *   npx tsx prisma/seed-addons.ts
 *   npx tsx prisma/seed-addons.ts <database-url>   # explicit URL (prod)
 *
 * Idempotent — uses upsert by slug. Re-running is safe and only updates
 * non-Stripe fields (so superadmin-set Stripe Price IDs aren't clobbered).
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

  console.log(`Seeding against: ${url.replace(/:[^:@]+@/, ":****@")}`);

  // ─── Free plan ─────────────────────────────────────────────────────────
  // We keep the existing SubscriptionPlan rows (Starter/Growth/Pro/Enterprise)
  // for backward compat — existing restaurants still reference them. New
  // signups go to Free from now on.
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { slug: "free" },
    update: { isActive: true },
    create: {
      slug: "free",
      name: "Free",
      description: "Ordering widget, admin, menu, kitchen app — no card required.",
      price: 0,
      interval: "month",
      isActive: true,
      features: JSON.stringify([
        "Ordering widget for your existing website",
        "Restaurant admin panel + menu builder",
        "Pickup, delivery, dine-in services",
        "Kitchen / order-taking PWA",
        "Cash + pay-at-store payment methods",
        "Email notifications",
      ]),
      syncStatus: "not_synced", // Stripe-free; doesn't need a Price ID
    },
  });
  console.log(`Free plan: ${freePlan.id}`);

  // Mark the 4 legacy plans inactive so they don't appear in any new selector.
  // Existing restaurants still keep their subscriptionPlanId pointing at them
  // until scripts/migrate-to-free-plan.ts moves them.
  for (const slug of ["starter", "growth", "pro", "enterprise"]) {
    const r = await prisma.subscriptionPlan.updateMany({
      where: { slug },
      data: { isActive: false },
    });
    if (r.count > 0) console.log(`Marked plan "${slug}" inactive (${r.count} row).`);
  }

  // ─── Add-on catalog ────────────────────────────────────────────────────
  const addOns: Array<{
    slug: string;
    name: string;
    description: string;
    monthlyPriceCents: number;
    displayOrder: number;
    enabledFeatures: string[];
    requiredDependencies?: string[];
  }> = [
    {
      slug: "online_payments",
      name: "Online Payments",
      description:
        "Accept card payments online. Money lands directly in your Stripe Connect account.",
      monthlyPriceCents: 0, // placeholder; superadmin sets real price later
      displayOrder: 10,
      enabledFeatures: ["card_payments", "stripe_connect"],
    },
    {
      slug: "hosted_website",
      name: "Sales Optimized Website",
      description:
        "Get a hosted marketing + ordering page on a feefreeordering subdomain, auto-generated from your menu.",
      monthlyPriceCents: 0,
      displayOrder: 20,
      enabledFeatures: ["hosted_marketing_page", "subdomain_routing"],
    },
    {
      slug: "custom_domain",
      name: "Custom Domain",
      description:
        "Point your own domain at your Fee Free Ordering hosted site.",
      monthlyPriceCents: 0,
      displayOrder: 30,
      enabledFeatures: ["custom_domain_routing"],
      requiredDependencies: ["hosted_website"],
    },
    {
      slug: "advanced_promos",
      name: "Advanced Promo Marketing",
      description:
        "Customer segmentation, automated campaigns, loyalty-style promos.",
      monthlyPriceCents: 0,
      displayOrder: 40,
      enabledFeatures: ["customer_segmentation", "automated_campaigns"],
    },
    {
      slug: "branded_mobile_app",
      name: "Branded Mobile App",
      description:
        "A native iOS + Android app with your branding, listed in the App Store and Play Store.",
      monthlyPriceCents: 0,
      displayOrder: 50,
      enabledFeatures: ["app_store_listing", "branded_pwa"],
    },
    {
      slug: "pos_module",
      name: "POS Module",
      description:
        "In-house POS for staff to take dine-in / takeaway orders from the same admin.",
      monthlyPriceCents: 0,
      displayOrder: 60,
      enabledFeatures: ["in_house_pos"],
    },
    {
      slug: "reservation_deposits",
      name: "Reservation Deposits",
      description:
        "Charge a refundable deposit when customers book a table — protects against no-shows.",
      monthlyPriceCents: 0,
      displayOrder: 70,
      enabledFeatures: ["take_reservation_deposit"],
    },
    {
      // Multi-location: parent restaurant pays this flat fee to unlock the
      // ability to spin up child locations. Each child location separately
      // pays for its OWN add-ons (Online Payments, Hosted Website, etc.) —
      // the multi-location fee just unlocks the parent's privilege to manage
      // a network. Without it, the location switcher + child-create flow
      // are gated off.
      slug: "multi_location",
      name: "Multi-Location",
      description:
        "Manage multiple restaurant locations under one account. Each location runs its own menu, orders, and Stripe Connect — switch between them from the parent admin.",
      monthlyPriceCents: 4999, // $49.99 — locked-in price (user-set 2026-05-18)
      displayOrder: 80,
      enabledFeatures: ["multi_location_management"],
    },
    {
      // Marketplace: subscribe to be listed on the public Fee Free
      // Ordering Marketplace (think GloriaFood-style discovery, NOT
      // UberEats — no extra customer fees, no 30% commission, restaurants
      // keep full margins). Restaurants get auto-listed on /marketplace
      // as soon as the subscription activates. INCLUDES the driver_pool
      // add-on so subscribers get ShipDay third-party delivery without
      // a second subscription.
      //
      // Pricing model (M2): the lower of $199.99/month flat OR a per-order
      // fee — restaurant pays whichever is cheaper that billing cycle.
      // Cap of $199.99 means unlimited marketing reach for less than
      // ONE day's worth of UberEats commissions on a $700 day.
      slug: "marketplace",
      name: "Marketplace Listing",
      description:
        "Get listed on the Fee Free Ordering Marketplace — bring your restaurant in front of new local customers without paying 30% commission. Flat $199.99/month max (or per-order, whichever is lower), unlimited orders, no extra fees for you OR your customers. Includes the Driver Pool add-on.",
      monthlyPriceCents: 19999, // $199.99 flat-cap — locked in for the Marketplace launch
      displayOrder: 90,
      enabledFeatures: ["marketplace_listing", "driver_pool"],
    },
    {
      // Driver Pool: standalone access to the ShipDay third-party driver
      // network without subscribing to the full Marketplace. Useful for
      // restaurants that don't want public discovery but DO want
      // overflow delivery capacity for their own customers when they
      // run out of in-house drivers.
      //
      // When opted in, the kitchen display gets a per-order "in-store
      // driver vs send to driver pool" picker. The restaurant configures
      // how the delivery fee flows (pass-through, flat, or tiered) so
      // they can decide whether to absorb the ShipDay cost, pass it to
      // the customer, or split it.
      slug: "driver_pool",
      name: "Driver Pool",
      description:
        "Tap into our ShipDay third-party driver network when your in-house drivers are busy or unavailable. Per-delivery fees only — no monthly minimums beyond this subscription. Set your own delivery pricing for customers and decide how much you absorb vs pass through.",
      monthlyPriceCents: 1999, // $19.99
      displayOrder: 100,
      enabledFeatures: ["driver_pool"],
    },
  ];

  for (const a of addOns) {
    const row = await prisma.addOn.upsert({
      where: { slug: a.slug },
      update: {
        // Only update non-Stripe fields so superadmin price/Stripe ID work isn't clobbered.
        name: a.name,
        description: a.description,
        displayOrder: a.displayOrder,
        enabledFeatures: JSON.stringify(a.enabledFeatures),
        requiredDependencies: JSON.stringify(a.requiredDependencies ?? []),
      },
      create: {
        slug: a.slug,
        name: a.name,
        description: a.description,
        monthlyPriceCents: a.monthlyPriceCents,
        displayOrder: a.displayOrder,
        enabledFeatures: JSON.stringify(a.enabledFeatures),
        requiredDependencies: JSON.stringify(a.requiredDependencies ?? []),
        isActive: true,
      },
    });
    console.log(`  ${a.slug.padEnd(22)} → ${row.id}`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
