import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { buildTodaySnapshot, buildDayReport, currentOperationalDayKey } from "@/lib/digests";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/end-of-day/export
 *
 * The End-of-Day report as CSV/XLS/PDF. The page is a single-day operational
 * snapshot (not a row-per-order list), so the export is a comprehensive
 * Metric/Value table of EXACTLY the figures the page renders — grouped into
 * SUMMARY / ORDER CHANNELS / PAYMENTS / SALES BREAKDOWN sections (single-cell
 * section titles + blank separators).
 *
 * Per-location for chains: the page shows a LocationChooser when no `?loc=` is
 * picked, so the export requires an active location too. It re-runs the EXACT
 * same builder (buildTodaySnapshot for the live operational day, buildDayReport
 * for a past day) against active.id for the SAME `?date` the page resolves — so
 * the exported numbers reconcile cell-for-cell with the dashboard.
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
  const active = resolveActiveLocation(scope, sp);
  if (!active) return NextResponse.json({ error: "Pick a location" }, { status: 400 });

  // Resolve the operational day exactly as the page does: default to the live
  // operational day, accept an array-safe `?date=` clamped to the 7-day window.
  const LOOKBACK_DAYS = 7;
  const todayKey = await currentOperationalDayKey(active.id);
  if (!todayKey) return NextResponse.json({ error: "No operational day" }, { status: 400 });
  const minDayKey = shiftKey(todayKey, -LOOKBACK_DAYS);
  let dayKey = todayKey;
  const spDate = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  if (spDate && /^\d{4}-\d{2}-\d{2}$/.test(spDate)) {
    dayKey = spDate < minDayKey ? minDayKey : spDate > todayKey ? todayKey : spDate;
  }
  const isToday = dayKey === todayKey;

  const snapshot = isToday
    ? await buildTodaySnapshot(active.id)
    : await buildDayReport(active.id, dayKey);
  if (!snapshot) return NextResponse.json({ error: "No data for that day" }, { status: 400 });

  const rows: (string | number)[][] = [
    ["SUMMARY"],
    ["Metric", "Value"],
    ["Date", dayKey],
    ["Sales", round2(snapshot.sales)],
    ["Orders", snapshot.orders],
    ["Average order value", round2(snapshot.avgOrderValue)],
    ["Table reservations", snapshot.tableReservations],
    [],
    ["ORDER CHANNELS"],
    ["Channel", "Orders", "Sales"],
    ["Pickup", snapshot.pickupOrders, round2(snapshot.pickupSales)],
    ["Delivery", snapshot.deliveryOrders, round2(snapshot.deliverySales)],
    ["Dine-in", snapshot.dineInOrders, round2(snapshot.dineInSales)],
    [],
    ["PAYMENTS"],
    ["Method", "Amount", "Count"],
    ["Online", round2(snapshot.onlinePaymentsAmount), snapshot.onlinePayments],
    ["Offline/Cash", round2(snapshot.offlinePaymentsAmount), snapshot.offlinePayments],
    [],
    ["SALES BREAKDOWN"],
    ["Line", "Amount"],
    ["Subtotal", round2(snapshot.subTotals)],
    // Discounts + store-credit reconciliation rows — the page renders them
    // (b0242876) but this export was missed, so the file an owner hands the
    // bookkeeper didn't reconcile (audit 2026-07-11). Nonzero-gated like the page.
    ...(round2(snapshot.discounts ?? 0) > 0 ? [["Discounts", -round2(snapshot.discounts)]] : []),
    ["Tax", round2(snapshot.taxAmount)],
    ["Delivery fees", round2(snapshot.deliveryFees)],
    ["Tips", round2(snapshot.tips)],
    ["Other fees", round2(snapshot.otherFees)],
    ["Total", round2(snapshot.total)],
    ...(round2(snapshot.storeCreditRedeemed ?? 0) > 0
      ? [
          ["Store credit redeemed", -round2(snapshot.storeCreditRedeemed)],
          ["Collected (cash/card)", round2(snapshot.collected ?? Math.max(0, snapshot.total - snapshot.storeCreditRedeemed))],
        ]
      : []),
  ];

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "end-of-day",
    fromISO: dayKey,
    toISO: dayKey,
    format,
    rows,
    metadata: [
      "End of Day Report",
      `Date: ${dayKey}`,
    ],
  });
}

/** Shift a YYYY-MM-DD operational-day key by `delta` days (UTC-noon anchored,
 *  matching the page's stepper math). */
function shiftKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
