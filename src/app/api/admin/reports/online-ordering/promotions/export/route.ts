import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildPromoStatRows } from "@/lib/reports/promo-rows";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/promotions/export
 *
 * Per-PROMOTION redemption breakdown for the date range — the exact rows
 * the page renders (buildPromoStatRows, appliedPromos-based).
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

  const { rows: statRows } = await buildPromoStatRows(scope.ids, range);

  const rows: (string | number)[][] = [["Code", "Promotion", "Redemptions", "Discount given", "Revenue generated"]];
  for (const r of statRows) {
    rows.push([r.code || "—", r.name, r.redemptions, r.discount, r.revenue]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "promotions-stats",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Promotions Stats",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
