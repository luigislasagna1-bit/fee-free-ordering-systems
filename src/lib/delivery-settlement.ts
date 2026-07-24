/**
 * FeeFreeDelivery WEEKLY settlement engine — the delivery analog of
 * marketplace-settlement.ts (monthly). For each restaurant with delivered,
 * not-yet-billed FeeFree deliveries in a given Monday→Monday week it:
 *   1. sums the frozen platformFeeCents ($7.99 each) on those DeliveryAssignments
 *   2. creates a `DeliverySettlement` row capturing the bill
 *   3. issues a one-off Stripe invoice on the restaurant's card on file
 *   4. STAMPS settlementId onto every included assignment (marks them consumed —
 *      the source-of-truth guard against double billing; no rollover hack needed)
 *
 * Idempotent on (restaurantId, weekStart). Collection is async: the Stripe
 * webhook flips DeliverySettlement.status invoiced → paid/failed
 * (src/lib/stripe/events/invoice.ts, metadata.type = "delivery_settlement").
 *
 * Triggered by the weekly cron (Mon 00:10 UTC) or a superadmin manual re-run.
 *
 * ⚠️ CURRENTLY PAUSED — see DELIVERY_BILLING_ENABLED below.
 */

import prisma from "@/lib/db";
import { DELIVERY_BILLING_ENABLED } from "@/lib/delivery-billing-switch";
import { DELIVERY_WEEK_TZ } from "@/lib/feefree-delivery";
import { PLATFORM_CURRENCY } from "@/lib/marketplace";
import { getPlatformTax, stripeTaxRateDisplayName, type PlatformTax } from "@/lib/platform-tax";
import { getStripe, stripeReady } from "@/lib/stripe";
import { FEEFREE_DELIVERY_PER_ORDER_CENTS, previousDeliveryWeekStart, deliveryWeekEnd } from "@/lib/feefree-delivery";

type Stripe = Awaited<ReturnType<typeof getStripe>>;

// Reusable Stripe TaxRate IDs keyed by ratePct, cached per cold-start (mirrors
// the marketplace helper; re-implemented locally so the money-path settlement
// module stays untouched).
const taxRateIdCache = new Map<number, string>();
async function getOrCreateProvincialTaxRate(stripe: Stripe, tax: PlatformTax): Promise<string | null> {
  if (tax.ratePct === 0) return null;
  const cached = taxRateIdCache.get(tax.ratePct);
  if (cached) return cached;
  try {
    const displayName = stripeTaxRateDisplayName(tax);
    const list = await stripe.taxRates.list({ active: true, limit: 100 });
    const found = list.data.find((t) => t.percentage === tax.ratePct && t.display_name === displayName);
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
    console.error(`[delivery-settlement] failed to ensure tax rate ${tax.ratePct}%`, e);
    return null;
  }
}

export type DeliverySettlementResult = {
  restaurantId: string;
  restaurantName: string;
  weekStart: Date;
  deliveriesInWeek: number;
  accruedCents: number;
  invoicedCents: number;
  status: "invoiced" | "void" | "failed" | "skipped";
  stripeInvoiceId?: string;
  reason?: string;
};

function weekLabel(weekStart: Date): string {
  // The Sat→Fri window rendered on the restaurant's invoice. Format in the
  // delivery timezone so the dates read as Saturday…Friday, not UTC-shifted.
  const end = deliveryWeekEnd(weekStart);
  const endInclusive = new Date(end.getTime() - 24 * 60 * 60 * 1000); // the Friday
  const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: DELIVERY_WEEK_TZ });
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: DELIVERY_WEEK_TZ }).format(weekStart);
  return `${fmt(weekStart)}–${fmt(endInclusive)}, ${year}`;
}

/**
 * Settle the week that just CLOSED (the week before `now`). The cron fires
 * Monday 00:10 UTC, so the target week is the prior Mon→Sun. Pass `weekStart`
 * explicitly to re-run a specific week (superadmin manual settlement).
 */
export async function settleDeliveryWeek(
  opts: { now?: Date; weekStart?: Date } = {},
): Promise<{ weekStart: Date; results: DeliverySettlementResult[] }> {
  const now = opts.now ?? new Date();
  const targetWeek = opts.weekStart ?? previousDeliveryWeekStart(now);
  const weekEnd = deliveryWeekEnd(targetWeek);

  // Kill-switch checked HERE (not just in the cron route) so a superadmin manual
  // re-run, a script, or any future caller also cannot charge a restaurant.
  if (!DELIVERY_BILLING_ENABLED) {
    console.warn(
      `[delivery-settlement] SKIPPED week ${targetWeek.toISOString().slice(0, 10)} — ` +
        `billing is paused (DELIVERY_BILLING_ENABLED = false). No restaurant was charged.`,
    );
    return { weekStart: targetWeek, results: [] };
  }

  // Source of truth: delivered, not-yet-settled FeeFree assignments whose
  // deliveredAt falls in the target week.
  const pending = await prisma.deliveryAssignment.findMany({
    where: {
      status: "delivered",
      settlementId: null,
      deliveredAt: { gte: targetWeek, lt: weekEnd },
    },
    select: { id: true, restaurantId: true, platformFeeCents: true, driverTipCents: true, tipCurrency: true },
  });

  // Group assignment ids + accrual by restaurant, splitting fees (taxable) from
  // driver tips (pass-through, non-taxable). accrued = fees + tips (B4).
  const byRestaurant = new Map<
    string,
    { ids: string[]; fees: number; tips: number; tipCurrencies: Set<string> }
  >();
  for (const a of pending) {
    const g = byRestaurant.get(a.restaurantId) ?? { ids: [], fees: 0, tips: 0, tipCurrencies: new Set<string>() };
    g.ids.push(a.id);
    g.fees += a.platformFeeCents ?? FEEFREE_DELIVERY_PER_ORDER_CENTS;
    g.tips += a.driverTipCents ?? 0;
    if (a.tipCurrency) g.tipCurrencies.add(a.tipCurrency);
    byRestaurant.set(a.restaurantId, g);
  }

  const results: DeliverySettlementResult[] = [];
  const stripe = (await stripeReady()) ? await getStripe() : null;

  for (const [restaurantId, group] of byRestaurant) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, stripeCustomerId: true, country: true, state: true, currency: true },
    });
    if (!restaurant) continue;

    const deliveries = group.ids.length;
    const fees = group.fees;
    const tips = group.tips;
    const accrued = fees + tips;
    // Delivery bills in the RESTAURANT's own currency (Milton = "cad"), not the
    // global USD PLATFORM_CURRENCY (plan §4). Stripe wants a lowercase code.
    const currency = (restaurant.currency || PLATFORM_CURRENCY).toLowerCase();
    // Currency-integrity guard (N6): every frozen tip must match the restaurant's
    // billing currency, or we'd bill a CAD tip as USD. Fail closed if they diverge.
    const foreignTip = [...group.tipCurrencies].find((c) => c.toLowerCase() !== currency);

    // Idempotency guard — already settled this week? (Also the crash-recovery
    // seam: a prior run may have created the row but died before stamping the
    // assignments; if so we still stamp them below and skip re-invoicing.)
    const existing = await prisma.deliverySettlement.findUnique({
      where: { restaurantId_weekStart: { restaurantId, weekStart: targetWeek } },
    });
    if (existing) {
      // Stamp any stray unstamped assignments onto the existing settlement so a
      // half-finished prior run can never double-bill them next week.
      await prisma.deliveryAssignment.updateMany({
        where: { id: { in: group.ids }, settlementId: null },
        data: { settlementId: existing.id },
      });
      results.push({
        restaurantId,
        restaurantName: restaurant.name,
        weekStart: targetWeek,
        deliveriesInWeek: existing.deliveriesInWeek,
        accruedCents: existing.accruedCents,
        invoicedCents: existing.invoicedCents,
        status: existing.status === "void" ? "void" : "skipped",
        stripeInvoiceId: existing.stripeInvoiceId ?? undefined,
        reason: "already settled",
      });
      continue;
    }

    // Create the settlement row in "pending" first so a mid-flight Stripe
    // failure is recoverable.
    const settlement = await prisma.deliverySettlement.create({
      data: {
        restaurantId,
        weekStart: targetWeek,
        deliveriesInWeek: deliveries,
        accruedCents: accrued,
        invoicedCents: accrued,
        feesCents: fees,
        tipsCents: tips,
        currency,
        status: "pending",
      },
    });

    let invoiceId: string | undefined;
    let failureReason: string | undefined;
    if (foreignTip) {
      // Never mis-denominate a driver's tip. Left unsettled + flagged for a human.
      failureReason = `Tip currency ${foreignTip} ≠ billing currency ${currency}; not billed`;
    } else if (!stripe) {
      failureReason = "Stripe not configured on platform";
    } else if (!restaurant.stripeCustomerId) {
      failureReason = "Restaurant has no Stripe customer ID (no card on file)";
    } else {
      try {
        const tax = getPlatformTax({ country: restaurant.country, state: restaurant.state });
        const taxRateId = tax.ratePct > 0 ? await getOrCreateProvincialTaxRate(stripe, tax) : null;
        // Deterministic per restaurant + week so a retried cron run de-dupes
        // server-side at Stripe (same key → original response).
        const idemPrefix = `delivery-settle-${restaurantId}-${targetWeek.toISOString().slice(0, 10)}`;

        // Line item 1 — per-delivery platform fees (TAXABLE).
        await stripe.invoiceItems.create(
          {
            customer: restaurant.stripeCustomerId,
            amount: fees,
            currency,
            description: `Fee Free Delivery — ${deliveries} deliver${deliveries === 1 ? "y" : "ies"} (${weekLabel(targetWeek)})`,
            ...(taxRateId ? { tax_rates: [taxRateId] } : {}),
            metadata: {
              type: "delivery_settlement",
              subtype: "fees",
              restaurantId,
              weekStart: targetWeek.toISOString(),
              deliveriesInWeek: String(deliveries),
              settlementId: settlement.id,
              preTaxCents: String(fees),
              taxRatePct: String(tax.ratePct),
              taxLabel: tax.label,
            },
          },
          { idempotencyKey: `${idemPrefix}-item` },
        );
        // Line item 2 — driver tips collected on the drivers' behalf (pass-through,
        // NON-taxable → no tax_rates). Only when there's a tip to forward.
        if (tips > 0) {
          await stripe.invoiceItems.create(
            {
              customer: restaurant.stripeCustomerId,
              amount: tips,
              currency,
              description: `Driver tips collected (${weekLabel(targetWeek)})`,
              metadata: {
                type: "delivery_settlement",
                subtype: "tips",
                restaurantId,
                weekStart: targetWeek.toISOString(),
                settlementId: settlement.id,
                tipsCents: String(tips),
              },
            },
            { idempotencyKey: `${idemPrefix}-tips-item` },
          );
        }
        const invoice = await stripe.invoices.create(
          {
            customer: restaurant.stripeCustomerId,
            auto_advance: true,
            collection_method: "charge_automatically",
            metadata: {
              type: "delivery_settlement",
              restaurantId,
              weekStart: targetWeek.toISOString(),
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
      await prisma.deliverySettlement.update({
        where: { id: settlement.id },
        data: { status: "invoiced", stripeInvoiceId: invoiceId },
      });
      // Consume the assignments — mark them billed so they never appear in a
      // future week's settlement.
      await prisma.deliveryAssignment.updateMany({
        where: { id: { in: group.ids }, settlementId: null },
        data: { settlementId: settlement.id },
      });
      results.push({
        restaurantId,
        restaurantName: restaurant.name,
        weekStart: targetWeek,
        deliveriesInWeek: deliveries,
        accruedCents: accrued,
        invoicedCents: accrued,
        status: "invoiced",
        stripeInvoiceId: invoiceId,
      });
    } else {
      await prisma.deliverySettlement.update({
        where: { id: settlement.id },
        data: { status: "failed", failureReason },
      });
      // Do NOT stamp assignments on failure — leave them unsettled so a
      // resolved re-run picks them up.
      results.push({
        restaurantId,
        restaurantName: restaurant.name,
        weekStart: targetWeek,
        deliveriesInWeek: deliveries,
        accruedCents: accrued,
        invoicedCents: accrued,
        status: "failed",
        reason: failureReason,
      });
    }
  }

  return { weekStart: targetWeek, results };
}
