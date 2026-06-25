import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere, REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/clients/export
 *
 * The Clients dashboard as CSV/XLS/PDF. The page is a KPI overview (not a
 * row-per-client list — that lives at /admin/reports/list/clients), so the
 * export is a Metric/Value table of EXACTLY the figures the page renders:
 * Total / New / Returning clients, Avg orders per client, and the Spend
 * Overview block (total spend in range + spend from returning clients).
 *
 * Re-runs the SAME two groupBy queries the page runs, over the SAME
 * chain-wide scope (scope.ids), with the SAME canonical predicates
 * (reportOrderWhere + REPORT_ORDER_STATUS_WHERE) — so the exported numbers
 * reconcile cell-for-cell with the dashboard for identical URL params.
 *
 * No "Total" row: the page itself shows no totals row.
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

  // Identical to the page: customers who ordered IN range, and (separately)
  // who ordered BEFORE range, to split new vs returning. Chain-wide scope.ids.
  const [inRange, prior] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { ...reportOrderWhere(scope.ids, range), customerId: { not: null } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        restaurantId: { in: scope.ids },
        ...REPORT_ORDER_STATUS_WHERE,
        customerId: { not: null },
        createdAt: { lt: range.from },
      },
    }),
  ]);

  const priorIds = new Set(prior.map((p) => p.customerId));
  const returning = inRange.filter((r) => priorIds.has(r.customerId));
  const newInRange = inRange.filter((r) => !priorIds.has(r.customerId));
  const totalOrders = inRange.reduce((s, r) => s + r._count, 0);
  const totalSpend = inRange.reduce((s, r) => s + (r._sum.total ?? 0), 0);
  const returningSpend = returning.reduce((s, r) => s + (r._sum.total ?? 0), 0);
  const avgOrders = inRange.length > 0 ? totalOrders / inRange.length : 0;
  const returningPct = inRange.length > 0 ? (returning.length / inRange.length) * 100 : 0;

  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Total clients", inRange.length],
    ["New clients", newInRange.length],
    ["Returning clients", returning.length],
    ["Avg orders per client", round2(avgOrders)],
    ["Total spend in range", round2(totalSpend)],
    ["Spend from returning clients", round2(returningSpend)],
    ["Returning clients (%)", round2(returningPct)],
  ];

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "online-clients",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Online Ordering — Clients",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
