/**
 * One-shot reconciler — for every Restaurant with a stripeCustomerId,
 * pull the customer from Stripe and verify the name + email +
 * metadata.restaurantId all match what's in our DB. Patch any that don't.
 *
 * Why: discovered 2026-05-21 that "Ristorante Test" was showing
 * "Luigis Lasagna & Pizzeria Inc." on Stripe Checkout pages because the
 * customer was created with a stale name and ensureStripeCustomerForRestaurant
 * never reconciled. Going forward, that function reconciles on every call;
 * this script is for the existing backlog.
 *
 * Read-only by default — pass --apply to actually update Stripe.
 *
 * Run:
 *   npx tsx scripts/reconcile-stripe-customer-names.ts          # dry run
 *   npx tsx scripts/reconcile-stripe-customer-names.ts --apply  # commit
 */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require("@/lib/db").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeMod = require("stripe");
const Stripe = StripeMod.default || StripeMod;

async function main() {
  const apply = process.argv.includes("--apply");
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || /placeholder|sk_test_.*lder/.test(key)) {
    console.error("STRIPE_SECRET_KEY missing or placeholder. Set the real key first.");
    process.exit(1);
  }
  const stripe = new Stripe(key);

  const restaurants = await prisma.restaurant.findMany({
    where: { stripeCustomerId: { not: null } },
    select: { id: true, name: true, email: true, stripeCustomerId: true, slug: true },
  });

  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`Checking ${restaurants.length} restaurants with Stripe customers...\n`);

  let checked = 0;
  let drifted = 0;
  let patched = 0;
  let failed = 0;

  for (const r of restaurants) {
    checked++;
    try {
      const customer = await stripe.customers.retrieve(r.stripeCustomerId);
      if ("deleted" in customer && customer.deleted) {
        console.log(`  SKIP ${r.slug.padEnd(40)} customer ${r.stripeCustomerId} is deleted on Stripe`);
        continue;
      }
      const c = customer as { name?: string | null; email?: string | null; metadata?: Record<string, string> };
      const expectedName = r.name;
      const expectedEmail = r.email || null;
      const nameDrift = (c.name || "") !== expectedName;
      const emailDrift = (c.email || null) !== expectedEmail;
      const metadataDrift = (c.metadata?.restaurantId || "") !== r.id;

      if (!nameDrift && !emailDrift && !metadataDrift) {
        console.log(`  OK   ${r.slug.padEnd(40)} ${r.stripeCustomerId}`);
        continue;
      }

      drifted++;
      const driftParts: string[] = [];
      if (nameDrift) driftParts.push(`name: "${c.name ?? ""}" → "${expectedName}"`);
      if (emailDrift) driftParts.push(`email: "${c.email ?? ""}" → "${expectedEmail ?? ""}"`);
      if (metadataDrift) driftParts.push(`metadata.restaurantId: "${c.metadata?.restaurantId ?? ""}" → "${r.id}"`);
      console.log(`  ${apply ? "FIX " : "DIFF"} ${r.slug.padEnd(40)} ${r.stripeCustomerId}`);
      driftParts.forEach((p) => console.log(`         ${p}`));

      if (apply) {
        await stripe.customers.update(r.stripeCustomerId, {
          name: expectedName,
          email: expectedEmail || undefined,
          metadata: { ...(c.metadata || {}), restaurantId: r.id },
        });
        patched++;
      }
    } catch (e: any) {
      failed++;
      console.log(`  FAIL ${r.slug.padEnd(40)} ${r.stripeCustomerId}  — ${e?.message || String(e)}`);
    }
  }

  console.log(`\nChecked: ${checked}`);
  console.log(`Drifted: ${drifted}`);
  console.log(`Patched: ${patched}${apply ? "" : "  (dry run — re-run with --apply)"}`);
  console.log(`Failed:  ${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
