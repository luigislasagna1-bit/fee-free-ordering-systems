import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseDateRange, toISODate } from "@/lib/reports/date-range";
import { haversineKm } from "@/lib/geocode";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/heatmap/export
 *
 * The Delivery Heatmap's actionable layer as CSV/XLS/PDF — the SAME
 * per-zone breakdown table the page renders ("Orders by zone"): one row
 * per active delivery zone (smallest-radius-first) with order count +
 * share, plus the "Outside all zones" row when applicable.
 *
 * PER-LOCATION report: geography can't aggregate across a chain, so we
 * scope to the single ?loc=<id> location (active.id) exactly like the
 * page. The page reads its range with the server-local parseDateRange,
 * so we match that here (NOT the tz variant) to keep the export's rows
 * identical to the page's table for the same URL params.
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

  const range = parseDateRange(sp);

  // Same restaurant + zones load the page uses for its breakdown.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: active.id },
    select: {
      id: true, lat: true, lng: true,
      deliveryZones: {
        where: { isActive: true },
        select: { name: true, radiusKm: true, color: true },
        orderBy: { radiusKm: "asc" },
      },
    },
  });
  if (!restaurant || restaurant.lat == null || restaurant.lng == null) {
    return NextResponse.json({ error: "Location not configured for heatmap" }, { status: 400 });
  }

  // Re-run the page's EXACT delivery-orders query for active.id.
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: active.id,
      type: "delivery",
      status: { not: "rejected" },
      deliveryLat: { not: null },
      deliveryLng: { not: null },
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { deliveryLat: true, deliveryLng: true },
  });

  const points = orders
    .filter((o): o is { deliveryLat: number; deliveryLng: number } => o.deliveryLat != null && o.deliveryLng != null)
    .map((o) => ({ lat: o.deliveryLat, lng: o.deliveryLng }));

  // Identical zone-hit computation as the page: each point counts once
  // into the SMALLEST containing zone (zones pre-sorted asc).
  const zoneStats = restaurant.deliveryZones.map((z) => ({ ...z, hits: 0 }));
  for (const p of points) {
    const dKm = haversineKm(restaurant.lat, restaurant.lng, p.lat, p.lng);
    for (const z of zoneStats) {
      if (dKm <= z.radiusKm) { z.hits += 1; break; }
    }
  }
  const outsideAllZones = points.length - zoneStats.reduce((s, z) => s + z.hits, 0);

  // First row = ENGLISH headers mirroring the page's visible columns
  // (Zone / Radius / Orders / Share). One row per zone, then the
  // "Outside all zones" row when the page would show it.
  const rows: (string | number)[][] = [["Zone", "Radius (km)", "Orders", "Share %"]];
  for (const z of zoneStats) {
    const pct = points.length > 0 ? (z.hits / points.length) * 100 : 0;
    rows.push([z.name, z.radiusKm, z.hits, round2(pct)]);
  }
  if (outsideAllZones > 0) {
    rows.push([
      "Outside all zones",
      "—",
      outsideAllZones,
      points.length > 0 ? round2((outsideAllZones / points.length) * 100) : 0,
    ]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "delivery-heatmap",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Delivery Heatmap",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
      `Points plotted: ${points.length}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
