import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { buildReportSnapshots } from "@/lib/reports/snapshot-builder";

/**
 * POST/GET /api/cron/reports-snapshot
 *
 * Rolls up yesterday's Order activity into the ReportDailySnapshot
 * table. Scheduled at 3am UTC daily (see vercel.json).
 *
 * Two authorized callers:
 *   1. Vercel cron — Authorization: Bearer $CRON_SECRET
 *   2. Superadmin (manual trigger for rebuilds + testing)
 *
 * Query params:
 *   ?days=N         — rebuild the last N days instead of just yesterday.
 *                     Capped at 90 inside the builder. Use for backfills
 *                     after changing the snapshot logic.
 *   ?restaurantId=  — limit the rebuild to one restaurant. Useful when
 *                     a single restaurant reported a discrepancy.
 *
 * Idempotent: re-running on the same day produces an identical row.
 * Pure read + upsert; no destructive operations.
 */
async function run(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Math.max(1, parseInt(daysRaw, 10)) : 1;
  const restaurantId = url.searchParams.get("restaurantId") || undefined;

  try {
    const result = await buildReportSnapshots({ days, restaurantId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/reports-snapshot] failed", { err: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
