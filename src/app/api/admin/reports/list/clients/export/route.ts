import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { resolveReportScope } from "@/lib/reports/report-scope";
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
  const format = pickFormat(url);

  const scope = await resolveReportScope(user.restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  const grouped = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...reportOrderWhere(scope.ids, range), customerId: { not: null } },
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

  // Lifetime totals recomputed from real orders (canonical predicate, no date
  // filter) — same as the page, so the CSV's lifetime columns don't drift from
  // the denormalized Customer.totalOrders/totalSpent.
  const lifetimeRows = customerIds.length > 0
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: { ...REPORT_ORDER_STATUS_WHERE, restaurantId: { in: scope.ids }, customerId: { in: customerIds } },
        _count: true,
        _sum: { total: true },
      })
    : [];
  const lifetimeById = new Map(
    lifetimeRows.map((r) => [r.customerId!, { orders: r._count, spend: r._sum.total ?? 0 }]),
  );

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
      lifetimeById.get(c.id)?.orders ?? c.totalOrders,
      round2(lifetimeById.get(c.id)?.spend ?? c.totalSpent),
      c.createdAt,
    ]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
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
