import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseDateRange, toISODate } from "@/lib/reports/date-range";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/list/clients/export
 *
 * Customer roster — every customer with at least one order in the
 * range. Two queries (groupBy on Order + a Customer findMany for the
 * names) just like the page, but unbounded for export.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const range = parseDateRange(sp);
  const format = pickFormat(url);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { slug: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const grouped = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      restaurantId: user.restaurantId,
      customerId: { not: null },
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: true,
    _sum: { total: true },
  });
  grouped.sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0));

  const customerIds = grouped.map((g) => g.customerId!).filter(Boolean);
  const customers = customerIds.length > 0
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, email: true, phone: true, totalOrders: true, totalSpent: true, createdAt: true },
      })
    : [];
  const byId = new Map(customers.map((c) => [c.id, c]));

  const rows: (string | number | Date)[][] = [[
    "Customer", "Email", "Phone",
    "Orders in range", "Spend in range",
    "Lifetime orders", "Lifetime spend",
    "First seen",
  ]];
  for (const g of grouped) {
    const c = byId.get(g.customerId!);
    if (!c) continue;
    rows.push([
      c.name,
      c.email ?? "",
      c.phone ?? "",
      g._count,
      round2(g._sum.total ?? 0),
      c.totalOrders,
      round2(c.totalSpent),
      c.createdAt,
    ]);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: "clients",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows: rows as (string | number)[][],
    metadata: [
      "Clients — List View",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
      `Rows: ${grouped.length}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
