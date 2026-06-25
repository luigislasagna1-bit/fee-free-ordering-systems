import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { FRESHNESS_MS } from "@/lib/kitchen-devices";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/connectivity/export
 *
 * The Device Connectivity roster as CSV/XLS/PDF — the SAME devices table
 * the page renders (Device / User Agent / First Seen / Last Seen / Status),
 * scoped to the SINGLE active location (this is a per-location report; it
 * does NOT aggregate across a chain).
 *
 * Range parsing matches the page exactly: tz-aware `parseDateRangeInTz` in the
 * active location's timezone so the export honors the same ?preset/?from/?to
 * the page rendered. The page's table itself (the device roster) isn't
 * date-filtered — devices are listed by lastSeenAt regardless of range —
 * but we carry the range into the filename + metadata for a self-describing
 * file, mirroring the page header.
 */
const OFFLINE_AFTER_MS = FRESHNESS_MS;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const format = pickFormat(url);

  const scope = await resolveReportScope(user.restaurantId);

  // PER-LOCATION report — resolve the single active location and scope every
  // query to active.id (NOT scope.ids). A brand parent with no ?loc has no
  // active location → nothing to export.
  const active = resolveActiveLocation(scope, sp);
  if (!active) return NextResponse.json({ error: "Pick a location" }, { status: 400 });
  // Range in the active location's timezone — matches the page.
  const range = parseDateRangeInTz(sp, active.timezone ?? undefined);

  // EXACT same query the page runs for its visible devices table.
  const devices = await prisma.kitchenDevice.findMany({
    where: { restaurantId: active.id },
    orderBy: { lastSeenAt: "desc" },
  });

  const now = Date.now();
  const rows: (string | number)[][] = [[
    "Device", "User Agent", "First Seen", "Last Seen", "Status",
  ]];
  for (const d of devices) {
    const isOnline = !!(d.lastSeenAt && now - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS);
    rows.push([
      d.label || "Unnamed device",
      d.userAgent ?? "—",
      d.firstSeenAt ? d.firstSeenAt.toLocaleString() : "—",
      d.lastSeenAt ? d.lastSeenAt.toLocaleString() : "—",
      isOnline ? "Online" : "Offline",
    ]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "connectivity",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Device Connectivity",
      `Location: ${active.name}`,
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
