/**
 * Build / rebuild ReportDailySnapshot rows for the Reports Dashboard.
 *
 * The Dashboard headline KPIs (Revenue / Orders / Customers / AOV) for
 * the typical "Last 7 / 14 / 28 days" preset would otherwise scan
 * O(orders_in_window) per page view. At 10k+ restaurants with growing
 * order histories that's untenable. Snapshots roll up each restaurant-
 * day into a SINGLE row so the Dashboard hits ONE row per day instead.
 *
 * Strategy:
 *   - For each restaurant with orders in the target window, compute
 *     revenueCents / orderCount / completedCount / rejectedCount /
 *     customerCount / newCustomerCount / avgOrderCents +
 *     typeBreakdown / channelBreakdown / paymentBreakdown JSON.
 *   - Upsert by (restaurantId, date) so re-running is idempotent —
 *     same day re-run produces identical row content.
 *
 * Default schedule (vercel.json):
 *   3am UTC daily — builds yesterday's snapshot. Late enough that
 *   late-night orders are settled; early enough that the morning
 *   Dashboard read sees fresh data.
 *
 * Manual trigger: pass `?days=30` to rebuild the last N days
 * (useful when this code is updated and historical snapshots need
 * recomputation). Default = 1 day (just yesterday).
 *
 * Idempotency / safety:
 *   - Pure read + upsert. No deletes, no mutations to other tables.
 *   - The 4-year retention rule does NOT apply to snapshots (they're
 *     derived; if lost we just recompute) but in practice we keep
 *     them forever — they're tiny + the read cost is constant.
 */

import prisma from "@/lib/db";

export interface BuildOptions {
  /** Number of days back to rebuild, inclusive of "yesterday". Default 1. */
  days?: number;
  /** When provided, only rebuild for this single restaurant — used for
   *  manual on-demand rebuilds from the admin panel. */
  restaurantId?: string;
}

export interface BuildResult {
  daysBuilt: number;
  restaurantsTouched: number;
  rowsUpserted: number;
  startedAt: Date;
  finishedAt: Date;
}

/** Build snapshots for the configured window. */
export async function buildReportSnapshots(opts: BuildOptions = {}): Promise<BuildResult> {
  const startedAt = new Date();
  const days = Math.max(1, Math.min(opts.days ?? 1, 90));

  // We work in UTC because Order.createdAt is UTC. Per-restaurant
  // timezones aren't honored yet (see header comment in date-range.ts);
  // when they ship, the day-bucketing here changes too.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let restaurantsTouched = 0;
  let rowsUpserted = 0;

  for (let i = 1; i <= days; i++) {
    const dayStart = new Date(today);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Find every restaurant with at least one order on this day.
    // Using groupBy keeps us from scanning per-restaurant when many
    // have zero activity (we'd just be writing empty rows for nothing).
    const activeWhere = opts.restaurantId
      ? { restaurantId: opts.restaurantId, createdAt: { gte: dayStart, lt: dayEnd } }
      : { createdAt: { gte: dayStart, lt: dayEnd } };
    const activeRestaurants = await prisma.order.groupBy({
      by: ["restaurantId"],
      where: activeWhere,
      _count: true,
    });

    for (const row of activeRestaurants) {
      restaurantsTouched += 1;
      const stats = await buildSnapshotForDay(row.restaurantId, dayStart, dayEnd);
      await prisma.reportDailySnapshot.upsert({
        where: { restaurantId_date: { restaurantId: row.restaurantId, date: dayStart } },
        update: { ...stats, builtAt: new Date() },
        create: { restaurantId: row.restaurantId, date: dayStart, ...stats, builtAt: new Date() },
      });
      rowsUpserted += 1;
    }
  }

  return {
    daysBuilt: days,
    restaurantsTouched,
    rowsUpserted,
    startedAt,
    finishedAt: new Date(),
  };
}

/** Compute the snapshot fields for a single (restaurant, day) pair. */
async function buildSnapshotForDay(restaurantId: string, dayStart: Date, dayEnd: Date) {
  const where = { restaurantId, createdAt: { gte: dayStart, lt: dayEnd } };

  // One big findMany covering everything — the (restaurantId, createdAt)
  // index keeps it O(orders_today) without a join. We could split into
  // multiple aggregate calls but at typical day-volume the in-process
  // reduce is faster (one network round-trip vs many).
  const orders = await prisma.order.findMany({
    where,
    select: {
      total: true, status: true, type: true, channel: true,
      paymentMethod: true, customerId: true,
    },
  });

  const completed = orders.filter((o) => o.status === "completed");
  const rejected = orders.filter((o) => o.status === "rejected" || o.status === "cancelled");
  const revenue = completed.reduce((s, o) => s + o.total, 0);
  const revenueCents = Math.round(revenue * 100);
  const avgOrderCents = completed.length > 0 ? Math.round(revenueCents / completed.length) : 0;

  const distinctCustomers = new Set<string>();
  for (const o of orders) if (o.customerId) distinctCustomers.add(o.customerId);

  // New customers: customerIds active today that have NO prior orders
  // before `dayStart`. One COUNT per customer is wasteful — we batch
  // via a single groupBy on Order restricted to those customer IDs.
  let newCustomerCount = 0;
  if (distinctCustomers.size > 0) {
    const priorIds = await prisma.order.groupBy({
      by: ["customerId"],
      where: {
        restaurantId,
        customerId: { in: Array.from(distinctCustomers) },
        createdAt: { lt: dayStart },
      },
    });
    const priorSet = new Set(priorIds.map((p) => p.customerId).filter((x): x is string => !!x));
    for (const id of distinctCustomers) if (!priorSet.has(id)) newCustomerCount += 1;
  }

  // Breakdowns — small JSON blobs. Stored as STRING (Postgres TEXT)
  // because Prisma's String? matches what the schema declared.
  const typeBreakdown = countBy(orders.map((o) => o.type));
  const channelBreakdown = countBy(orders.map((o) => o.channel ?? "direct"));
  const paymentBreakdown = countBy(orders.map((o) => o.paymentMethod));

  return {
    revenueCents,
    orderCount: orders.length,
    completedCount: completed.length,
    rejectedCount: rejected.length,
    customerCount: distinctCustomers.size,
    newCustomerCount,
    avgOrderCents,
    typeBreakdown: JSON.stringify(typeBreakdown),
    channelBreakdown: JSON.stringify(channelBreakdown),
    paymentBreakdown: JSON.stringify(paymentBreakdown),
  };
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
