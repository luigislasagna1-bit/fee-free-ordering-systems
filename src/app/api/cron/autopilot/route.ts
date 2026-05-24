/**
 * POST/GET /api/cron/autopilot
 *
 * Hourly cron that fires every enabled autopilot campaign across every
 * active restaurant. Idempotent via the AutopilotSend de-dup table so
 * running the cron more often than strictly necessary is safe.
 *
 * Auth: same dual-mode pattern as the other crons — Vercel cron sends
 * `Authorization: Bearer ${CRON_SECRET}`, OR a superadmin session can
 * trigger manually for testing.
 *
 * Returns JSON summary suitable for piping to logs / Slack.
 */
import { NextRequest, NextResponse } from "next/server";
import { runAutopilotForAllRestaurants } from "@/lib/autopilot";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  // Auth gate
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const start = Date.now();
  const summaries = await runAutopilotForAllRestaurants();

  // Aggregate the per-restaurant summaries for the audit log.
  const totals = summaries.reduce(
    (acc, s) => {
      for (const r of s.results) {
        acc.eligible += r.eligible;
        acc.sent += r.sent;
        acc.errors += r.errors;
        acc.byType[r.campaignType] = (acc.byType[r.campaignType] ?? 0) + r.sent;
      }
      return acc;
    },
    { eligible: 0, sent: 0, errors: 0, byType: {} as Record<string, number> },
  );

  console.log(
    `[autopilot] restaurants=${summaries.length} sent=${totals.sent} errors=${totals.errors} byType=${JSON.stringify(totals.byType)} elapsedMs=${Date.now() - start}`,
  );

  return NextResponse.json({
    restaurantsConsidered: summaries.length,
    totals,
    summaries,
    elapsedMs: Date.now() - start,
  });
}

export const GET  = handle;
export const POST = handle;
