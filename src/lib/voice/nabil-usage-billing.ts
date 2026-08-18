/**
 * Nabil AI monthly OVERAGE billing engine — the compute + persist + Stripe layer
 * behind /api/cron/nabil-usage-billing (00:15 UTC on the 1st, vercel.json).
 *
 * Price (Luigi 2026-08-18): US$0.50/min billed by the second, US$249.99/month
 * minimum, whichever is higher. The minimum is the `phone_ordering` add-on's
 * Stripe subscription; this engine bills the difference for the calendar month
 * that just CLOSED (UTC):
 *
 *   for each restaurant with a Stripe-billed phone_ordering subscription
 *     seconds  = Σ durationSeconds over its calls that month
 *     overage  = max(0, seconds × 1¢ − 24999¢)
 *     if overage > 0 → ONE Stripe invoice item on the restaurant's PLATFORM
 *                       Stripe customer (getStripe() = the platform account —
 *                       Nabil is a platform charge, never the restaurant's own
 *                       Connect account)
 *     always     → ONE NabilUsageCharge row (restaurantId, period) — audit
 *
 * Idempotency, three layers, so a retried / re-run cron can never double-bill:
 *   1. NabilUsageCharge is unique on (restaurantId, period); a row that already
 *      holds a stripeInvoiceItemId (or is `none`) is skipped outright;
 *   2. the Stripe call carries idempotency key `nabil-usage-<restaurantId>-<YYYY-MM>`
 *      — if the first attempt succeeded but we crashed before saving the id,
 *      the retry gets the SAME invoice item back and saves it;
 *   3. a `pending` / `failed` row is retried (Stripe key still guards it).
 *
 * The invoice item is CUSTOMER-level (no `subscription`), so Stripe adds it to
 * the restaurant's NEXT invoice, whichever subscription renews first (Nabil's own
 * renewal, another add-on's, or the platform plan's). Attaching it to the Nabil
 * subscription would strand it if the owner had already set cancel-at-period-end
 * (no further invoice on that sub). No tax_rates are set: the line inherits the
 * invoice's tax treatment so the overage is taxed exactly like the base fee.
 *
 * Complimentary rows (no Stripe sub — e.g. Luigi's own store) are METERED (row
 * written) but never billed. Restaurants that cancelled before the cron ran are
 * out of scope this month (documented gap: bill pending items on cancel).
 */
import prisma from "@/lib/db";
import { getStripe, stripeReady } from "@/lib/stripe";
import { PLATFORM_CURRENCY } from "@/lib/marketplace";
import { fetchNabilUsageByRestaurant } from "@/lib/voice/nabil-usage";
import {
  NABIL_INCLUDED_SECONDS,
  NABIL_PER_MINUTE_CENTS,
  formatSecondsAsMinSec,
  overageCents,
  overageSeconds,
  periodKey,
  previousMonthStartUtc,
  nextMonthStartUtc,
  monthStartUtc,
} from "@/lib/voice/nabil-billing";
import { PHONE_ORDERING_ADDON_SLUG } from "@/lib/voice/nabil-trial";

/** Add-on statuses whose owner is a (current or failing) subscriber. `cancelled`
 *  and `incomplete` are out; a legacy `trialing` Stripe row counts. */
const BILLABLE_ADDON_STATUSES = ["active", "past_due", "trialing"] as const;

export type NabilUsageChargeStatus = "none" | "invoiced" | "failed" | "skipped";

export interface NabilUsageBillingResult {
  restaurantId: string;
  restaurantName: string;
  period: string;
  calls: number;
  seconds: number;
  overageCents: number;
  status: NabilUsageChargeStatus;
  stripeInvoiceItemId?: string;
  reason?: string;
}

/** Deterministic Stripe idempotency key — one per restaurant per month. */
export function nabilUsageIdempotencyKey(restaurantId: string, period: string): string {
  return `nabil-usage-${restaurantId}-${period}`;
}

/** Human line on the Stripe invoice, e.g.
 *  "Nabil AI calls — July 2026: 30720s (24999s included) · 5721s × US$0.01". */
export function nabilUsageDescription(monthStart: Date, seconds: number): string {
  const label = monthStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const extra = overageSeconds(seconds);
  return `Nabil AI calls — ${label}: ${formatSecondsAsMinSec(seconds)} (${formatSecondsAsMinSec(NABIL_INCLUDED_SECONDS)} included) · ${extra}s overage @ US$${(NABIL_PER_MINUTE_CENTS / 100).toFixed(2)}/min`;
}

type StripeClient = Awaited<ReturnType<typeof getStripe>>;

/** Find an invoice item this engine already created for (restaurant, period) —
 *  matched on OUR metadata, never on amount/description. Items are created
 *  after the month closes, so `created ≥ monthEnd` bounds the scan. */
async function findExistingNabilUsageItem(
  stripe: StripeClient,
  customerId: string,
  restaurantId: string,
  period: string,
  monthEnd: Date,
): Promise<string | null> {
  const list = await stripe.invoiceItems.list({
    customer: customerId,
    limit: 100,
    created: { gte: Math.floor(monthEnd.getTime() / 1000) },
  });
  const hit = list.data.find(
    (it) => it.metadata?.type === "nabil_usage" && it.metadata?.restaurantId === restaurantId && it.metadata?.period === period,
  );
  return hit?.id ?? null;
}

/**
 * Bill the month that just CLOSED (the one before `now`) or an explicit
 * `monthStart` (superadmin re-run). Never bills the CURRENT month.
 * `timeBudgetMs` stops starting new restaurants near the function ceiling —
 * leftovers are simply not-yet-billed and a re-run picks them up (idempotent).
 */
export async function runNabilUsageBilling(opts: { now?: Date; monthStart?: Date; timeBudgetMs?: number } = {}): Promise<{
  period: string;
  monthStart: Date;
  results: NabilUsageBillingResult[];
  deferred: number;
}> {
  const now = opts.now ?? new Date();
  const monthStart = opts.monthStart ?? previousMonthStartUtc(now);
  const monthEnd = nextMonthStartUtc(monthStart);
  const period = periodKey(monthStart);
  const startedAt = Date.now();
  const budget = opts.timeBudgetMs ?? 45_000;

  if (monthStart.getTime() >= monthStartUtc(now).getTime()) {
    throw new Error(`refusing to bill a month that has not closed yet (${period})`);
  }

  const rows = await prisma.restaurantAddOn.findMany({
    where: {
      addOn: { slug: PHONE_ORDERING_ADDON_SLUG },
      status: { in: [...BILLABLE_ADDON_STATUSES] },
    },
    select: {
      restaurantId: true,
      stripeSubscriptionId: true,
      restaurant: { select: { name: true, stripeCustomerId: true } },
    },
    orderBy: { restaurantId: "asc" },
  });

  const results: NabilUsageBillingResult[] = [];
  let deferred = 0;
  if (rows.length === 0) return { period, monthStart, results, deferred };

  const usage = await fetchNabilUsageByRestaurant(
    rows.map((r) => r.restaurantId),
    monthStart,
    monthEnd,
  );

  const stripe = (await stripeReady()) ? await getStripe() : null;

  for (const row of rows) {
    if (Date.now() - startedAt > budget) {
      deferred = rows.length - results.length;
      break;
    }
    const u = usage.get(row.restaurantId) ?? { calls: 0, seconds: 0 };
    const owed = overageCents(u.seconds);
    const base = {
      restaurantId: row.restaurantId,
      restaurantName: row.restaurant.name,
      period,
      calls: u.calls,
      seconds: u.seconds,
      overageCents: owed,
    };

    const existing = await prisma.nabilUsageCharge.findUnique({
      where: { restaurantId_period: { restaurantId: row.restaurantId, period } },
    });
    if (existing && (existing.stripeInvoiceItemId || existing.status === "none")) {
      results.push({
        ...base,
        calls: existing.calls,
        seconds: existing.seconds,
        overageCents: existing.overageCents,
        status: "skipped",
        stripeInvoiceItemId: existing.stripeInvoiceItemId ?? undefined,
        reason: "already billed",
      });
      continue;
    }

    const billable = !!row.stripeSubscriptionId && !!row.restaurant.stripeCustomerId;
    if (owed === 0 || !billable) {
      await prisma.nabilUsageCharge.upsert({
        where: { restaurantId_period: { restaurantId: row.restaurantId, period } },
        create: { restaurantId: row.restaurantId, period, calls: u.calls, seconds: u.seconds, overageCents: owed, status: "none",
          failureReason: owed > 0 && !billable ? "no Stripe subscription/customer — complimentary or unbilled row" : null },
        update: { calls: u.calls, seconds: u.seconds, overageCents: owed, status: "none",
          failureReason: owed > 0 && !billable ? "no Stripe subscription/customer — complimentary or unbilled row" : null },
      });
      if (owed > 0 && !billable) {
        console.warn(`[nabil-usage-billing] ${row.restaurant.name} (${row.restaurantId}) used ${u.seconds}s in ${period} (overage ${owed}¢) but has no Stripe subscription/customer — NOT billed`);
      }
      results.push({ ...base, status: "none", reason: owed > 0 && !billable ? "not billable (no Stripe subscription/customer)" : undefined });
      continue;
    }

    const charge = await prisma.nabilUsageCharge.upsert({
      where: { restaurantId_period: { restaurantId: row.restaurantId, period } },
      create: { restaurantId: row.restaurantId, period, calls: u.calls, seconds: u.seconds, overageCents: owed, status: "pending" },
      update: { calls: u.calls, seconds: u.seconds, overageCents: owed, status: "pending", failureReason: null },
    });

    if (!stripe) {
      await prisma.nabilUsageCharge.update({ where: { id: charge.id }, data: { status: "failed", failureReason: "Stripe not configured on platform" } });
      results.push({ ...base, status: "failed", reason: "Stripe not configured on platform" });
      continue;
    }

    try {
      if (existing && (existing.status === "pending" || existing.status === "failed")) {
        const found = await findExistingNabilUsageItem(stripe, row.restaurant.stripeCustomerId!, row.restaurantId, period, monthEnd);
        if (found) {
          await prisma.nabilUsageCharge.update({
            where: { id: charge.id },
            data: { status: "invoiced", stripeInvoiceItemId: found, failureReason: null },
          });
          console.warn(`[nabil-usage-billing] ${row.restaurant.name} (${row.restaurantId}) ${period}: adopted existing invoice item ${found} (retry of a ${existing.status} row)`);
          results.push({ ...base, status: "invoiced", stripeInvoiceItemId: found, reason: "adopted existing invoice item" });
          continue;
        }
      }

      const item = await stripe.invoiceItems.create(
        {
          customer: row.restaurant.stripeCustomerId!,
          amount: owed,
          currency: PLATFORM_CURRENCY,
          description: nabilUsageDescription(monthStart, u.seconds),
          period: { start: Math.floor(monthStart.getTime() / 1000), end: Math.floor(monthEnd.getTime() / 1000) },
          metadata: {
            type: "nabil_usage",
            restaurantId: row.restaurantId,
            period,
            seconds: String(u.seconds),
            calls: String(u.calls),
            includedSeconds: String(NABIL_INCLUDED_SECONDS),
            perMinuteCents: String(NABIL_PER_MINUTE_CENTS),
            chargeId: charge.id,
          },
        },
        { idempotencyKey: nabilUsageIdempotencyKey(row.restaurantId, period) },
      );
      await prisma.nabilUsageCharge.update({
        where: { id: charge.id },
        data: { status: "invoiced", stripeInvoiceItemId: item.id, failureReason: null },
      });
      console.log(`[nabil-usage-billing] ${row.restaurant.name} (${row.restaurantId}) ${period}: ${u.seconds}s → overage ${owed}¢ → invoice item ${item.id}`);
      results.push({ ...base, status: "invoiced", stripeInvoiceItemId: item.id });
    } catch (e: any) {
      const reason = (e?.message as string | undefined) ?? "Stripe invoice item creation failed";
      await prisma.nabilUsageCharge.update({ where: { id: charge.id }, data: { status: "failed", failureReason: reason.slice(0, 500) } });
      console.error(`[nabil-usage-billing] ${row.restaurant.name} (${row.restaurantId}) ${period}: overage ${owed}¢ FAILED — ${reason}`);
      results.push({ ...base, status: "failed", reason });
    }
  }

  if (deferred > 0) {
    console.warn(`[nabil-usage-billing] time budget hit — ${deferred} restaurant(s) not processed for ${period}; re-run the cron (idempotent) to finish`);
  }
  return { period, monthStart, results, deferred };
}
