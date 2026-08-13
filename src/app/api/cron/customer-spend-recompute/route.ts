/**
 * POST/GET /api/cron/customer-spend-recompute
 *
 * Nightly repair of the three denormalized spend counters on `Customer`
 * (`totalOrders`, `totalSpent`, `totalCreditSpent`). `/api/orders` bumps them
 * when an order is CREATED and never decremented them when that order was
 * later rejected or cancelled, so they drifted high — a one-off pass on
 * 2026-08-07 had to correct 109 of 456 production customers.
 *
 * THIS IS NOW A BACKSTOP, NOT THE FIX. The root cause was closed on 2026-08-09:
 * `syncCustomerTotalsForOrder()` (src/lib/customer-totals.ts) recomputes the
 * same three columns on every kill transition, and AGENTS.md requires any NEW
 * path that rejects/cancels an order to call it. This sweep exists because that
 * requirement is exactly the kind a future change forgets — on a healthy system
 * it finds `drifted: 0` every night, and a non-zero count is the signal that a
 * kill path was added without the sync. Fix the kill path; don't let the nightly
 * sweep become the thing that keeps the numbers honest.
 *
 * Same canonical predicate as the per-order sync (REPORT_ORDER_STATUS_WHERE),
 * so the two can never disagree about what counts as spend.
 *
 * All the logic lives in `recomputeCustomerSpend()` so this route and
 * `scripts/backfill-customer-spend.ts` can never drift apart. Read that file
 * for the shape rationale (one groupBy + cursor-paged batched updates).
 *
 * ⚠️  NEVER TOUCHES A WALLET. Three display columns on `Customer`, nothing
 *     else. `RewardAccount` and `RewardLedger` are never read and never
 *     written — a customer cannot lose store credit ("Luigi Bucks") to
 *     accounting work. Luigi's explicit requirement; do not relax it.
 *
 * Scheduled 03:40 UTC daily (see vercel.json) — off-peak, and clear of
 * reports-snapshot (03:00), retention-anonymize (04:00) and cleanup-sandboxes
 * (04:30). Reads/writes only `Customer`, so it can't collide with those.
 *
 * Auth: same dual-mode as the other crons — Bearer CRON_SECRET, or a
 * superadmin session for manual triggering.
 *
 * Query params (manual runs):
 *   ?dry=1           — read-only: report drift, write NOTHING.
 *   ?restaurantId=   — scope to one restaurant (aggregate AND paging).
 *   ?cursor=         — resume from a previous run's `nextCursor`.
 *
 * Idempotent: re-running right after a successful run writes zero rows.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { recomputeCustomerSpend } from "@/lib/customer-spend-recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stop well before maxDuration so the response (and the resume cursor) still
 *  gets out instead of the invocation being killed mid-page. */
const TIME_BUDGET_MS = 240_000;

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const restaurantId = url.searchParams.get("restaurantId") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;

  try {
    const result = await recomputeCustomerSpend(prisma, {
      apply: !dry,
      restaurantId,
      cursor,
      timeBudgetMs: TIME_BUDGET_MS,
    });

    console.log(
      `[customer-spend-recompute] ${dry ? "DRY " : ""}scanned=${result.scanned} ` +
        `drifted=${result.drifted} written=${result.written} failed=${result.failed} ` +
        `groupedCustomers=${result.groupedCustomers}` +
        (restaurantId ? ` restaurantId=${restaurantId}` : ""),
    );
    // Never let a partial sweep read as a complete one.
    if (result.nextCursor) {
      console.warn(
        `[customer-spend-recompute] TIME BUDGET HIT after ${result.scanned} customer(s) — ` +
          `work remains. Resume with ?cursor=${result.nextCursor}`,
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[customer-spend-recompute] failed", { err: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
