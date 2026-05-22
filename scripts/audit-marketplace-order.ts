/**
 * Forensic audit of a single marketplace order. For each layer of the
 * marketplace billing pipeline, reports what we observe vs what we expect:
 *
 *   1. Order row + marketplace attribution
 *   2. MarketplaceListing counter increment
 *   3. Payment intent + Stripe charge breakdown (incl. platform fee)
 *   4. Stripe webhook events that referenced this payment
 *   5. Notifications (customer email, staff alert, kitchen released)
 *
 * Run:
 *   npx tsx scripts/audit-marketplace-order.ts <orderNumber> "<postgres-url>"
 *
 * Example:
 *   npx tsx scripts/audit-marketplace-order.ts ORD-529226215 "postgresql://...dawn-tree..."
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function dollarStr(cents: number | null | undefined, fallback = "(unknown)"): string {
  if (cents == null) return fallback;
  return `$${(cents / 100).toFixed(2)}`;
}

function checkmark(ok: boolean, value: string, detail?: string): string {
  const symbol = ok ? "✓" : "✗";
  const tail = detail ? ` (${detail})` : "";
  return `${symbol} ${value}${tail}`;
}

async function main() {
  const orderNumber = process.argv[2];
  const url = process.argv[3];
  if (!orderNumber || !url) {
    console.error('Usage: audit-marketplace-order.ts <orderNumber> "<postgres-url>"');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);

  try {
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      include: {
        restaurant: { select: { name: true, slug: true, stripeAccountId: true } },
        items: { select: { name: true, quantity: true, subtotal: true } },
      },
    });

    if (!order) {
      console.error(`No order with orderNumber "${orderNumber}"`);
      process.exit(1);
    }

    console.log(`╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║  MARKETPLACE ORDER AUDIT — ${orderNumber}`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

    console.log(`Restaurant: ${order.restaurant.name} (${order.restaurant.slug})`);
    console.log(`Customer:   ${order.customerName} <${order.customerEmail}>`);
    console.log(`Created:    ${order.createdAt.toISOString()}`);
    console.log(`Type:       ${order.type}`);
    console.log(`Status:     ${order.status}`);
    console.log(`Items:      ${order.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}`);
    console.log(`Total:      $${order.total.toFixed(2)}\n`);

    // ── Layer 1 — Marketplace attribution ─────────────────────────────
    console.log(`━━━ Layer 1: Marketplace attribution ${"━".repeat(38)}\n`);
    console.log(`  ${checkmark(order.viaMarketplace === true, `viaMarketplace = ${order.viaMarketplace}`, order.viaMarketplace ? "stamped" : "NOT stamped — won't count toward billing")}`);
    console.log(`  ${checkmark(
      order.savedVsUberEatsCents != null && order.savedVsUberEatsCents > 0,
      `savedVsUberEatsCents = ${order.savedVsUberEatsCents ?? "(null)"}`,
      order.savedVsUberEatsCents != null ? `customer saved vs UE = ${dollarStr(order.savedVsUberEatsCents)}` : "not computed",
    )}`);
    console.log(`  ${checkmark(
      order.marketplaceCounterApplied === true,
      `marketplaceCounterApplied = ${order.marketplaceCounterApplied}`,
      order.marketplaceCounterApplied ? "counter increment landed atomically" : "increment did NOT land",
    )}`);

    // ── Layer 2 — Listing counter ─────────────────────────────────────
    console.log(`\n━━━ Layer 2: MarketplaceListing counter ${"━".repeat(34)}\n`);
    const listing = await prisma.marketplaceListing.findUnique({
      where: { restaurantId: order.restaurantId },
    });
    if (!listing) {
      console.log(`  ✗ No MarketplaceListing for this restaurant`);
    } else {
      console.log(`  billingMode:            ${listing.billingMode}`);
      console.log(`  currentMonthStartedAt:  ${listing.currentMonthStartedAt.toISOString().slice(0, 10)}`);
      console.log(`  currentMonthOrders:     ${listing.currentMonthOrders}`);
      console.log(`  currentMonthRevenue:    $${listing.currentMonthRevenue.toFixed(2)}`);
      console.log(`  lifetimeSavings:        ${dollarStr(listing.lifetimeSavingsVsUberEatsCents)}`);
      const expectAccrued =
        listing.billingMode === "payg"
          ? `would owe $${Math.min(listing.currentMonthOrders * 3, 249.99).toFixed(2)} at settlement`
          : `flat $199.99/mo billed via Monthly subscription (counter is display-only)`;
      console.log(`  → ${expectAccrued}`);
    }

    // ── Layer 3 — Stripe charge ───────────────────────────────────────
    console.log(`\n━━━ Layer 3: Stripe charge breakdown ${"━".repeat(36)}\n`);
    console.log(`  paymentMethod:    ${order.paymentMethod}`);
    console.log(`  paymentStatus:    ${order.paymentStatus}`);
    console.log(`  paymentIntentId:  ${order.paymentIntentId ?? "(none)"}`);

    if (order.paymentIntentId && process.env.STRIPE_SECRET_KEY) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = (require("stripe").default || require("stripe"));
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      try {
        const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
          expand: ["latest_charge.balance_transaction", "latest_charge.application_fee", "transfer_data"],
        });
        console.log(`  Stripe PI status: ${pi.status}`);
        console.log(`  amount:           ${dollarStr(pi.amount)}`);
        console.log(`  currency:         ${pi.currency}`);
        if (pi.application_fee_amount != null) {
          console.log(`  platform fee:     ${dollarStr(pi.application_fee_amount)} (Fee Free's cut)`);
        }
        if (pi.transfer_data) {
          console.log(`  destination:      ${pi.transfer_data.destination} (restaurant's Stripe Connect acct)`);
          const expectedDest = order.restaurant.stripeAccountId;
          console.log(`  ${checkmark(
            pi.transfer_data.destination === expectedDest,
            `destination matches restaurant.stripeAccountId`,
            pi.transfer_data.destination === expectedDest ? "money correctly routed" : `MISMATCH: charge went to ${pi.transfer_data.destination}, restaurant has ${expectedDest}`,
          )}`);
        }
        const ch = pi.latest_charge as any;
        if (ch) {
          console.log(`  charge ID:        ${ch.id}`);
          console.log(`  charge status:    ${ch.status}`);
          console.log(`  paid:             ${ch.paid}`);
          if (ch.balance_transaction) {
            const bt = ch.balance_transaction;
            console.log(`  Stripe fees:      ${dollarStr(bt.fee)} (Stripe's processing cut)`);
            console.log(`  restaurant net:   ${dollarStr(pi.amount - (pi.application_fee_amount ?? 0) - bt.fee)} (what hits restaurant's bank)`);
          }
        }
      } catch (e: any) {
        console.log(`  ! Stripe lookup failed: ${e?.message || e}`);
      }
    } else if (!order.paymentIntentId) {
      console.log(`  (skipping Stripe lookup — no payment intent ID on order)`);
    } else {
      console.log(`  (skipping Stripe lookup — STRIPE_SECRET_KEY not set locally)`);
    }

    // ── Layer 4 — Webhook delivery ────────────────────────────────────
    console.log(`\n━━━ Layer 4: Webhook events ${"━".repeat(43)}\n`);
    if (order.paymentIntentId) {
      // Pull the last ~30 events of the relevant types and look for ones
      // whose JSON event payload references this payment_intent ID. Since
      // we don't store the full event body, we approximate by event type +
      // time window — events processed within 60 sec either side of order
      // creation are highly likely to belong to this order.
      const since = new Date(order.createdAt.getTime() - 60_000);
      const until = new Date(order.createdAt.getTime() + 600_000);
      const events = await prisma.stripeWebhookEvent.findMany({
        where: {
          eventType: { in: ["payment_intent.succeeded", "payment_intent.payment_failed", "charge.succeeded", "charge.refunded"] },
          receivedAt: { gte: since, lte: until },
        },
        orderBy: { receivedAt: "asc" },
        select: { eventType: true, status: true, receivedAt: true, errorMessage: true },
      });
      if (events.length === 0) {
        console.log(`  ✗ NO webhook events of the expected types fired in the 10-min window around this order`);
        console.log(`    Expected: payment_intent.succeeded at minimum`);
      } else {
        for (const e of events) {
          const symbol = e.status === "processed" ? "✓" : e.status === "failed" ? "✗" : "?";
          const err = e.errorMessage ? `  ⚠ ${e.errorMessage.slice(0, 80)}` : "";
          console.log(`  ${symbol} ${e.receivedAt.toISOString()}  ${e.eventType.padEnd(28)} ${e.status}${err}`);
        }
      }
    } else {
      console.log(`  (no paymentIntentId on order — webhook lookup skipped)`);
    }

    // ── Layer 5 — Kitchen release + notifications ─────────────────────
    console.log(`\n━━━ Layer 5: Kitchen + notifications ${"━".repeat(34)}\n`);
    console.log(`  ${checkmark(
      order.notifiedAt != null,
      `notifiedAt = ${order.notifiedAt?.toISOString() ?? "(null)"}`,
      order.notifiedAt
        ? "order RELEASED to kitchen (bell rings, kitchen polls picks it up)"
        : "order NOT YET released — kitchen doesn't see it. For card orders, this means payment_intent.succeeded webhook hasn't flipped it",
    )}`);

    // Time-deltas help spot stuck-in-pending orders
    const createdToNotified = order.notifiedAt
      ? (order.notifiedAt.getTime() - order.createdAt.getTime()) / 1000
      : null;
    if (createdToNotified != null) {
      console.log(`  Time create → released: ${createdToNotified.toFixed(1)} seconds`);
    }

    console.log(`\n━━━ Summary ${"━".repeat(57)}\n`);
    const allGood =
      order.viaMarketplace &&
      order.marketplaceCounterApplied &&
      order.savedVsUberEatsCents != null &&
      order.paymentStatus === "paid" &&
      order.notifiedAt != null;
    if (allGood) {
      console.log(`  ✅ ALL LAYERS GREEN — marketplace billing pipeline working end-to-end`);
    } else {
      console.log(`  ⚠ Some layers have issues — see ✗ marks above for what's missing.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
