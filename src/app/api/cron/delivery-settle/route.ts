import { NextRequest, NextResponse } from "next/server";
import { DELIVERY_BILLING_ENABLED } from "@/lib/delivery-billing-switch";
import { settleDeliveryWeek } from "@/lib/delivery-settlement";
import { previousDeliveryWeekStart, deliveryWeekStart } from "@/lib/feefree-delivery";
import { getSessionUser } from "@/lib/session";

/**
 * POST /api/cron/delivery-settle — FeeFreeDelivery WEEKLY settlement.
 *
 * Two authorized callers (mirrors marketplace-settle):
 *   1. Vercel cron (Authorization: Bearer $CRON_SECRET) — Saturday 06:10 UTC, just
 *      after the Sat→Fri America/Toronto week closes (Fri 23:59:59 Toronto).
 *   2. Superadmin manual trigger — re-run a specific week after fixing config.
 *
 * Query params:
 *   ?weekStart=YYYY-MM-DD — any day in the target week; snapped to the Saturday
 *                           that opens it. If omitted, defaults to the week that
 *                           just closed (prior Sat→Fri).
 *
 * ⚠️ Billing is PAUSED (DELIVERY_BILLING_ENABLED) — this route currently returns a
 * "paused" response and charges no one. See src/lib/delivery-billing-switch.ts.
 *
 * Idempotent — settleDeliveryWeek() guards on (restaurantId, weekStart) and marks
 * consumed assignments via settlementId.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const weekParam = url.searchParams.get("weekStart");
  let targetWeek: Date | undefined;
  if (weekParam) {
    const m = weekParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return NextResponse.json({ error: "Invalid weekStart, expected YYYY-MM-DD" }, { status: 400 });
    }
    // Interpret the given day at noon Toronto so the Sat→Fri snap can't be
    // knocked into an adjacent week by the UTC offset.
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    // Normalize to the Saturday that opens that week so a mid-week date still
    // targets the right billing window.
    targetWeek = deliveryWeekStart(d);
  } else {
    targetWeek = previousDeliveryWeekStart(new Date());
  }

  // Paused (Luigi 2026-07-23) — answer explicitly rather than returning an empty
  // run that reads like "nothing was owed".
  if (!DELIVERY_BILLING_ENABLED) {
    return NextResponse.json({
      paused: true,
      reason:
        "FeeFreeDelivery billing is paused — no restaurant is charged. Deliveries keep accruing unsettled. " +
        "Re-enable via DELIVERY_BILLING_ENABLED in src/lib/delivery-settlement.ts once the Sat→Fri week " +
        "and driver-tip pass-through are live.",
      weekStart: targetWeek.toISOString(),
    });
  }

  const result = await settleDeliveryWeek({ weekStart: targetWeek });

  const counts = result.results.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  console.log(
    `[delivery-settle] week=${result.weekStart.toISOString().slice(0, 10)} counts=${JSON.stringify(counts)}`,
  );

  return NextResponse.json({
    weekStart: result.weekStart.toISOString(),
    counts,
    results: result.results.map((r) => ({
      restaurantId: r.restaurantId,
      restaurantName: r.restaurantName,
      deliveriesInWeek: r.deliveriesInWeek,
      accruedCents: r.accruedCents,
      invoicedCents: r.invoicedCents,
      status: r.status,
      stripeInvoiceId: r.stripeInvoiceId,
      reason: r.reason,
    })),
  });
}
