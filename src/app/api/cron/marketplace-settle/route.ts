import { NextRequest, NextResponse } from "next/server";
import { settleMarketplaceMonth, previousMonthStartUtc, monthStartUtc } from "@/lib/marketplace-settlement";
import { getSessionUser } from "@/lib/session";

/**
 * POST /api/cron/marketplace-settle
 *
 * Two authorized callers:
 *   1. Vercel cron (Authorization: Bearer $CRON_SECRET) — runs at
 *      00:05 UTC on the 1st of each month. Vercel sets the header
 *      automatically when the cron is configured in vercel.json.
 *   2. Superadmin manual trigger — useful for re-running a specific
 *      month after fixing a config issue.
 *
 * Query params:
 *   ?month=YYYY-MM — explicit target month (UTC). If omitted, defaults
 *                    to the month that just closed (i.e. previous-month
 *                    when running on the 1st).
 *
 * Idempotent — re-running for an already-settled month is a no-op
 * because settleMarketplaceMonth() guards on (restaurantId, monthStart).
 *
 * Returns a JSON summary suitable for piping to logs / Slack:
 *   { monthStart, results: [...] } with each result's status.
 */
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────
  // Vercel cron sends `Authorization: Bearer ${process.env.CRON_SECRET}`.
  // Superadmin sessions are also allowed for manual reruns.
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Target month resolution ────────────────────────────────────────
  // Default: settle the month that just CLOSED (the cron runs on the
  // 1st, so the prior month is what we want). Override via ?month=YYYY-MM.
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month");
  let targetMonth: Date | undefined;
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return NextResponse.json({ error: "Invalid month, expected YYYY-MM" }, { status: 400 });
    }
    const year = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    if (mon < 1 || mon > 12) {
      return NextResponse.json({ error: "Month out of range" }, { status: 400 });
    }
    targetMonth = new Date(Date.UTC(year, mon - 1, 1));
  } else {
    targetMonth = previousMonthStartUtc(monthStartUtc(new Date()));
  }

  // ── Run settlement ─────────────────────────────────────────────────
  const result = await settleMarketplaceMonth({ monthStart: targetMonth });

  // Concise audit log — pipe to Vercel logs / a future Slack hook.
  const counts = result.results.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  console.log(
    `[marketplace-settle] month=${result.monthStart.toISOString().slice(0, 7)} counts=${JSON.stringify(counts)}`,
  );

  return NextResponse.json({
    monthStart: result.monthStart.toISOString(),
    counts,
    results: result.results.map((r) => ({
      restaurantId: r.restaurantId,
      restaurantName: r.restaurantName,
      ordersInMonth: r.ordersInMonth,
      accruedCents: r.accruedCents,
      invoicedCents: r.invoicedCents,
      status: r.status,
      stripeInvoiceId: r.stripeInvoiceId,
      reason: r.reason,
    })),
  });
}
