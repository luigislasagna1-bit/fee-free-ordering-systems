import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { previousPeriod, toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/sales/summary/export
 *
 * Same Order.groupBy pivot the Summary page renders, exported as CSV.
 * The pivot dimension is in `?by=` (paymentMethod / type / status).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const by: "paymentMethod" | "type" | "status" =
    sp.by === "type" || sp.by === "status" ? sp.by : "paymentMethod";
  const compare = sp.compare === "1";
  const format = pickFormat(url);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { slug: true, timezone: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  const range = parseDateRangeInTz(sp, restaurant.timezone ?? undefined);

  const [cur, previous] = await Promise.all([
    prisma.order.groupBy({
      by: [by],
      where: reportOrderWhere(user.restaurantId, range),
      _count: true,
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
    }),
    compare
      ? prisma.order.groupBy({
          by: [by],
          where: reportOrderWhere(user.restaurantId, previousPeriod(range)),
          _count: true,
          _sum: { total: true },
        })
      : [],
  ]);
  const prevByKey = new Map(previous.map((r) => [String(r[by] ?? "—"), r]));

  const headers: string[] = [by, "Orders", "Revenue", "Average order"];
  if (compare) headers.push("Previous-period revenue");
  const rows: (string | number)[][] = [headers];
  for (const r of cur) {
    const key = String(r[by] ?? "—");
    const revenue = r._sum.total ?? 0;
    const avg = r._count > 0 ? revenue / r._count : 0;
    const row: (string | number)[] = [
      key,
      r._count,
      round2(revenue),
      round2(avg),
    ];
    if (compare) row.push(round2(prevByKey.get(key)?._sum.total ?? 0));
    rows.push(row);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: `sales-summary-by-${by}`,
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      `Sales Summary — by ${by}`,
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
