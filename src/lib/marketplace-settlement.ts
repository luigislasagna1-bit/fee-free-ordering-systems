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
  PLATFORM_CURRENCY,
} from "@/lib/marketplace";
import { getPlatformTax, stripeTaxRateDisplayName, type PlatformTax } from "@/lib/platform-tax";
import { getStripe, stripeReady } from "@/lib/stripe";
import { sendMarketplaceSettlementSummaryEmail } from "@/lib/email";

type Stripe = Awaited<ReturnType<typeof getStripe>>;

/**
 * Reusable Stripe TaxRate IDs keyed by ratePct (so we don't duplicate
 * "13%", "5%", "0%" rates across runs). Cached in-process per cold-start.
 * Each unique rate gets one Stripe TaxRate object; subsequent settlements
 * for the same province reuse it.
 */
const taxRateIdCache = new Map<number, string>();
async function getOrCreateProvincialTaxRate(stripe: Stripe, tax: PlatformTax): Promise<string | null> {
  if (tax.ratePct === 0) return null; // No tax → don't attach a tax_rate
  const cached = taxRateIdCache.get(tax.ratePct);
  if (cached) return cached;
  try {
    const displayName = stripeTaxRateDisplayName(tax);
    // Scan active rates and match by (percentage, display_name). Stripe
    // doesn't have a "find or create" — fortunately the list is small.
    const list = await stripe.taxRates.list({ active: true, limit: 100 });
    const found = list.data.find(
      (t) => t.percentage === tax.ratePct && t.display_name === displayName,
    );
    if (found) {
      taxRateIdCache.set(tax.ratePct, found.id);
      return found.id;
    }
    const created = await stripe.taxRates.create({
      display_name: displayName,
      description: `Platform tax — ${tax.label}`,
      percentage: tax.ratePct,
      inclusive: false,
    });
    taxRateIdCache.set(tax.ratePct, created.id);
    return created.id;
  } catch (e) {
    console.error(`[marketplace-settlement] failed to ensure tax rate ${tax.ratePct}%`, e);
    return null;
  }
}

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

  // Every PAYG listing with activity in the period is eligible.
  // Restaurants on the monthly plan (billingMode="monthly") pay flat
  // $199.99 via their Stripe subscription — the settlement engine
  // skips them. Their listing counters still tick (for display) but
  // don't translate into a per-order invoice.
  const candidates = await prisma.marketplaceListing.findMany({
    where: { billingMode: "payg" },
    select: {
      id: true,
      restaurantId: true,
      currentMonthOrders: true,
      currentMonthRevenue: true,
      currentMonthStartedAt: true,
      lifetimeSavingsVsUberEatsCents: true,
      billingMode: true,
      restaurant: {
        select: {
          name: true,
          email: true,
          stripeCustomerId: true,
          // country + state drive the per-province tax lookup. CRA
          // requires destination-based tax on Canadian supplies.
          country: true,
          state: true,
        },
      },
    },
  });

  const results: SettlementResult[] = [];
  const stripe = (await stripeReady()) ? await getStripe() : null;

  for (const c of candidates) {
    // Month-boundary recovery (audit 2026-05-30 #76). The counter
    // value lives in `currentMonthOrders` and resets when the FIRST
    // order of a new month lands in /api/orders POST. If a customer
    // placed a Feb 1 order before the Feb 1 settlement cron ran, the
    // counter has already rolled to Feb — yet there ARE real Jan
    // orders to bill that haven't been counted yet. Previously we
    // bailed with "counter not aligned with target month" and the
    // orders silently fell through the cracks.
    //
    // Now: if the counter has rolled forward, query the canonical
    // Order rows directly for the target month to recover the actual
    // count. The counter is treated as a fast-path optimization; the
    // Order table is the source of truth.
    const counterMonth = monthStartUtc(c.currentMonthStartedAt);
    const counterAligned = counterMonth.getTime() === targetMonth.getTime();
    let orders: number;
    if (counterAligned) {
      orders = c.currentMonthOrders;
    } else {
      const monthEnd = new Date(targetMonth);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      orders = await prisma.order.count({
        where: {
          restaurantId: c.restaurantId,
          viaMarketplace: true,
          marketplaceCounterApplied: true,
          status: { notIn: ["cancelled", "rejected"] },
          createdAt: { gte: targetMonth, lt: monthEnd },
        },
      });
      if (orders === 0) {
        // No orders found and counter already rolled — nothing to bill
        // for this listing in the target month. Skip cleanly with the
        // original reason so the audit trail still reflects what
        // happened.
        results.push({
          restaurantId: c.restaurantId,
          restaurantName: c.restaurant.name,
          monthStart: targetMonth,
          ordersInMonth: 0,
          accruedCents: 0,
          invoicedCents: 0,
          status: "skipped",
          reason: "counter not aligned with target month + no orders in range",
        });
        continue;
      }
      // Real orders found! Log so the operator notices the recovery
      // path fired — useful for spotting any future drift.
      console.warn(
        `[marketplace-settle] recovered ${orders} late-${monthLabel(targetMonth)} orders for ${c.restaurant.name} via createdAt query (counter had already rolled).`,
      );
    }
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
        // Compute tax based on THIS restaurant's address (CRA rules):
        // Canadian → province-specific GST/HST; US/intl → 0%.
        const tax = getPlatformTax({
          country: c.restaurant.country,
          state: c.restaurant.state,
        });
        const taxRateId = tax.ratePct > 0
          ? await getOrCreateProvincialTaxRate(stripe, tax)
          : null;

        // Audit 2026-05-30 #77: pass an idempotency_key to BOTH the
        // invoice-item and invoice creation calls. Previously a
        // retried cron run (e.g. lambda timeout, Stripe 500 mid-flight)
        // could create duplicate line items + duplicate invoices for
        // the same restaurant/month. The key below is deterministic
        // per restaurant + target month, so Stripe de-dupes server-
        // side: a retry returns the original response.
        // Reference: https://stripe.com/docs/api/idempotent_requests
        const idemPrefix = `marketplace-settle-${c.restaurantId}-${targetMonth.toISOString().slice(0, 7)}`;

        // Step 1: create the InvoiceItem (the line item).
        // tax_rates (when present) applies the destination-province tax
        // on top of `amount` at invoice finalization. US/international
        // restaurants get no tax_rate at all (tax-exempt).
        await stripe.invoiceItems.create(
          {
            customer: c.restaurant.stripeCustomerId,
            amount: invoiced, // cents, pre-tax
            currency: PLATFORM_CURRENCY,
            description: `Fee Free Marketplace — ${orders} order${orders === 1 ? "" : "s"} (${monthLabel(targetMonth)})`,
            ...(taxRateId ? { tax_rates: [taxRateId] } : {}),
            metadata: {
              type: "marketplace_settlement",
              restaurantId: c.restaurantId,
              monthStart: targetMonth.toISOString(),
              ordersInMonth: String(orders),
              settlementId: settlement.id,
              preTaxCents: String(invoiced),
              taxRatePct: String(tax.ratePct),
              taxLabel: tax.label,
            },
          },
          { idempotencyKey: `${idemPrefix}-item` },
        );
        // Step 2: create + finalize the invoice. auto_advance=true tells
        // Stripe to attempt collection immediately (using the customer's
        // default payment method if set).
        const invoice = await stripe.invoices.create(
          {
            customer: c.restaurant.stripeCustomerId,
            auto_advance: true,
            collection_method: "charge_automatically",
            metadata: {
              type: "marketplace_settlement",
              restaurantId: c.restaurantId,
              monthStart: targetMonth.toISOString(),
              settlementId: settlement.id,
            },
          },
          { idempotencyKey: `${idemPrefix}-invoice` },
        );
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

    // Settlement summary email — fire-and-forget. Goes out for both
    // successful and failed settlements so the restaurant always
    // knows the cycle closed (and what to do if it failed). Renders
    // through the dedicated MarketplaceSettlement React Email template
    // (stat-card layout matching the GloriaFood digest aesthetic).
    if (c.restaurant.email) {
      const ueEquivalent = ueEquivalentCents(c.currentMonthRevenue);
      const savingsThisMonth = ueEquivalent - invoiced;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      void sendMarketplaceSettlementSummaryEmail({
        to: c.restaurant.email,
        restaurantName: c.restaurant.name,
        period: monthLabel(targetMonth),
        status: invoiceId ? "invoiced" : "failed",
        ordersInMonth: orders,
        revenueDollars: c.currentMonthRevenue,
        accruedDollars: accrued / 100,
        invoicedDollars: invoiced / 100,
        capDollars: MARKETPLACE_MONTHLY_CAP_CENTS / 100,
        capHit: accrued >= MARKETPLACE_MONTHLY_CAP_CENTS,
        ueEquivalentDollars: ueEquivalent / 100,
        savingsThisMonthDollars: Math.max(0, savingsThisMonth) / 100,
        lifetimeSavingsDollars: c.lifetimeSavingsVsUberEatsCents / 100,
        failureReason,
        dashboardUrl: `${baseUrl}/admin/marketplace`,
        billingUrl: `${baseUrl}/admin/billing`,
      }).catch((e) => console.error("[settlement] email failed", e));
    }
  }

  return { monthStart: targetMonth, results };
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** What UberEats / DoorDash would have charged this restaurant in
 *  commission on the period's marketplace revenue. 30% is the public
 *  industry benchmark we compare against. Returns cents. */
function ueEquivalentCents(revenueDollars: number): number {
  return Math.round(revenueDollars * 100 * 0.30);
}
