import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/reservations/export
 *
 * The Table Reservations status breakdown as CSV/XLS/PDF — the SAME rows
 * the page renders: one row per reservation status with Bookings, Guests,
 * and % of total. RE-RUNS THE EXACT query the page uses
 * (prisma.reservation.groupBy by status, scoped to scope.ids, filtered on
 * the legacy "YYYY-MM-DD" string `date` column via toISODate(range)), so
 * the export reconciles cell-for-cell with the visible table for the same
 * URL params. The page shows summary totals in its header but no totals
 * ROW in the table, so we omit a "Total" row to stay faithful.
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

  // Identical query to the page's visible table.
  const grouped = await prisma.reservation.groupBy({
    by: ["status"],
    where: {
      restaurantId: { in: scope.ids },
      date: { gte: toISODate(range.from), lte: toISODate(range.to) },
    },
    _count: { _all: true },
    _sum: { partySize: true },
  });

  const total = grouped.reduce((s, r) => s + r._count._all, 0);

  const rows: (string | number)[][] = [[
    "Status", "Bookings", "Guests", "% of total",
  ]];
  for (const r of grouped) {
    const pct = total > 0 ? (r._count._all / total) * 100 : 0;
    rows.push([
      r.status.replace("_", " "),
      r._count._all,
      r._sum.partySize ?? 0,
      round2(pct),
    ]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "reservations",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Table Reservations",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
