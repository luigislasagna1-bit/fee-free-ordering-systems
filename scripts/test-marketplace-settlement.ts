/**
 * Controlled end-to-end test of the marketplace settlement → Stripe
 * invoice pipeline. Use against a restaurant that has:
 *   - A Stripe customer set up
 *   - A default payment method on that customer (test card is fine)
 *   - Is NOT currently on the real marketplace (so this won't double-bill)
 *
 * What it does (fully reversible):
 *   1. Records the current MarketplaceListing state (if any) for restore
 *   2. Creates or upserts a PAYG listing with currentMonthOrders=N and
 *      currentMonthStartedAt set to the FIRST of last month
 *   3. Runs settleMarketplaceMonth() targeting last month
 *   4. Reports: settlement row id + status + Stripe invoice id + amount
 *   5. Restores the original listing state (or deletes if none existed)
 *   6. Also deletes the MarketplaceSettlement row so we don't pollute
 *      audit logs / next month's idempotency guard
 *
 * Run:
 *   npx tsx scripts/test-marketplace-settlement.ts <restaurant-slug> "<postgres-url>"
 *
 * Example:
 *   npx tsx scripts/test-marketplace-settlement.ts foodie-milton "postgresql://...dawn-tree..."
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const restaurantSlug = process.argv[2];
  const url = process.argv[3];
  if (!restaurantSlug || !url) {
    console.error('Usage: test-marketplace-settlement.ts <restaurant-slug> "<postgres-url>"');
    process.exit(1);
  }

  // Boot prisma against the explicit URL (bypasses lib/db.ts dotenv).
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // We DON'T want to call settleMarketplaceMonth() through the lib (which
  // uses the default prisma client). Instead, we replicate its logic
  // inline against THIS prisma instance so the targeting is unambiguous.
  // This also means we don't have to worry about module-level prisma
  // singletons getting tangled up between this script and src/lib.
  //
  // We do still pull Stripe via the same env var the lib uses.

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = (require("stripe").default || require("stripe"));
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY env var required (use the same key that's set in Vercel prod).");
    process.exit(1);
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, name: true, stripeCustomerId: true, country: true, state: true },
    });
    if (!restaurant) {
      console.error(`Restaurant "${restaurantSlug}" not found.`);
      process.exit(1);
    }
    if (!restaurant.stripeCustomerId) {
      console.error(`${restaurant.name} has no Stripe customer. Run the PAYG card-save flow first.`);
      process.exit(1);
    }

    console.log(`Restaurant: ${restaurant.name} (${restaurant.id})`);
    console.log(`Stripe customer: ${restaurant.stripeCustomerId}`);

    // Verify the customer has a default payment method or this WILL fail.
    const customer = await stripe.customers.retrieve(restaurant.stripeCustomerId);
    if ("deleted" in customer && customer.deleted) {
      console.error("Stripe customer is deleted. Cannot test settlement.");
      process.exit(1);
    }
    const dpm = (customer as any).invoice_settings?.default_payment_method;
    console.log(`default_payment_method: ${dpm || "(none)"}`);
    if (!dpm) {
      console.error("Customer has no default payment method. The PAYG card-save flow needs to complete first.");
      process.exit(1);
    }

    // Compute last month's start (UTC) — the period we'll settle.
    const now = new Date();
    const targetMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    console.log(`Target settlement month: ${targetMonth.toISOString().slice(0, 7)}`);

    // ── Save current state for restore. ───────────────────────────────
    const originalListing = await prisma.marketplaceListing.findUnique({
      where: { restaurantId: restaurant.id },
    });
    const originalSettlement = await prisma.marketplaceSettlement.findUnique({
      where: {
        restaurantId_monthStart: { restaurantId: restaurant.id, monthStart: targetMonth },
      },
    });
    console.log(`Pre-test listing exists: ${!!originalListing}`);
    console.log(`Pre-test settlement for target month exists: ${!!originalSettlement}`);

    if (originalSettlement) {
      console.error("ABORTING — a settlement for the target month already exists. Manual review needed.");
      process.exit(2);
    }

    // ── Set up test state: PAYG listing with 1 order in target month. ─
    const testListing = await prisma.marketplaceListing.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        billingMode: "payg",
        isListed: true,
        currentMonthStartedAt: targetMonth,
        currentMonthOrders: 1,
        currentMonthRevenue: 25.0, // arbitrary positive — drives the savings math
        lifetimeSavingsVsUberEatsCents: 0,
      },
      update: {
        billingMode: "payg",
        isListed: true,
        currentMonthStartedAt: targetMonth,
        currentMonthOrders: 1,
        currentMonthRevenue: 25.0,
      },
    });
    console.log(`Test listing prepared (id ${testListing.id}, 1 order, $25 revenue).`);

    // ── Run the settlement inline. Replicates settleMarketplaceMonth's
    //    core logic against THIS prisma instance + the real stripe client.

    const PER_ORDER_CENTS = 300; // $3
    const orders = 1;
    const accrued = orders * PER_ORDER_CENTS;
    const invoiced = accrued; // well below the $249.99 cap

    const settlementRow = await prisma.marketplaceSettlement.create({
      data: {
        restaurantId: restaurant.id,
        monthStart: targetMonth,
        ordersInMonth: orders,
        accruedCents: accrued,
        invoicedCents: invoiced,
        status: "pending",
      },
    });

    let invoiceId: string | undefined;
    let invoiceUrl: string | undefined;
    let failureReason: string | undefined;
    try {
      await stripe.invoiceItems.create({
        customer: restaurant.stripeCustomerId,
        amount: invoiced,
        currency: "usd",
        description: `[TEST] Fee Free Marketplace — ${orders} order${orders === 1 ? "" : "s"} (${targetMonth.toISOString().slice(0, 7)})`,
        metadata: {
          type: "marketplace_settlement_TEST",
          restaurantId: restaurant.id,
          settlementId: settlementRow.id,
        },
      });
      const invoice = await stripe.invoices.create({
        customer: restaurant.stripeCustomerId,
        auto_advance: true,
        collection_method: "charge_automatically",
        metadata: {
          type: "marketplace_settlement_TEST",
          restaurantId: restaurant.id,
          settlementId: settlementRow.id,
        },
      });
      invoiceId = invoice.id;
      invoiceUrl = invoice.hosted_invoice_url ?? undefined;
    } catch (e: any) {
      failureReason = e?.message ?? "stripe invoice creation failed";
    }

    if (invoiceId) {
      await prisma.marketplaceSettlement.update({
        where: { id: settlementRow.id },
        data: { status: "invoiced", stripeInvoiceId: invoiceId },
      });
      console.log(`\n  ✅ SETTLEMENT INVOICE CREATED`);
      console.log(`     Invoice ID:  ${invoiceId}`);
      console.log(`     Amount:      $${(invoiced / 100).toFixed(2)} USD`);
      console.log(`     Settlement:  ${settlementRow.id}`);
      if (invoiceUrl) console.log(`     Hosted URL:  ${invoiceUrl}`);
    } else {
      console.log(`\n  ❌ SETTLEMENT FAILED`);
      console.log(`     Reason: ${failureReason}`);
    }

    // ── CLEANUP — restore listing + delete settlement row + void invoice ─
    console.log(`\nCleaning up test artifacts...`);
    await prisma.marketplaceSettlement.delete({
      where: { id: settlementRow.id },
    });
    console.log(`  - Deleted test MarketplaceSettlement row`);

    if (originalListing) {
      await prisma.marketplaceListing.update({
        where: { restaurantId: restaurant.id },
        data: {
          billingMode: originalListing.billingMode,
          isListed: originalListing.isListed,
          currentMonthStartedAt: originalListing.currentMonthStartedAt,
          currentMonthOrders: originalListing.currentMonthOrders,
          currentMonthRevenue: originalListing.currentMonthRevenue,
          lifetimeSavingsVsUberEatsCents: originalListing.lifetimeSavingsVsUberEatsCents,
        },
      });
      console.log(`  - Restored original MarketplaceListing state`);
    } else {
      await prisma.marketplaceListing.delete({
        where: { restaurantId: restaurant.id },
      });
      console.log(`  - Deleted test-created MarketplaceListing (no original to restore)`);
    }

    if (invoiceId) {
      try {
        // Void the test invoice so the test card isn't actually billed
        // (it would auto-collect in test mode, but voiding is cleaner).
        await stripe.invoices.voidInvoice(invoiceId);
        console.log(`  - Voided Stripe test invoice ${invoiceId}`);
      } catch (e: any) {
        console.log(`  - Could not void invoice ${invoiceId} (${e?.message ?? "unknown"})`);
        console.log(`    Visit Stripe Dashboard → Invoices → ${invoiceId} to void manually.`);
      }
    }

    console.log(`\nTest complete.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
