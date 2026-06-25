import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate, eachDay, formatChartDate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { CHANNELS, type ChannelSlug } from "@/lib/reports/channels";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/visits/export
 *
 * The Website Visits table as CSV/XLS/PDF — the SAME rows the page
 * renders: one row per day in range, one column per channel that has at
 * least one visit (in CHANNELS display order), a Total column, plus a
 * bold TOTAL row. Re-runs the page's exact WebsiteVisit query + the same
 * day × channel bucketing so the export reconciles with the visible table
 * for the same URL params.
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

  // EXACT same query the page runs for its visible table.
  const visits = await prisma.websiteVisit.findMany({
    where: { restaurantId: { in: scope.ids }, createdAt: { gte: range.from, lte: range.to } },
    select: { channel: true, createdAt: true },
  });

  // Two-level bucket: day → channel → count, zero-filled — mirrors the page.
  const days = eachDay(range);
  const buckets = new Map<string, Map<ChannelSlug, number>>();
  for (const d of days) {
    const m = new Map<ChannelSlug, number>();
    for (const c of CHANNELS) m.set(c.slug, 0);
    buckets.set(d.toDateString(), m);
  }
  for (const v of visits) {
    const k = new Date(v.createdAt).toDateString();
    const m = buckets.get(k);
    if (!m) continue;
    const slug = (v.channel as ChannelSlug) || "direct";
    m.set(slug, (m.get(slug) ?? 0) + 1);
  }
  const totals = new Map<ChannelSlug, number>();
  for (const c of CHANNELS) totals.set(c.slug, 0);
  for (const m of buckets.values()) {
    for (const [k, v] of m.entries()) totals.set(k, (totals.get(k) ?? 0) + v);
  }
  // Only channels with visits are visible columns on the page — match that.
  const activeChannels = CHANNELS.filter((c) => (totals.get(c.slug) ?? 0) > 0);

  // Headers: Date + one per active channel (English label) + Total.
  const out: (string | number)[][] = [
    ["Date", ...activeChannels.map((c) => c.label), "Total"],
  ];
  for (const d of days) {
    const m = buckets.get(d.toDateString())!;
    const dayTotal = activeChannels.reduce((s, c) => s + (m.get(c.slug) ?? 0), 0);
    out.push([
      formatChartDate(d),
      ...activeChannels.map((c) => m.get(c.slug) ?? 0),
      dayTotal,
    ]);
  }
  // The page renders a bold totals row at the bottom — include it.
  out.push([
    "Total",
    ...activeChannels.map((c) => totals.get(c.slug) ?? 0),
    activeChannels.reduce((s, c) => s + (totals.get(c.slug) ?? 0), 0),
  ]);

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "website-visits",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows: out,
    metadata: [
      "Website Visits",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
