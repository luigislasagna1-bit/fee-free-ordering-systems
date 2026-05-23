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
  // comingSoon: true means the add-on appears in the catalog as a teaser
  // but CANNOT be subscribed to (subscribe button disabled, "Coming Soon"
  // badge replaces the price). Use this for features we're publicly
  // committing to but haven't built yet — gives prospective restaurants a
  // roadmap preview without mis-selling vapor. Flip to false the day the
  // implementation lands + a real price is set in /superadmin/add-ons.
  const addOns: Array<{
    slug: string;
    name: string;
    description: string;
    monthlyPriceCents: number;
    displayOrder: number;
    enabledFeatures: string[];
    requiredDependencies?: string[];
    comingSoon?: boolean;
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
      // Cloudflare/Vercel domain auto-provisioning isn't fully wired yet
      // (provider.ts:49 Cloudflare path is a stub). Keep hidden until that
      // lands.
      comingSoon: true,
    },
    {
      slug: "advanced_promos",
      name: "Advanced Promo Marketing",
      description:
        "Customer segmentation, automated campaigns, loyalty-style promos.",
      monthlyPriceCents: 0,
      displayOrder: 40,
      enabledFeatures: ["customer_segmentation", "automated_campaigns"],
      // Basic promos work. The "segmentation" + "automated campaigns" copy
      // is aspirational until task #60 is done. First post-launch feature.
      comingSoon: true,
    },
    {
      slug: "branded_mobile_app",
      name: "Branded Mobile App",
      description:
        "A native iOS + Android app with your branding, listed in the App Store and Play Store.",
      monthlyPriceCents: 0,
      displayOrder: 50,
      enabledFeatures: ["app_store_listing", "branded_pwa"],
      // Zero code. Big undertaking.
      comingSoon: true,
    },
    {
      slug: "pos_module",
      name: "POS Module",
      description:
        "In-house POS for staff to take dine-in / takeaway orders from the same admin.",
      monthlyPriceCents: 0,
      displayOrder: 60,
      enabledFeatures: ["in_house_pos"],
      // Zero code. Post-launch development.
      comingSoon: true,
    },
    {
      slug: "phone_ordering",
      name: "Automated Phone Ordering",
      description:
        "AI-powered phone agent takes customer orders 24/7 and pushes them straight to your kitchen — no staff time, no missed calls during the rush.",
      monthlyPriceCents: 0,
      displayOrder: 65,
      enabledFeatures: ["phone_ordering_agent"],
      // New feature. Admin sidebar entry + placeholder page added; actual
      // implementation (Twilio voice + AI agent) is post-launch work.
      comingSoon: true,
    },
    {
      slug: "reservation_deposits",
      name: "Reservation Deposits",
      description:
        "Charge a refundable deposit when customers book a table — protects against no-shows.",
      monthlyPriceCents: 0,
      displayOrder: 70,
      enabledFeatures: ["take_reservation_deposit"],
      // Reservations work but deposit-capture-at-booking is not implemented.
      comingSoon: true,
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
      // Marketplace — two billing modes:
      //
      //   1. Monthly subscription ($199.99/mo via Stripe Checkout):
      //      unlimited orders + ShipDay Driver Pool INCLUDED. Predictable
      //      bill. The Stripe Product/Price this AddOn syncs to is the
      //      $199.99 monthly plan.
      //
      //   2. Pay-as-you-go (no Stripe subscription): the restaurant opts
      //      into a MarketplaceListing with billingMode="payg" — no flat
      //      fee, but $3 per marketplace order accrues toward a $249.99
      //      monthly cap. Driver Pool is NOT bundled in this mode (they
      //      can subscribe to the standalone Driver Pool add-on for
      //      $19.99/mo if they want it).
      //
      // The per-order accrual + cap math lives in src/lib/marketplace.ts.
      // Monthly settlement for PAYG restaurants runs via the cron at
      // /api/cron/marketplace-settle.
      //
      // Restaurants on the monthly plan get marketplace_listing AND
      // driver_pool entitlements via this AddOn's enabledFeatures.
      slug: "marketplace",
      name: "Marketplace",
      description:
        "Two ways to join: (1) Monthly $199.99 — unlimited orders, ShipDay Driver Pool included, predictable bill. (2) Pay-as-you-go — no subscription, $3 per marketplace order, capped at $249.99/month, Driver Pool sold separately. Either way: no 30% commission, no extra fees for customers, listed publicly on the Fee Free Ordering Marketplace.",
      monthlyPriceCents: 19999, // $199.99 — the monthly plan price (PAYG opt-in skips Stripe entirely)
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
      // ShipDay REST wrapper + webhook handler don't exist yet (task #59).
      // UI is there but no actual dispatch happens. Hide until built.
      comingSoon: true,
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
        // comingSoon deliberately NOT updated on re-seed. Superadmin sets
        // it in /superadmin/add-ons after launch — seed-time defaults
        // would otherwise bulldoze that. (Same sticky-once-set principle
        // we use for monthlyPriceCents and the Stripe sync fields.)
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
        comingSoon: a.comingSoon ?? false,
      },
    });
    console.log(`  ${a.slug.padEnd(22)} → ${row.id}${a.comingSoon ? "  [Coming Soon]" : ""}`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
