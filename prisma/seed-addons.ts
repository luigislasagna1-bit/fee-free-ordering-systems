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
    /** GrowthNet bundle membership — an active `growthnet` subscription
     *  grants this add-on's features too (union resolved live in
     *  src/lib/entitlements.ts). Flag future marketing add-ons true and
     *  existing GrowthNet subscribers get them automatically. */
    inGrowthNet?: boolean;
  }> = [
    {
      // GrowthNet — Fee Free's Restaurant Growth System. THE bundle: every
      // paid marketing / retention / customer-acquisition add-on at one
      // discounted price. Subscribing grants the union of features across
      // all add-ons flagged inGrowthNet (dynamic — see entitlements.ts), so
      // the bundle automatically grows as we ship new growth tools.
      // Marketplace stays OUTSIDE the bundle (its $199.99 / PAYG per-order
      // billing doesn't fit a flat bundle); flip its inGrowthNet flag if
      // that call ever changes. Price below is a placeholder — superadmin
      // sets the real discounted price + syncs Stripe. Luigi 2026-06-11.
      slug: "growthnet",
      name: "GrowthNet",
      description:
        "Fee Free's Restaurant Growth System — every paid marketing, retention and customer-acquisition add-on in one discounted bundle: Advanced Promo Marketing (incl. Autopilot), Marketing Studio, Kickstarter and Customer SMS. New growth tools are added to GrowthNet as we ship them — subscribers get them automatically at no extra cost.",
      monthlyPriceCents: 3999, // $39.99 placeholder (~33% off the ~$59.96 individual value) — superadmin sets the real price
      displayOrder: 35,
      enabledFeatures: [], // features come from the live union of inGrowthNet members
    },
    {
      // The FREE-plan order cap exemption. Every restaurant lands on
      // the FREE plan with 100 orders/month included. This add-on
      // lifts the cap WITHOUT bundling any feature — useful for
      // high-volume cash-only restaurants who don't need card payments
      // but still need unlimited throughput. Any OTHER paid add-on
      // also exempts them from the cap (see src/lib/order-cap.ts), so
      // restaurants who already pay for Online Payments / Marketplace
      // / etc. don't need this one too.
      slug: "unlimited_orders",
      name: "FREE Unlimited Orders",
      description:
        "Removes the 100-orders/month FREE-plan cap. Includes unlimited monthly order volume — no per-order fees. Skip this if you already have any other paid add-on (they include unlimited orders).",
      monthlyPriceCents: 1499,
      displayOrder: 5,
      enabledFeatures: [],
    },
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
      inGrowthNet: true,
      name: "Advanced Promo Marketing",
      description:
        "Unlocks 8 advanced promo types: payment-method reward, free item, meal bundle, buy-N-get-free, free dish as part of meal, fixed/percentage discount on combo, meal bundle with speciality. Plus customer segmentation and automated marketing campaigns (Autopilot).",
      monthlyPriceCents: 1999, // $19.99/mo
      displayOrder: 40,
      enabledFeatures: [
        "customer_segmentation",
        "automated_campaigns",
        "advanced_promo_types",
      ],
      // Marketing suite (2026-05-29 rebuild) replaces the old aspirational
      // copy. The 8 locked promo types ship in Phase 2c, segmentation +
      // campaigns ship in Phase 3 (Autopilot rebuild). comingSoon stays
      // false from here on.
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
      // Marketplace — FREE + INCLUDED for every restaurant (Luigi 2026-07-14).
      // No monthly or per-order fee: every published pickup/delivery restaurant
      // is listed automatically (public discovery within 15 km), controlled by
      // the isListed toggle on /admin/marketplace — not by a paid add-on.
      //
      // This add-on row is RETIRED (isActive:false): it is no longer sold and
      // won't appear on the billing add-ons page, but the row is kept so the
      // retirement migration (scripts/retire-marketplace-addon.ts) and any
      // legacy RestaurantAddOn references still resolve. The former paid
      // monthly/PAYG framing is gone. Driver Pool is now its own add-on.
      slug: "marketplace",
      name: "Marketplace",
      description:
        "Free and included for every restaurant — no monthly or per-order fee. Every published pickup or delivery restaurant is listed on the Fee Free Marketplace for local discovery. No 30% commission, no extra fees for customers.",
      monthlyPriceCents: 0,
      displayOrder: 90,
      enabledFeatures: ["marketplace_listing"],
    },
    {
      // Customer SMS — transactional SMS to customers on status changes
      // (order confirmed → accepted → ready → completed/rejected). Same
      // tone + cadence as the email pipeline; just a different channel.
      // Restaurant pays $19.99/mo to turn it on for their customers;
      // until subscribed, sendSms() in src/lib/notifications.ts is a
      // no-op even when the platform-shared Twilio creds are set in
      // Vercel env.
      slug: "customer_sms",
      inGrowthNet: true,
      name: "Customer SMS Notifications",
      description:
        "Text customers as their order moves through the kitchen — confirmed, accepted, ready for pickup, complete. Drives pickup compliance + customer trust. Uses our shared Twilio number; no setup on your side.",
      monthlyPriceCents: 1999, // $19.99 / month
      displayOrder: 95,
      enabledFeatures: ["customer_sms"],
      // Held back from sale until release (Luigi 2026-06-13) — catalog +
      // GrowthNet hide the price/subscribe; the sidebar shows a "Soon" badge.
      comingSoon: true,
    },
    {
      // Marketing Studio — trackable QR codes + smart links + branded
      // flyer/poster builder with scan→order→revenue analytics. The pages
      // live under /admin/marketing-studio (built); this add-on gates them
      // so FREE accounts see a locked upsell. Price is a placeholder until
      // the superadmin sets the real one + syncs Stripe. Luigi 2026-06-11.
      slug: "marketing_studio",
      inGrowthNet: true,
      name: "Marketing Studio",
      description:
        "Generate trackable QR codes and smart links, design branded flyers and posters that auto-pull your branding, and see exactly how many scans turned into real orders and revenue.",
      monthlyPriceCents: 999, // $9.99 placeholder — superadmin sets real price
      displayOrder: 96,
      enabledFeatures: ["marketing_studio"],
      // Held back from sale until release (Luigi 2026-06-13).
      comingSoon: true,
    },
    {
      // Kickstarter — launch / win-back campaign tools. The page lives under
      // /admin/kickstarter (built); this add-on gates it so FREE accounts see
      // a locked upsell. Split out from advanced_promos per Luigi 2026-06-11
      // ("separate add-on each"). Price is a placeholder until set + synced.
      slug: "kickstarter",
      inGrowthNet: true,
      name: "Kickstarter",
      description:
        "Launch your restaurant with ready-to-send campaigns — first-order incentives and win-back offers that bring customers in from day one.",
      monthlyPriceCents: 999, // $9.99 placeholder — superadmin sets real price
      displayOrder: 97,
      enabledFeatures: ["kickstarter"],
    },
    {
      // ContentPilot — the AI social media manager (Luigi 2026-06-11, named
      // by him). Auto-drafted posts from a quick weekly form, auto-scheduled
      // to the restaurant's platforms, weekly templates, fully automated
      // mode. The teaser copy used to squat on the FREE Social Media page;
      // it now lives at /admin/contentpilot under GrowthNet. comingSoon
      // until the feature actually ships; in the GrowthNet bundle from day
      // one so subscribers get it automatically at launch.
      slug: "contentpilot",
      inGrowthNet: true,
      name: "ContentPilot",
      description:
        "Your AI social media manager — fill in a quick weekly form (specials, events, promotions) and ContentPilot drafts polished posts you approve in one click, auto-scheduled to Instagram, Facebook, X and TikTok.",
      monthlyPriceCents: 1999, // $19.99 placeholder — superadmin sets the real price
      displayOrder: 98,
      enabledFeatures: ["contentpilot"],
      comingSoon: true,
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
      monthlyPriceCents: 999, // $9.99 — matches the LIVE prod AddOn row (seed said $19.99, stale; fixed 2026-07-12)
      displayOrder: 100,
      enabledFeatures: ["driver_pool"],
      // Dispatch + webhook + onboarding wizard are LIVE (2026-07-12). The
      // stale comingSoon:true here only affected fresh DB seeds — prod's
      // row is active and the marketing pages sell it as launching now.
      comingSoon: false,
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
        // GrowthNet membership IS re-applied on every seed — it's catalog
        // truth (which add-ons the bundle includes), not a superadmin-tuned
        // field like price/comingSoon.
        inGrowthNet: a.inGrowthNet ?? false,
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
        inGrowthNet: a.inGrowthNet ?? false,
        // Marketplace is seeded RETIRED — free + included, never sold, so it
        // never appears on the billing add-ons page. Everything else is active.
        isActive: a.slug !== "marketplace",
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
