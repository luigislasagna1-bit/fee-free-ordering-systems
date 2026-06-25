import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/menu-insights/categories/export
 *
 * Per-category sales rollup as CSV. Same OrderItem → MenuCategory join
 * the page uses; we bucket in-process by categoryId since Prisma can't
 * groupBy across a relation.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const scope = await resolveReportScope(user.restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);
  const format = pickFormat(url);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { slug: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const items = await prisma.orderItem.findMany({
    where: {
      order: reportOrderWhere(scope.ids, range),
    },
    select: {
      quantity: true,
      subtotal: true,
      menuItem: { select: { category: { select: { name: true } } } },
    },
  });

  const buckets = new Map<string, { itemsSold: number; revenue: number; lines: number }>();
  for (const it of items) {
    const name = it.menuItem?.category?.name ?? "Uncategorized";
    const b = buckets.get(name) ?? { itemsSold: 0, revenue: 0, lines: 0 };
    b.itemsSold += it.quantity;
    b.revenue += it.subtotal;
    b.lines += 1;
    buckets.set(name, b);
  }
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
  const total = sorted.reduce((s, [, v]) => s + v.revenue, 0);

  const rows: (string | number)[][] = [["Category", "Items sold", "Order lines", "Revenue", "% of revenue"]];
  for (const [name, v] of sorted) {
    const pct = total > 0 ? (v.revenue / total) * 100 : 0;
    rows.push([name, v.itemsSold, v.lines, Math.round(v.revenue * 100) / 100, Math.round(pct * 10) / 10]);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: "menu-insights-categories",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Menu Insights — Categories",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
