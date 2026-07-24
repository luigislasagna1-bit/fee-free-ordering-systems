import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";
import { buildDriverPayoutsForWeek } from "@/lib/driver-payout";
import { deliveryWeekStart, previousDeliveryWeekStart } from "@/lib/feefree-delivery";

export const dynamic = "force-dynamic";

/**
 * POST /api/superadmin/driver-payouts/build?weekStart=YYYY-MM-DD
 *
 * Materialize/refresh the PENDING DriverPayout rows for a Sat→Fri week. Idempotent
 * (read-then-conditional-write per driver-week; a `paid` row is never touched).
 * Omit weekStart to build the week that just closed (prior Sat→Fri).
 *
 * Two callers, mirroring the marketplace/delivery settle crons: Vercel cron
 * (Bearer CRON_SECRET) or a superadmin. Read-only for restaurants; this is
 * platform money-ops, so superadmin (not platform_support).
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await requireSuperadmin();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekParam = new URL(req.url).searchParams.get("weekStart");
  let weekStart: Date;
  if (weekParam) {
    const m = weekParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NextResponse.json({ error: "Invalid weekStart, expected YYYY-MM-DD" }, { status: 400 });
    // Noon Toronto so the Sat→Fri snap can't be knocked into an adjacent week.
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    weekStart = deliveryWeekStart(d);
  } else {
    weekStart = previousDeliveryWeekStart(new Date());
  }

  const built = await buildDriverPayoutsForWeek({ weekStart });
  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    built: built.length,
    rows: built,
  });
}

// Vercel Cron issues GET; the superadmin "Build week" button POSTs. Both share `handle`.
export const GET = handle;
export const POST = handle;
