/**
 * Comprehensive Stripe audit across every surface that touches Stripe.
 *
 * Read-only. Reports what's configured, what's working, what's missing,
 * what needs action. Doesn't modify anything.
 *
 * Surfaces checked:
 *   1. Platform Stripe config (secret key, publishable key, webhook secret)
 *   2. Stripe API connectivity (does the key actually work?)
 *   3. SubscriptionPlan catalog → Stripe Price sync state
 *   4. AddOn catalog → Stripe Price sync state
 *   5. Restaurant Connect accounts (how many connected, charges enabled, payouts)
 *   6. Active subscriptions (platform plan + add-ons)
 *   7. Webhook event log — has Stripe ever delivered events?
 *
 * Usage:
 *   npx tsx scripts/audit-stripe.ts <db-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import Stripe from "stripe";

const url = process.argv[2];
if (!url) { console.error("Usage: npx tsx scripts/audit-stripe.ts <db-url>"); process.exit(1); }

function ok(s: string) { console.log("\x1b[32m✅\x1b[0m " + s); }
function warn(s: string) { console.log("\x1b[33m⚠️ \x1b[0m " + s); }
function bad(s: string) { console.log("\x1b[31m❌\x1b[0m " + s); }
function info(s: string) { console.log("   " + s); }
function section(s: string) { console.log("\n" + "═".repeat(70) + "\n " + s + "\n" + "═".repeat(70)); }

async function main() {
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ─── 1. Platform Stripe configuration ───────────────────────────────
  section("1. Platform Stripe Configuration  (/superadmin/settings/stripe)");

  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    bad("PlatformSettings row doesn't exist yet — superadmin has never saved Stripe config");
    info("Action: go to /superadmin/settings/stripe and save keys");
    await prisma.$disconnect();
    return;
  }

  const mode = settings.stripeMode;
  const enabled = settings.stripeEnabled;
  const hasSecret = !!settings.stripeSecretKeyEnc && !!settings.stripeSecretKeyIv && !!settings.stripeSecretKeyTag;
  const hasPublishable = !!settings.stripePublishableKey;
  const hasWebhook = !!settings.stripeWebhookSecretEnc && !!settings.stripeWebhookSecretIv && !!settings.stripeWebhookSecretTag;

  console.log(`Mode:            ${mode || "(not set)"}`);
  console.log(`Enabled flag:    ${enabled ? "✅ on" : "❌ off"}`);
  console.log(`Secret key:      ${hasSecret ? "✅ encrypted in DB" : "❌ missing"}`);
  console.log(`Publishable key: ${hasPublishable ? `✅ ${settings.stripePublishableKey?.slice(0, 12)}…` : "❌ missing"}`);
  console.log(`Webhook secret:  ${hasWebhook ? "✅ encrypted in DB" : "❌ missing"}`);

  if (!hasSecret || !hasPublishable) {
    bad("Stripe is NOT configured — most features will fail");
    info("Action: go to /superadmin/settings/stripe and save your secret + publishable keys");
    info("Get keys from https://dashboard.stripe.com/apikeys");
  }
  if (!hasWebhook) {
    warn("Webhook secret missing — Stripe events won't be processed (subscriptions, refunds, etc.)");
    info("Action: in Stripe Dashboard → Developers → Webhooks → Add endpoint");
    info(`        URL: ${process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app"}/api/webhooks/stripe`);
    info("        Events: customer.subscription.*, invoice.*, account.*, payment_intent.*, charge.*");
    info("        Then copy the signing secret into /superadmin/settings/stripe");
  }

  // ─── 2. Stripe API connectivity ─────────────────────────────────────
  section("2. Stripe API Connectivity  (can we actually call Stripe?)");

  let stripe: Stripe | null = null;
  if (hasSecret) {
    try {
      // Read the encrypted secret key the same way the app does
      const { decrypt } = await import("../src/lib/encrypt");
      const encKey = process.env.ENCRYPTION_KEY;
      if (!encKey) {
        bad("ENCRYPTION_KEY env var not set — can't decrypt the secret key for this test");
        info("This script is local; if the app runs on Vercel it has ENCRYPTION_KEY set there");
      } else {
        const secret = decrypt(
          settings.stripeSecretKeyEnc!,
          settings.stripeSecretKeyIv!,
          settings.stripeSecretKeyTag!
        );
        stripe = new Stripe(secret, { apiVersion: "2025-09-30.clover" as any });
        // The no-arg form returns the platform account (matches the secret key).
        // TS types in newer Stripe SDK want an explicit id; cast to any.
        const account = await (stripe.accounts as any).retrieve();
        ok(`API call succeeded`);
        info(`Account: ${account.id} (${account.country})`);
        info(`Charges enabled on platform account: ${account.charges_enabled ? "yes" : "no"}`);
        info(`Default currency: ${account.default_currency}`);
        if (account.type !== "standard") {
          warn(`Platform account type is "${account.type}" — usually "standard" for direct platforms`);
        }
      }
    } catch (err: any) {
      bad(`Stripe API call FAILED: ${err?.message ?? err}`);
      info("Likely: secret key is invalid, expired, or pointing at wrong mode (test vs live)");
    }
  } else {
    warn("Skipped (no secret key)");
  }

  // ─── 3. SubscriptionPlan sync state ─────────────────────────────────
  section("3. Subscription Plans  (/superadmin/billing/plans)");

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } });
  console.log(`Total plans: ${plans.length}`);
  for (const p of plans) {
    const synced = !!p.stripePriceId;
    const tag = !p.isActive ? "(inactive)" : "";
    const sync = synced ? `✅ ${p.stripePriceId}` : (p.price === 0 ? "— (free plan, no Stripe needed)" : "❌ NOT synced");
    console.log(`  ${p.slug.padEnd(15)} $${p.price.toFixed(2).padStart(7)} ${tag.padEnd(12)} ${sync}`);
  }

  // ─── 4. AddOn sync state ────────────────────────────────────────────
  section("4. Add-Ons  (/superadmin/add-ons)");

  const addOns = await prisma.addOn.findMany({ orderBy: { displayOrder: "asc" } });
  console.log(`Total add-ons: ${addOns.length}`);
  for (const a of addOns) {
    const synced = !!a.stripePriceId;
    const dollars = (a.monthlyPriceCents / 100).toFixed(2);
    const tag = !a.isActive ? "(inactive)" : "";
    const sync = synced ? `✅ ${a.stripePriceId}` : (a.monthlyPriceCents === 0 ? "❌ NO PRICE SET" : "❌ priced but NOT synced");
    console.log(`  ${a.slug.padEnd(22)} $${dollars.padStart(7)} ${tag.padEnd(12)} ${sync}`);
  }

  const needSync = addOns.filter((a) => a.isActive && a.monthlyPriceCents > 0 && !a.stripePriceId);
  if (needSync.length > 0) {
    warn(`${needSync.length} active add-on(s) priced but not synced → restaurants can't subscribe yet`);
    info("Action: go to /superadmin/add-ons and click Sync on each");
  }

  // ─── 5. Restaurant Connect accounts ─────────────────────────────────
  section("5. Restaurant Stripe Connect Accounts  (/admin/payments/providers)");

  const restaurants = await prisma.restaurant.findMany({
    select: {
      slug: true, stripeAccountId: true, stripeAccountStatus: true,
      stripeChargesEnabled: true, stripePayoutsEnabled: true, isActive: true,
    },
  });
  const connected = restaurants.filter((r) => r.stripeAccountId);
  const chargesOn = restaurants.filter((r) => r.stripeChargesEnabled);

  console.log(`Total restaurants:                    ${restaurants.length}`);
  console.log(`Restaurants with Connect account:     ${connected.length}`);
  console.log(`Restaurants accepting cards (charges_enabled): ${chargesOn.length}`);
  if (connected.length === 0) {
    info("No restaurant has connected Stripe yet — expected for a fresh launch");
  } else {
    for (const r of connected) {
      const ok2 = r.stripeChargesEnabled && r.stripePayoutsEnabled;
      console.log(`  ${ok2 ? "✅" : "⚠️ "} ${r.slug.padEnd(20)} status=${r.stripeAccountStatus} charges=${r.stripeChargesEnabled} payouts=${r.stripePayoutsEnabled}`);
    }
  }

  // ─── 6. Active subscriptions ────────────────────────────────────────
  section("6. Active Subscriptions  (platform plan + add-ons)");

  // Platform plan subs
  const platformSubs = await prisma.restaurant.findMany({
    where: { stripeSubscriptionId: { not: null } },
    select: { slug: true, subscriptionStatus: true, currentPeriodEnd: true, stripeSubscriptionId: true },
  });
  console.log(`Platform subscriptions (restaurant pays platform): ${platformSubs.length}`);
  for (const s of platformSubs) {
    console.log(`  ${s.slug.padEnd(20)} status=${s.subscriptionStatus.padEnd(12)} sub=${s.stripeSubscriptionId}`);
  }

  // Add-on subs
  const addOnSubs = await prisma.restaurantAddOn.findMany({
    include: { addOn: { select: { slug: true } }, restaurant: { select: { slug: true } } },
  });
  console.log(`\nAdd-on subscriptions: ${addOnSubs.length}`);
  for (const s of addOnSubs) {
    console.log(`  ${s.restaurant.slug.padEnd(20)} ${s.addOn.slug.padEnd(20)} status=${s.status}`);
  }

  // ─── 7. Webhook event log ───────────────────────────────────────────
  section("7. Stripe Webhook Events  (/api/webhooks/stripe)");

  const events = await prisma.stripeWebhookEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 10,
  });
  console.log(`Total events ever received: ${await prisma.stripeWebhookEvent.count()}`);
  if (events.length === 0) {
    warn("No webhook events ever received — Stripe might not have your webhook URL configured");
    info(`Expected URL: ${process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app"}/api/webhooks/stripe`);
    info("Action: Stripe Dashboard → Developers → Webhooks → Add endpoint");
  } else {
    console.log(`Recent events:`);
    for (const e of events) {
      const icon = e.status === "processed" ? "✅" : e.status === "ignored" ? "⏭ " : "❌";
      console.log(`  ${icon} ${e.eventType.padEnd(40)} ${e.status.padEnd(12)} ${e.receivedAt.toISOString()}`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────
  section("Summary & Next Actions");

  const actions: string[] = [];
  if (!hasSecret || !hasPublishable) actions.push("Configure Stripe keys at /superadmin/settings/stripe");
  if (!hasWebhook) actions.push("Configure Stripe webhook in Stripe Dashboard + paste signing secret into superadmin settings");
  if (needSync.length > 0) actions.push(`Sync ${needSync.length} priced add-on(s) to Stripe`);
  if (events.length === 0 && hasSecret) actions.push("Verify the webhook endpoint is reachable from Stripe");

  if (actions.length === 0) {
    ok("Everything looks configured — ready for end-to-end testing");
  } else {
    console.log("Required actions:");
    actions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error("Audit threw:", e); process.exit(1); });
