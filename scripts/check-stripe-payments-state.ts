/**
 * Read-only audit of a restaurant's online-card-payments wiring. Reports
 * every signal the customer-facing order page consults to decide whether
 * to show "Pay online (Card)" vs "Coming soon / pay on pickup":
 *
 *   - Restaurant.stripeAccountStatus / stripeChargesEnabled (Connect)
 *   - PaymentProvider row (legacy direct-charge flow)
 *   - Active online_payments add-on (card_payments entitlement)
 *   - Restaurant.paymentMethods JSON (what the owner picked)
 *
 * Identifies WHICH signal is failing and what the order page would do.
 *
 * Run:
 *   npx tsx scripts/check-stripe-payments-state.ts <slug> "<postgres-url>"
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const slug = process.argv[2];
  const url = process.argv[3];
  if (!slug || !url) {
    console.error('Usage: check-stripe-payments-state.ts <slug> "<postgres-url>"');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);

  try {
    const r = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        paymentMethods: true,
      },
    });
    if (!r) {
      console.error(`No restaurant with slug "${slug}"`);
      process.exit(1);
    }
    console.log(`Restaurant: ${r.name} (${r.id})\n`);

    console.log(`STRIPE CONNECT:`);
    console.log(`  stripeAccountId:       ${r.stripeAccountId ?? "(none)"}`);
    console.log(`  stripeAccountStatus:   ${r.stripeAccountStatus ?? "(unknown)"}`);
    console.log(`  stripeChargesEnabled:  ${r.stripeChargesEnabled}`);
    console.log(`  stripePayoutsEnabled:  ${r.stripePayoutsEnabled}`);
    const stripeConnectLive = r.stripeAccountStatus === "connected" && !!r.stripeChargesEnabled;
    console.log(`  → Connect LIVE for charges: ${stripeConnectLive ? "YES" : "NO"}`);

    console.log(`\nLEGACY PaymentProvider:`);
    const pp = await prisma.paymentProvider.findFirst({
      where: { restaurantId: r.id, isActive: true },
      select: { id: true, provider: true, isActive: true },
    });
    if (pp) {
      console.log(`  active row: ${pp.id} (provider=${pp.provider})`);
    } else {
      console.log(`  (no active PaymentProvider row)`);
    }

    console.log(`\nADD-ON ENTITLEMENTS:`);
    const addOns = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: r.id },
      include: { addOn: { select: { slug: true, name: true, enabledFeatures: true } } },
    });
    if (addOns.length === 0) {
      console.log(`  (no RestaurantAddOn rows)`);
    } else {
      for (const a of addOns) {
        const features = (() => {
          try {
            const v = JSON.parse(a.addOn.enabledFeatures || "[]");
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        })();
        console.log(`  ${a.addOn.slug.padEnd(25)} status=${a.status.padEnd(10)} features=${JSON.stringify(features)}`);
      }
    }
    const hasCardPayments = addOns.some(
      (a) =>
        (a.status === "active" || a.status === "trialing") &&
        (() => {
          try {
            const f = JSON.parse(a.addOn.enabledFeatures || "[]");
            return Array.isArray(f) && f.includes("card_payments");
          } catch {
            return false;
          }
        })(),
    );
    console.log(`  → card_payments entitlement: ${hasCardPayments ? "YES" : "NO"}`);

    console.log(`\nACCEPTED PAYMENT METHODS (owner-selected):`);
    let methods: string[] = [];
    if (r.paymentMethods) {
      try {
        const parsed = JSON.parse(r.paymentMethods);
        if (Array.isArray(parsed)) methods = parsed.filter((s) => typeof s === "string");
      } catch {}
    }
    console.log(`  ${JSON.stringify(methods)}`);

    console.log(`\n=== DIAGNOSIS ===`);
    const cardPaymentEnabled = hasCardPayments && (stripeConnectLive || !!pp);
    console.log(`Order page cardPaymentEnabled would be: ${cardPaymentEnabled ? "TRUE" : "FALSE"}`);
    if (!cardPaymentEnabled) {
      const missing: string[] = [];
      if (!hasCardPayments) missing.push("ACTIVE online_payments add-on subscription");
      if (!stripeConnectLive && !pp) {
        missing.push("Stripe Connect (charges enabled) OR a legacy PaymentProvider row");
      }
      console.log(`Missing: ${missing.join(" + ")}`);
    } else {
      console.log(`Order page should show "Pay online (Card)" without the "coming soon" warning.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
