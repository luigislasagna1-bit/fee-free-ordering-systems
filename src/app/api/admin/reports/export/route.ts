import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";
import { MONEY_SUM, splitFromSums, showsCredit } from "@/lib/reports/collected";

/**
 * GET /api/admin/reports/export
 *
 * The Reports Dashboard (the landing /admin/reports page) as CSV/XLS/PDF.
 *
 * Re-runs the SAME headline queries the dashboard renders, over the SAME
 * chain-wide scope (scope.ids) with the SAME canonical predicates
 * (reportOrderWhere for the range, REPORT_ORDER_STATUS_WHERE for all-time),
 * so every exported cell reconciles with the on-screen dashboard for the
 * same URL params.
 *
 * The dashboard is multi-panel, so the export is SECTIONED (a flat rows
 * array with single-cell section-title rows + blank separators):
 *   SUMMARY            — Orders / Revenue / Average order / Customers
 *                        (this range + all-time, mirroring the KPI cards).
 *   BY LOCATION        — chain only: the per-location groupBy.
 *   REVENUE BY CURRENCY— chain + multi-currency only: per-currency totals.
 *   TOP ITEMS          — the top-8 orderItem groupBy.
 *   ORDER TYPES        — the order-type split.
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

  // Same queries the dashboard runs for its headline figures — chain-wide
  // scope.ids, canonical predicates. Run in parallel like the page does.
  const [
    rangeRevenueAgg, rangeOrders, rangeCustomerRows,
    allTimeAgg, allTimeCustomers,
    topItems, typeBreakdown,
    perLocationRaw,
  ] = await Promise.all([
    // Order value + store credit + order count for the range, in ONE aggregate.
    prisma.order.aggregate({ where: reportOrderWhere(scope.ids, range), _sum: MONEY_SUM, _count: true }),
    prisma.order.count({ where: reportOrderWhere(scope.ids, range) }),
    // Distinct known customers in the range (mirrors countDistinctCustomers).
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...reportOrderWhere(scope.ids, range), customerId: { not: null } },
    }),
    // All-time revenue + order count (the KPI cards' secondary "All time" line).
    prisma.order.aggregate({ where: { restaurantId: { in: scope.ids }, ...REPORT_ORDER_STATUS_WHERE }, _sum: MONEY_SUM, _count: true }),
    prisma.customer.count({ where: { restaurantId: { in: scope.ids } } }),
    // Top selling items (same groupBy + take as the page).
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: reportOrderWhere(scope.ids, range) },
      _count: true,
      _sum: { subtotal: true },
      orderBy: { _count: { name: "desc" } },
      take: 8,
    }),
    // Order-type split.
    prisma.order.groupBy({
      by: ["type"],
      where: reportOrderWhere(scope.ids, range),
      _count: true,
    }),
    // Per-location breakdown (chain only).
    scope.isChain
      ? prisma.order.groupBy({ by: ["restaurantId"], where: reportOrderWhere(scope.ids, range), _count: true, _sum: MONEY_SUM })
      : Promise.resolve([] as Array<{ restaurantId: string; _count: number; _sum: { total: number | null; creditApplied: number | null } }>),
  ]);

  // Store credit is a TENDER, not income: "Revenue" here is COLLECTED money,
  // with order value + credit redeemed listed beside it so the export reconciles
  // with the dashboard AND with the Sales Summary.
  const rangeMoney = splitFromSums(rangeRevenueAgg._sum.total, rangeRevenueAgg._sum.creditApplied);
  const rangeCustomers = rangeCustomerRows.length;
  const rangeAvg = rangeOrders > 0 ? rangeMoney.collected / rangeOrders : 0;
  const allTimeMoney = splitFromSums(allTimeAgg._sum.total, allTimeAgg._sum.creditApplied);
  const allTimeOrders = allTimeAgg._count;
  const creditShown = showsCredit(rangeMoney) || showsCredit(allTimeMoney);

  // Per-location rows joined to the scope's location list, sorted by revenue —
  // identical shape + ordering to the dashboard's LocationBreakdown table.
  const perLocById = new Map(
    (perLocationRaw as Array<{ restaurantId: string; _count: number; _sum: { total: number | null; creditApplied: number | null } }>)
      .map((r) => [r.restaurantId, { orders: r._count, money: splitFromSums(r._sum.total, r._sum.creditApplied) }]),
  );
  const locationRows = scope.locations
    .map((l) => {
      const s = perLocById.get(l.id);
      return {
        name: l.name, currency: l.currency, orders: s?.orders ?? 0,
        revenue: s?.money.collected ?? 0,
        orderValue: s?.money.orderValue ?? 0,
        credit: s?.money.creditSpent ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Per-currency revenue (multi-currency chain only), parent's currency first —
  // mirrors the dashboard's revenueByCurrency chips.
  const revenueByCurrency: [string, number][] = scope.isChain && scope.mixedCurrency
    ? Array.from(
        locationRows.reduce((m, l) => m.set(l.currency, (m.get(l.currency) ?? 0) + l.revenue), new Map<string, number>()).entries(),
      ).sort((a, b) => (a[0] === scope.currency ? -1 : b[0] === scope.currency ? 1 : a[0].localeCompare(b[0])))
    : [];

  const orderTypeLabel = (tp: string | null): string =>
    tp === "pickup" ? "Pickup" : tp === "delivery" ? "Delivery" : tp === "dine_in" ? "Dine in" : (tp ?? "—");

  // ── Build the sectioned, flat rows array ──────────────────────────────
  const rows: (string | number)[][] = [];

  // SUMMARY
  rows.push(["SUMMARY"]);
  rows.push(["Metric", "This range", "All-time"]);
  rows.push(["Orders", rangeOrders, allTimeOrders]);
  if (creditShown) {
    rows.push(["Order value", round2(rangeMoney.orderValue), round2(allTimeMoney.orderValue)]);
    rows.push(["Store credit redeemed", round2(rangeMoney.creditSpent), round2(allTimeMoney.creditSpent)]);
  }
  rows.push([creditShown ? "Collected" : "Revenue", round2(rangeMoney.collected), round2(allTimeMoney.collected)]);
  rows.push(["Average order", round2(rangeAvg), ""]);
  rows.push(["Customers", rangeCustomers, allTimeCustomers]);
  rows.push([]);

  // BY LOCATION (chain only)
  if (scope.isChain) {
    rows.push(["BY LOCATION"]);
    rows.push(creditShown
      ? ["Location", "Orders", "Order value", "Store credit redeemed", "Collected"]
      : ["Location", "Orders", "Revenue"]);
    for (const l of locationRows) {
      rows.push(creditShown
        ? [l.name, l.orders, round2(l.orderValue), round2(l.credit), round2(l.revenue)]
        : [l.name, l.orders, round2(l.revenue)]);
    }
    rows.push([]);
  }

  // REVENUE BY CURRENCY (chain + multi-currency only)
  if (revenueByCurrency.length > 0) {
    rows.push([creditShown ? "COLLECTED BY CURRENCY" : "REVENUE BY CURRENCY"]);
    rows.push(["Currency", creditShown ? "Collected" : "Revenue"]);
    let currencyTotal = 0;
    for (const [cur, rev] of revenueByCurrency) {
      rows.push([cur.toUpperCase(), round2(rev)]);
      currencyTotal += rev;
    }
    rows.push(["Total", round2(currencyTotal)]);
    rows.push([]);
  }

  // TOP ITEMS
  rows.push(["TOP ITEMS"]);
  rows.push(["Item", "Qty", "Revenue"]);
  for (const it of topItems) rows.push([it.name, it._count, round2(it._sum.subtotal ?? 0)]);
  rows.push([]);

  // ORDER TYPES
  rows.push(["ORDER TYPES"]);
  rows.push(["Type", "Orders"]);
  for (const tp of ["pickup", "delivery", "dine_in"] as const) {
    const row = typeBreakdown.find((r) => r.type === tp);
    rows.push([orderTypeLabel(tp), row?._count ?? 0]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "dashboard-summary",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      `Reports Dashboard — ${scope.brandName}`,
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
