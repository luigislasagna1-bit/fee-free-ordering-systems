import { NextRequest, NextResponse } from "next/server";
import { autoRejectStaleOrders, autoRejectStaleReservations } from "@/lib/auto-reject-orders";
import { getSessionUser } from "@/lib/session";

/**
 * POST /api/cron/auto-reject-stale-orders
 *
 * Two authorized callers:
 *   1. Vercel cron — Authorization: Bearer $CRON_SECRET
 *   2. Superadmin (manual trigger for testing)
 *
 * Scans for pending orders past the timeout window and rejects + refunds
 * them. Idempotent — re-running while no orders are stale is a no-op.
 *
 * Optional query param: ?minutes=N to override the default 10-minute
 * timeout for testing.
 */
export async function POST(req: NextRequest) {
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
  const minutesRaw = url.searchParams.get("minutes");
  const timeoutMinutes = minutesRaw ? Math.max(1, parseInt(minutesRaw, 10)) : undefined;

  const result = await autoRejectStaleOrders({ timeoutMinutes });
  // Same sweep for stale PENDING reservations — auto-decline them (Luigi
  // 2026-06-15 chose order parity). Best-effort: a reservation failure never
  // affects the order sweep result.
  let reservations = { scanned: 0, rejected: 0 };
  try {
    reservations = await autoRejectStaleReservations();
  } catch (e) {
    console.error("[auto-reject cron] reservations sweep failed", e);
  }
  return NextResponse.json({ ...result, reservations });
}

/** Vercel runs cron jobs as GET by default. Mirror so the same endpoint
 *  works for both manual POST (from superadmin) and cron GET. */
export async function GET(req: NextRequest) {
  return POST(req);
}
