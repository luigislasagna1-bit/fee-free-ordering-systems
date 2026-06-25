import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { resolveReportScope, resolveActiveLocation } from "@/lib/reports/report-scope";
import { hasFeature } from "@/lib/entitlements";
import { runSeoHealthChecks } from "@/lib/seo/health-check";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/google-rank/export
 *
 * The SEO Health checklist as CSV/XLS/PDF — the SAME 7 success-factor
 * rows the page renders (one per `runSeoHealthChecks` result). This is a
 * PER-LOCATION report with NO date range (SEO is a "current state"
 * question), so the export re-runs the exact same checks the page shows
 * for the chosen `?loc=` location.
 *
 * Columns mirror the page's three visible fields per row:
 *   Factor (check label) · Status (OK / Fix N / Unknown) · What to do (hint).
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

  // Per-location report — a brand parent must pick a location (SEO can't
  // aggregate across a chain). Single restaurant resolves to itself.
  const active = resolveActiveLocation(scope, sp);
  if (!active) return NextResponse.json({ error: "Pick a location" }, { status: 400 });

  // Re-run the EXACT same query + checks the page runs for active.id.
  const [restaurant, hasHostedSite] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: active.id },
      select: {
        id: true, slug: true, name: true, description: true, cuisineType: true,
        phone: true, address: true, city: true, state: true, zip: true,
        socialLinks: true, subdomain: true, customDomain: true, customDomainStatus: true,
      },
    }),
    hasFeature(active.id, "hosted_marketing_page"),
  ]);
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const checks = await runSeoHealthChecks(restaurant, { hasHostedSite });

  const rows: (string | number)[][] = [["Factor", "Status", "What to do"]];
  for (const c of checks) {
    const status =
      c.status === "ok" ? "OK" :
      c.status === "unknown" ? "Unknown" :
      `Fix ${c.problemCount} problem${c.problemCount === 1 ? "" : "s"}`;
    rows.push([c.label, status, c.hint ?? ""]);
  }

  // No date range on this report — stamp the file with today's date so
  // the filename stays unique + the export-response contract is satisfied,
  // and OMIT the "Range:" metadata line.
  const today = toISODate(new Date());

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "google-ranking",
    fromISO: today,
    toISO: today,
    format,
    rows,
    metadata: [
      "Google Ranking",
      `Location: ${active.name}`,
    ],
  });
}
