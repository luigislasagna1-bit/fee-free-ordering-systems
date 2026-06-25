import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/menu-insights/items/export
 *
 * Per-item sales export. Same query as the page, but UNBOUNDED — the
 * page renders top 100; the export gives every item with a sale in
 * range so accountants can reconcile against POS / receipts.
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

  const rows = await prisma.orderItem.groupBy({
    by: ["name"],
    where: {
      order: reportOrderWhere(scope.ids, range),
    },
    _sum: { quantity: true, subtotal: true },
    _count: true,
    orderBy: { _sum: { subtotal: "desc" } },
  });

  const totalRevenue = rows.reduce((s, r) => s + (r._sum.subtotal ?? 0), 0);
  const out: (string | number)[][] = [["Item", "Units sold", "Order lines", "Revenue", "% of revenue"]];
  for (const r of rows) {
    const revenue = r._sum.subtotal ?? 0;
    const pct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
    out.push([r.name, r._sum.quantity ?? 0, r._count, Math.round(revenue * 100) / 100, Math.round(pct * 10) / 10]);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: "menu-insights-items",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows: out,
    metadata: [
      "Menu Insights — Items",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
