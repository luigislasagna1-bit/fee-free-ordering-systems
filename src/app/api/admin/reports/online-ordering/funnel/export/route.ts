import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/funnel/export
 *
 * The Conversion Funnel table as CSV/XLS/PDF — the SAME per-step rows the
 * page renders. For each funnel step we emit its label, the count of
 * DISTINCT sessions that reached it, and the "% of previous step"
 * conversion column the page shows next to each bar.
 *
 * The data query mirrors the page EXACTLY: groupBy (step, sessionHash)
 * scoped to scope.ids over the same tz-aware range, then count distinct
 * sessions per step in JS. No reportOrderWhere here — this is the
 * WebsiteFunnelEvent table, not Order.
 *
 * The page has no totals row (its three headline stats are separate
 * summary cards, not a table TOTAL line), so we emit no "Total" row.
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

  // Canonical funnel step order — labels here are the ENGLISH equivalents
  // of the page's t("step…") strings (export headers/labels are always
  // English, like every other export route).
  const FUNNEL_STEPS = [
    { id: "visit",         label: "Visit" },
    { id: "menu_browsed",  label: "Menu browsed" },
    { id: "item_added",    label: "Item added" },
    { id: "checkout_open", label: "Checkout opened" },
    { id: "checkout_info", label: "Customer details" },
    { id: "payment_open",  label: "Payment reached" },
    { id: "order_placed",  label: "Order placed" },
  ] as const;

  // Same query the page runs: one row per (step, distinct session), then
  // count rows per step → distinct sessions at that step.
  const events = await prisma.websiteFunnelEvent.groupBy({
    by: ["step", "sessionHash"],
    where: { restaurantId: { in: scope.ids }, createdAt: { gte: range.from, lte: range.to } },
  });

  const counts = new Map<string, number>();
  for (const e of events) {
    counts.set(e.step, (counts.get(e.step) ?? 0) + 1);
  }
  const stepCounts = FUNNEL_STEPS.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));

  const rows: (string | number)[][] = [["Step", "Sessions", "% of previous step"]];
  for (let i = 0; i < stepCounts.length; i++) {
    const s = stepCounts[i];
    const prev = i > 0 ? stepCounts[i - 1].count : null;
    // Mirror the page: step 0 (visit) is the baseline → no drop-off ("—");
    // otherwise count/prev as a whole-percent like the page's bars.
    const conversion = prev && prev > 0 ? round2((s.count / prev) * 100) : null;
    rows.push([s.label, s.count, conversion === null ? "—" : conversion]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "conversion-funnel",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Online Ordering — Conversion Funnel",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
