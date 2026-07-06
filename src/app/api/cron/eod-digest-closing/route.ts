/**
 * Closing-time end-of-day digest cron (every 30 minutes).
 *
 * Reseller report cmq8gfpxn (Luigi 2026-06-11): the end-of-day report should
 * arrive shortly AFTER the restaurant's closing time — "open 10:00–23:00 →
 * report ~23:00–23:30" — not the next morning, so owners can reconcile the
 * till the same night. Each pass sends only to restaurants whose business day
 * ended within the last 30 minutes in THEIR timezone; overnight closers
 * report the previous local day when they close after midnight. Idempotent
 * via Restaurant.lastEodDigestDate (the morning cron stays as a catch-up).
 * Shared logic: src/lib/digest-cron.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { runDigestSweep } from "@/lib/digest-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await runDigestSweep("closing");
  return NextResponse.json(result);
}
