import { NextRequest, NextResponse } from "next/server";
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
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await promotePendingCommissions();
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
