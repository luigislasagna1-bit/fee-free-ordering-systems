/**
 * Read-only audit of Stripe webhook endpoints + event subscriptions.
 *
 * Lists every configured webhook endpoint on the Stripe account, prints
 * which events each one subscribes to, and flags whether the events we
 * actually rely on (subscription, invoice, account, payment_intent,
 * charge, checkout.session.completed, setup_intent.succeeded) are
 * covered by at least one endpoint.
 *
 * Run: `npx tsx scripts/check-stripe-webhooks.ts`
 */
import Stripe from "stripe";
import "dotenv/config";

const required = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "account.updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "checkout.session.completed",
  "setup_intent.succeeded",
];

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || /placeholder|sk_test_.*lder/.test(key)) {
    console.error("STRIPE_SECRET_KEY missing or is a placeholder.");
    console.error("Locally the real key lives only in Vercel prod; this script");
    console.error("can only run in an environment where the live key is set.");
    process.exit(1);
  }
  const stripe = new Stripe(key);
  const eps = await stripe.webhookEndpoints.list({ limit: 100 });

  console.log(`Found ${eps.data.length} webhook endpoint(s):\n`);
  const covered = new Set<string>();
  for (const ep of eps.data) {
    console.log(`  ${ep.url}`);
    console.log(`    id: ${ep.id}`);
    console.log(`    status: ${ep.status}`);
    console.log(`    events: ${ep.enabled_events.length}`);
    const wildcard = ep.enabled_events.includes("*");
    if (wildcard) {
      console.log(`    (subscribes to ALL events via *)`);
      for (const r of required) covered.add(r);
    } else {
      for (const e of ep.enabled_events) covered.add(e);
    }
    console.log();
  }

  console.log("Coverage check for events our handlers depend on:");
  let missing = 0;
  for (const r of required) {
    if (covered.has(r)) {
      console.log(`  OK   ${r}`);
    } else {
      console.log(`  MISS ${r}`);
      missing++;
    }
  }
  if (missing > 0) {
    console.log(`\n${missing} event(s) NOT subscribed to by any endpoint.`);
    process.exit(2);
  }
  console.log("\nAll required events are covered.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
