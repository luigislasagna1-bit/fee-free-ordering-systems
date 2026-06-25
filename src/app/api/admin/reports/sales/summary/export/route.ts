import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildSummaryRows, isSummaryDim, type SummaryDim } from "@/lib/reports/summary-rows";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/sales/summary/export
 *
 * The Summary table as CSV/XLS — same rows the page renders (full money
 * breakdown via buildSummaryRows) plus a bold TOTAL row. The grouping
 * dimension is in `?by=` (day / week / month / paymentMethod / type).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const dim: SummaryDim = isSummaryDim(sp.by) ? sp.by : "day";
  const format = pickFormat(url);

  const scope = await resolveReportScope(user.restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  const { rows, totals } = await buildSummaryRows(scope.ids, range, dim, scope.timezone ?? undefined);

  const dimHeader = dimHeaderLabel(dim);
  const out: (string | number)[][] = [
    [dimHeader, "Orders", "Subtotal", "Tax", "Delivery fee", "Tips", "Other fees", "Total"],
  ];
  for (const r of rows) {
    out.push([
      exportLabel(dim, r.key), r.orders,
      round2(r.subtotal), round2(r.tax), round2(r.deliveryFee), round2(r.tips), round2(r.otherFees), round2(r.total),
    ]);
  }
  out.push([
    "Total", totals.orders,
    round2(totals.subtotal), round2(totals.tax), round2(totals.deliveryFee), round2(totals.tips), round2(totals.otherFees), round2(totals.total),
  ]);

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: `sales-summary-by-${dim}`,
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows: out,
    metadata: [
      `Sales Summary — by ${dimHeader}`,
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function dimHeaderLabel(d: SummaryDim): string {
  return d === "day" ? "Day" : d === "week" ? "Week" : d === "month" ? "Month"
    : d === "paymentMethod" ? "Payment method" : "Order type";
}

function prettify(raw: string): string {
  return raw.split(/[_\s]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function exportLabel(d: SummaryDim, key: string): string {
  if (key === "—" || !key) return "—";
  if (d === "day") return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (d === "month") return new Date(`${key}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (d === "week") {
    const start = new Date(`${key}T12:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const f = (dt: Date, y: boolean) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) });
    return `${f(start, false)} – ${f(end, true)}`;
  }
  if (d === "type") return key === "dine_in" ? "Dine in" : prettify(key);
  return prettify(key);
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
