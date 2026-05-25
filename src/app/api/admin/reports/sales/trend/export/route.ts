import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseDateRange, previousPeriod, eachDay, toISODate, formatChartDate } from "@/lib/reports/date-range";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/sales/trend/export
 *
 * Streams the same daily revenue/orders/avg buckets that the Sales
 * Trend page renders, formatted as CSV (or XLS — same body, different
 * filename + Content-Type) with one row per day.
 *
 * Query params (same as the page):
 *   from / to / preset    — date range (see parseDateRange)
 *   metric                — "revenue" | "orders" | "avg"
 *   compare               — "1" includes a previous-period column
 *   format                — "csv" | "xls"
 *
 * Auth: must be a restaurant-scoped session. Returns 401 / 403 on
 * missing or wrong-role sessions.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const range = parseDateRange(sp);
  const metric = sp.metric === "orders" || sp.metric === "avg" ? sp.metric : "revenue";
  const compare = sp.compare === "1";
  const format = pickFormat(url);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { slug: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const [current, previous] = await Promise.all([
    prisma.order.findMany({
      where: { restaurantId: user.restaurantId, status: "completed", createdAt: { gte: range.from, lte: range.to } },
      select: { total: true, createdAt: true },
    }),
    compare
      ? prisma.order.findMany({
          where: {
            restaurantId: user.restaurantId,
            status: "completed",
            createdAt: { gte: previousPeriod(range).from, lte: previousPeriod(range).to },
          },
          select: { total: true, createdAt: true },
        })
      : [],
  ]);

  const days = eachDay(range);
  const curBuckets = bucket(current, days);
  const prevBuckets = compare ? bucket(previous, eachDay(previousPeriod(range))) : [];

  const headers: (string | number)[] = ["Date", labelForMetric(metric)];
  if (compare) headers.push(`Previous period ${labelForMetric(metric)}`);

  const rows: (string | number)[][] = [headers];
  for (let i = 0; i < curBuckets.length; i++) {
    const cur = curBuckets[i];
    const prev = compare ? prevBuckets[i] : undefined;
    const row: (string | number)[] = [formatChartDate(cur.date), valueOf(cur, metric)];
    if (compare) row.push(prev ? valueOf(prev, metric) : 0);
    rows.push(row);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: "sales-trend",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      `Sales Trend — ${labelForMetric(metric)}`,
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
      compare ? "Comparison: previous period included" : "Comparison: off",
    ],
  });
}

type Metric = "revenue" | "orders" | "avg";
type Bucket = { date: Date; revenue: number; count: number; avg: number };

function labelForMetric(m: Metric): string {
  return m === "revenue" ? "Revenue" : m === "orders" ? "Orders" : "Average order";
}

function valueOf(b: Bucket, m: Metric): number {
  // Currency values exported as dollars (matches the in-app display)
  // and rounded to 2dp to keep the CSV human-readable in Excel /
  // Numbers / Google Sheets without locale-dependent formatting.
  if (m === "orders") return b.count;
  const v = m === "revenue" ? b.revenue : b.avg;
  return Math.round(v * 100) / 100;
}

function bucket(orders: { total: number; createdAt: Date }[], days: Date[]): Bucket[] {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const d of days) map.set(d.toDateString(), { revenue: 0, count: 0 });
  for (const o of orders) {
    const k = new Date(o.createdAt).toDateString();
    const cur = map.get(k);
    if (cur) { cur.revenue += o.total; cur.count += 1; }
  }
  return days.map((d) => {
    const b = map.get(d.toDateString())!;
    return { date: d, revenue: b.revenue, count: b.count, avg: b.count > 0 ? b.revenue / b.count : 0 };
  });
}
