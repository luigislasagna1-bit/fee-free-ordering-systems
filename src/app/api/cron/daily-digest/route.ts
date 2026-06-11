/**
 * Morning digest cron (08:00 UTC daily).
 *
 * Since the closing-time sweep shipped (reseller report cmq8gfpxn — the
 * end-of-day report now goes out shortly after each restaurant's closing
 * time via /api/cron/eod-digest-closing), this morning run is a CATCH-UP:
 * it sends yesterday's report only to restaurants the closing sweep missed
 * (cron jitter, deploy gaps), and still carries the monthly digest on the
 * 1st (evaluated per restaurant in its own timezone). All real logic lives
 * in src/lib/digest-cron.ts, shared by both crons.
 */
import { NextRequest, NextResponse } from "next/server";
import { runDigestSweep } from "@/lib/digest-cron";

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
  const result = await runDigestSweep("morning");
  return NextResponse.json(result);
}
