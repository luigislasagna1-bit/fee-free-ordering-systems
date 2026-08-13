/**
 * THE recompute for the three DENORMALIZED spend counters on `Customer`:
 *
 *   totalOrders      — how many orders they actually placed here
 *   totalSpent       — GROSS order value (sum of `Order.total`)
 *   totalCreditSpent — store credit ("Luigi Bucks") they TENDERED
 *                      (sum of `Order.creditApplied`)
 *
 * Why this exists: `/api/orders` bumps all three when an order is CREATED and
 * never decremented them when that order was later rejected or cancelled, so
 * the stored values drifted HIGH over time. A one-off pass (2026-08-07)
 * corrected 109 of 456 production customers.
 *
 * The BULK counterpart to `syncCustomerTotalsForOrder()`
 * (src/lib/customer-totals.ts), which closed the root cause on 2026-08-09 by
 * recomputing one customer on every kill transition. Same canonical predicate
 * (`REPORT_ORDER_STATUS_WHERE`) — one definition of "spend", two shapes: one
 * customer on demand, or every customer in one sweep. The sweep is a backstop
 * for a kill path that forgets the per-order call; it is not where correctness
 * is supposed to come from.
 *
 * Both the nightly cron (`/api/cron/customer-spend-recompute`) and the manual
 * script (`scripts/backfill-customer-spend.ts`) call THIS function, so they can
 * never disagree.
 *
 * ⚠️  THIS NEVER TOUCHES A WALLET.
 *     It reads `Order` rows and writes exactly three DISPLAY columns on
 *     `Customer`. `RewardAccount.balance`, `RewardAccount.lifetimeEarned` /
 *     `lifetimeRedeemed` and `RewardLedger` are never read and never written.
 *     A customer cannot lose (or gain) a single Luigi Buck as a result of
 *     running this. Luigi asked for that guarantee explicitly — do not relax
 *     it, and do not "while we're here" add a balance fix-up.
 *
 * Counted orders use the canonical reporting predicate
 * (`REPORT_ORDER_STATUS_WHERE`) — the same one every report surface and the
 * End-of-Day email use — so a rejected/cancelled order and a `TEST-` order
 * don't count as spend here either.
 *
 * SHAPE (deliberate — do not "simplify" this into per-customer queries):
 *   ONE `order.groupBy` builds the truth table for every customer at once,
 *   then customers are cursor-paged in fixed batches and ONLY drifted rows are
 *   written. Cost is one aggregate + O(customers / batchSize) reads, not one
 *   query per customer. `Customer` can reach 10,000+ rows per restaurant.
 *
 *   Scaling seam: the groupBy scans the whole (filtered) Order table. When
 *   that becomes the bottleneck, shard by passing `restaurantId` and driving
 *   one restaurant per invocation — the option is already wired through and
 *   scopes BOTH the aggregate and the customer paging.
 *
 * Idempotent: a second run immediately after the first writes zero rows, which
 * is exactly how you verify it worked (dry-run → `drifted: 0`).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";

/** Money lands in Float columns; compare at cent precision so 19.999999 and
 *  20 don't look like drift and cause a pointless write every single night. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export type CustomerSpendTotals = {
  orders: number;
  spent: number;
  credit: number;
};

/** One row that disagreed with the orders, for logging / dry-run output. */
export type CustomerSpendDrift = {
  id: string;
  /** name → email → id, whichever exists. Display only. */
  label: string;
  from: CustomerSpendTotals;
  to: CustomerSpendTotals;
};

export type RecomputeCustomerSpendOptions = {
  /** false (default) = read-only dry run: counts drift, writes NOTHING. */
  apply?: boolean;
  /** Scope BOTH the aggregate and the customer paging to one restaurant. */
  restaurantId?: string;
  /** Customers read per page. */
  batchSize?: number;
  /** Drifted rows written concurrently per chunk. */
  updateChunk?: number;
  /** Resume point — only customers with `id > cursor` are scanned. */
  cursor?: string | null;
  /** Cap on how many drift samples come back (the rest are still counted). */
  maxSamples?: number;
  /** Stop cleanly after this long and report `nextCursor` so a follow-up run
   *  can resume. Guards a serverless invocation against its wall-clock limit. */
  timeBudgetMs?: number;
  /** Progress ping after each page (script prints it; cron ignores it). */
  onProgress?: (scanned: number) => void;
};

export type RecomputeCustomerSpendResult = {
  applied: boolean;
  /** Customers the order table had any counted spend for. */
  groupedCustomers: number;
  scanned: number;
  drifted: number;
  written: number;
  /** Rows whose update threw. Logged, skipped, retried by the next run. */
  failed: number;
  samples: CustomerSpendDrift[];
  /** Non-null = the time budget ran out and work REMAINS. Never silent. */
  nextCursor: string | null;
};

const ZERO: CustomerSpendTotals = { orders: 0, spent: 0, credit: 0 };

export async function recomputeCustomerSpend(
  prisma: PrismaClient,
  opts: RecomputeCustomerSpendOptions = {},
): Promise<RecomputeCustomerSpendResult> {
  const apply = opts.apply ?? false;
  const batchSize = opts.batchSize ?? 500;
  const updateChunk = opts.updateChunk ?? 25;
  const maxSamples = opts.maxSamples ?? 25;
  const timeBudgetMs = opts.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const scope = opts.restaurantId ? { restaurantId: opts.restaurantId } : {};

  // ONE grouped pass over the order table — NOT per-customer queries.
  const grouped = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      customerId: { not: null },
      ...REPORT_ORDER_STATUS_WHERE,
      ...scope,
    },
    _count: { _all: true },
    _sum: { total: true, creditApplied: true },
  });

  const truth = new Map<string, CustomerSpendTotals>(
    grouped.map((g) => [
      g.customerId as string,
      {
        orders: g._count._all,
        spent: round2(g._sum.total ?? 0),
        credit: round2(g._sum.creditApplied ?? 0),
      },
    ]),
  );

  let scanned = 0;
  let drifted = 0;
  let written = 0;
  let failed = 0;
  const samples: CustomerSpendDrift[] = [];
  let cursor: string | null = opts.cursor ?? null;
  let nextCursor: string | null = null;

  for (;;) {
    const page = await prisma.customer.findMany({
      where: { ...scope, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: batchSize,
      select: {
        id: true,
        name: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        totalCreditSpent: true,
      },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const pending: { id: string; want: CustomerSpendTotals }[] = [];

    for (const c of page) {
      scanned++;
      const want = truth.get(c.id) ?? ZERO;
      const same =
        c.totalOrders === want.orders &&
        round2(c.totalSpent) === want.spent &&
        round2(c.totalCreditSpent ?? 0) === want.credit;
      if (same) continue;

      drifted++;
      if (samples.length < maxSamples) {
        samples.push({
          id: c.id,
          label: c.name || c.email || c.id,
          from: {
            orders: c.totalOrders,
            spent: round2(c.totalSpent),
            credit: round2(c.totalCreditSpent ?? 0),
          },
          to: want,
        });
      }
      if (apply) pending.push({ id: c.id, want });
    }

    // Batched writes: only the three display columns, chunked so a page of
    // drift doesn't open hundreds of simultaneous connections. A row that
    // fails is counted and skipped — one bad customer must not abort the
    // sweep and permanently block every customer ordered after it.
    for (let i = 0; i < pending.length; i += updateChunk) {
      const chunk = pending.slice(i, i + updateChunk);
      const settled = await Promise.allSettled(
        chunk.map((p) =>
          prisma.customer.update({
            where: { id: p.id },
            data: {
              totalOrders: p.want.orders,
              totalSpent: p.want.spent,
              totalCreditSpent: p.want.credit,
            },
          }),
        ),
      );
      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        if (r.status === "fulfilled") {
          written++;
        } else {
          failed++;
          console.error(
            `[customer-spend-recompute] update failed for customer ${chunk[j].id}:`,
            r.reason,
          );
        }
      }
    }

    opts.onProgress?.(scanned);

    if (page.length < batchSize) break;
    if (Date.now() - startedAt > timeBudgetMs) {
      nextCursor = cursor;
      break;
    }
  }

  return {
    applied: apply,
    groupedCustomers: truth.size,
    scanned,
    drifted,
    written,
    failed,
    samples,
    nextCursor,
  };
}
