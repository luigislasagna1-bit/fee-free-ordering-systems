/**
 * Marketplace monthly settlement engine.
 *
 * For each restaurant that had marketplace activity in a given calendar
 * month, this module:
 *   1. Reads the listing's currentMonthOrders (the running counter)
 *   2. Computes effectiveCents = min(orders × $3, $249.99 cap)
 *   3. Creates a `MarketplaceSettlement` row capturing the bill
 *   4. Issues a Stripe invoice on the restaurant's customer
 *   5. Resets the listing's counters so the next month starts at 0
 *
 * Idempotent on (restaurantId, monthStart) — re-running for an already-
 * settled month is a no-op. Safe to retry partial failures.
 *
 * Triggered by:
 *   - A Vercel cron at 00:05 UTC on the 1st of each month (recommended)
 *   - Manual POST /api/cron/marketplace-settle?month=YYYY-MM by superadmin
 *
 * NOTE: This is the "compute + persist + issue invoice" layer. The
 * actual Stripe collection (the customer paying the invoice) happens
 * asynchronously and is reflected via Stripe webhooks flipping
 * MarketplaceSettlement.status from "invoiced" → "paid".
 */

import prisma from "@/lib/db";
import {
  MARKETPLACE_MONTHLY_CAP_CENTS,
  MARKETPLACE_PER_ORDER_CENTS,
} from "@/lib/marketplace";
import { getStripe, stripeReady } from "@/lib/stripe";

export type SettlementResult = {
  restaurantId: string;
  restaurantName: string;
  monthStart: Date;
  ordersInMonth: number;
  accruedCents: number;
  invoicedCents: number;
  status: "invoiced" | "void" | "failed" | "skipped";
  stripeInvoiceId?: string;
  reason?: string;
};

/** First moment (UTC) of the calendar month that contains `d`. */
export function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First moment (UTC) of the calendar month BEFORE the one that contains `d`. */
export function previousMonthStartUtc(d: Date): Date {
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  return m === 0
    ? new Date(Date.UTC(y - 1, 11, 1))
    : new Date(Date.UTC(y, m - 1, 1));
}

/**
 * Settle the month that just CLOSED (the month before `now`). The cron
 * is meant to fire on the 1st of the new month, so the target month
 * is the prior one — the one whose counters are now frozen.
 *
 * Pass `monthStart` explicitly when re-running for a specific month
 * (e.g. superadmin manual settlement).
 */
export async function settleMarketplaceMonth(opts: { now?: Date; monthStart?: Date } = {}): Promise<{
  monthStart: Date;
  results: SettlementResult[];
}> {
  const now = opts.now ?? new Date();
  const targetMonth = opts.monthStart ?? previousMonthStartUtc(now);

  // Every listing with at least 1 order in the period is eligible.
  // We use the listing's counter because it's the canonical "orders
  // attributable to marketplace this month" — Order.viaMarketplace
  // is also true on those rows, but the counter is authoritative since
  // it's what recordMarketplaceOrder() bumps once per order.
  const candidates = await prisma.marketplaceListing.findMany({
    select: {
      id: true,
      restaurantId: true,
      currentMonthOrders: true,
      currentMonthStartedAt: true,
      restaurant: { select: { name: true, stripeCustomerId: true } },
    },
  });

  const results: SettlementResult[] = [];
  const stripe = (await stripeReady()) ? await getStripe() : null;

  for (const c of candidates) {
    // Skip listings whose counters don't belong to the target month —
    // they may have already rolled over to a NEW month (the order
    // POST resets counters on month change), in which case we have
    // no data for the target month and should skip.
    const counterMonth = monthStartUtc(c.currentMonthStartedAt);
    const sameMonth = counterMonth.getTime() === targetMonth.getTime();
    if (!sameMonth) {
      results.push({
        restaurantId: c.restaurantId,
        restaurantName: c.restaurant.name,
        monthStart: targetMonth,
        ordersInMonth: 0,
        accruedCents: 0,
        invoicedCents: 0,
        status: "skipped",
        reason: "counter not aligned with target month",
      });
      continue;
    }

    const orders = c.currentMonthOrders;
    const accrued = orders * MARKETPLACE_PER_ORDER_CENTS;
    const invoiced = Math.min(accrued, MARKETPLACE_MONTHLY_CAP_CENTS);

    // Idempotency guard — already settled?
    const existing = await prisma.marketplaceSettlement.findUnique({
      where: { restaurantId_monthStart: { restaurantId: c.restaurantId, monthStart: targetMonth } },
    });
    if (existing) {
      results.push({
        restaurantId: c.restaurantId,
        restaurantName: c.restaurant.name,
        monthStart: targetMonth,
        ordersInMonth: existing.ordersInMonth,
        accruedCents: existing.accruedCents,
        invoicedCents: existing.invoicedCents,
        status: existing.status === "void" ? "void" : "skipped",
        stripeInvoiceId: existing.stripeInvoiceId ?? undefined,
        reason: "already settled",
      });
      continue;
    }

    // Zero-order month — record a void settlement so we have a clean
    // audit row and don't try again next time.
    if (orders === 0) {
      await prisma.marketplaceSettlement.create({
        data: {
          restaurantId: c.restaurantId,
          monthStart: targetMonth,
          ordersInMonth: 0,
          accruedCents: 0,
          invoicedCents: 0,
          status: "void",
        },
      });
      // Reset counter so the new month starts clean.
      await prisma.marketplaceListing.update({
        where: { id: c.id },
        data: {
          currentMonthOrders: 0,
          currentMonthRevenue: 0,
          currentMonthStartedAt: monthStartUtc(now),
        },
      });
      results.push({
        restaurantId: c.restaurantId,
        restaurantName: c.restaurant.name,
        monthStart: targetMonth,
        ordersInMonth: 0,
        accruedCents: 0,
        invoicedCents: 0,
        status: "void",
      });
      continue;
    }

    // Real settlement — create the row in "pending" state first so we
    // can recover if the Stripe call fails mid-flight.
    const settlement = await prisma.marketplaceSettlement.create({
      data: {
        restaurantId: c.restaurantId,
        monthStart: targetMonth,
        ordersInMonth: orders,
        accruedCents: accrued,
        invoicedCents: invoiced,
        status: "pending",
      },
    });

    // Issue the Stripe invoice. Requires (a) Stripe configured globally,
    // (b) the restaurant has a Stripe customer ID. If either is missing
    // we mark the settlement "failed" with a reason and move on — the
    // operator can resolve and re-run.
    let invoiceId: string | undefined;
    let failureReason: string | undefined;
    if (!stripe) {
      failureReason = "Stripe not configured on platform";
    } else if (!c.restaurant.stripeCustomerId) {
      failureReason = "Restaurant has no Stripe customer ID (no prior subscription)";
    } else {
      try {
        // Step 1: create the InvoiceItem (the line item).
        await stripe.invoiceItems.create({
          customer: c.restaurant.stripeCustomerId,
          amount: invoiced, // cents
          currency: "usd",
          description: `Fee Free Marketplace — ${orders} order${orders === 1 ? "" : "s"} (${monthLabel(targetMonth)})`,
          metadata: {
            type: "marketplace_settlement",
            restaurantId: c.restaurantId,
            monthStart: targetMonth.toISOString(),
            ordersInMonth: String(orders),
            settlementId: settlement.id,
          },
        });
        // Step 2: create + finalize the invoice. auto_advance=true tells
        // Stripe to attempt collection immediately (using the customer's
        // default payment method if set).
        const invoice = await stripe.invoices.create({
          customer: c.restaurant.stripeCustomerId,
          auto_advance: true,
          collection_method: "charge_automatically",
          metadata: {
            type: "marketplace_settlement",
            restaurantId: c.restaurantId,
            monthStart: targetMonth.toISOString(),
            settlementId: settlement.id,
          },
        });
        invoiceId = invoice.id;
      } catch (e: any) {
        failureReason = e?.message ?? "Stripe invoice creation failed";
      }
    }

    if (invoiceId) {
      await prisma.marketplaceSettlement.update({
        where: { id: settlement.id },
        data: { status: "invoiced", stripeInvoiceId: invoiceId },
      });
      // Reset counter only on success — if it failed we want to retry
      // and the counter is still valuable.
      await prisma.marketplaceListing.update({
        where: { id: c.id },
        data: {
          currentMonthOrders: 0,
          currentMonthRevenue: 0,
          currentMonthStartedAt: monthStartUtc(now),
        },
      });
      results.push({
        restaurantId: c.restaurantId,
        restaurantName: c.restaurant.name,
        monthStart: targetMonth,
        ordersInMonth: orders,
        accruedCents: accrued,
        invoicedCents: invoiced,
        status: "invoiced",
        stripeInvoiceId: invoiceId,
      });
    } else {
      await prisma.marketplaceSettlement.update({
        where: { id: settlement.id },
        data: { status: "failed", failureReason },
      });
      results.push({
        restaurantId: c.restaurantId,
        restaurantName: c.restaurant.name,
        monthStart: targetMonth,
        ordersInMonth: orders,
        accruedCents: accrued,
        invoicedCents: invoiced,
        status: "failed",
        reason: failureReason,
      });
    }
  }

  return { monthStart: targetMonth, results };
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
