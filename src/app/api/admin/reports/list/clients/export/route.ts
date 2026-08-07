import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { MONEY_SUM, splitFromSums } from "@/lib/reports/collected";
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
  // FIRST value per key — matches the pages' `Array.isArray(x) ? x[0] : x`
  // handling of repeated query params (forEach alone would keep the LAST).
  url.searchParams.forEach((v, k) => { if (!(k in sp)) sp[k] = v; });
  const format = pickFormat(url);

  const scope = await resolveReportScope(user.restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  const grouped = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...reportOrderWhere(scope.ids, range), customerId: { not: null } },
    _count: true,
    _sum: MONEY_SUM,
  });
  // ?sort=orders|spend&dir=asc|desc — the SAME strict allowlist + comparator
  // as the page (pickSort in list/clients/page.tsx), incl. the deterministic
  // customerId tiebreak, so a sorted table exports in the on-screen order.
  // Absent/invalid params → today's default: spend descending.
  const rawSort = sp.sort?.trim();
  const sortKey = (["orders", "spend"] as const).find((k) => k === rawSort);
  const dir = sp.dir?.trim() === "desc" ? "desc" : "asc";
  const value = (g: (typeof grouped)[number]) =>
    sortKey === "orders" ? g._count : splitFromSums(g._sum.total, g._sum.creditApplied).collected;
  grouped.sort((a, b) => {
    if (sortKey) {
      const d = (value(a) - value(b)) * (dir === "asc" ? 1 : -1);
      return d !== 0 ? d : (a.customerId ?? "").localeCompare(b.customerId ?? "");
    }
    // default: COLLECTED desc — store credit is a tender, not spend received.
    return splitFromSums(b._sum.total, b._sum.creditApplied).collected
      - splitFromSums(a._sum.total, a._sum.creditApplied).collected;
  });

  const customerIds = grouped.map((g) => g.customerId!).filter(Boolean);
  const customers = customerIds.length > 0
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, email: true, phone: true, totalOrders: true, totalSpent: true, totalCreditSpent: true, createdAt: true },
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
        _sum: MONEY_SUM,
      })
    : [];
  const lifetimeById = new Map(
    lifetimeRows.map((r) => [r.customerId!, { orders: r._count, money: splitFromSums(r._sum.total, r._sum.creditApplied) }]),
  );

  const rows: (string | number | Date)[][] = [[
    "Customer", "Email", "Phone",
    "Orders in range", "Order value in range", "Store credit in range", "Collected in range",
    "Lifetime orders", "Lifetime spend",
    "First seen",
  ]];
  // Render "First seen" in the restaurant's timezone (matches the tz-correct
  // report pages; a raw Date stringifies to a verbose UTC string). Luigi 2026-07-01.
  const tz = scope.timezone ?? undefined;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric" });
  for (const g of grouped) {
    const c = byId.get(g.customerId!);
    if (!c) continue;
    rows.push([
      c.name,
      c.email ?? "",
      c.phone ?? "",
      g._count,
      round2(g._sum.total ?? 0),
      round2(g._sum.creditApplied ?? 0),
      round2(splitFromSums(g._sum.total, g._sum.creditApplied).collected),
      lifetimeById.get(c.id)?.orders ?? c.totalOrders,
      round2(lifetimeById.get(c.id)?.money.collected
        ?? splitFromSums(c.totalSpent, c.totalCreditSpent).collected),
      fmtDate(c.createdAt),
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
