import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { promotePendingCommissions } from "@/lib/commission";

/**
 * Daily cron job: promote commissions from `pending` → `available` once the
 * 7-day hold has elapsed. Wired up in vercel.json:
 *
 *   { "crons": [{ "path": "/api/cron/commissions", "schedule": "0 7 * * *" }] }
 *
 * Vercel sets the `Authorization: Bearer <CRON_SECRET>` header on Cron-
 * triggered invocations. We accept that, or any caller in dev when CRON_SECRET
 * isn't configured.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const result = await promotePendingCommissions();
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
