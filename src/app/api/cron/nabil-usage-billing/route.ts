/**
 * /api/cron/nabil-usage-billing — Nabil AI monthly OVERAGE billing.
 *
 * vercel.json: 00:15 UTC on the 1st of each month (after marketplace-settle's
 * 00:05). Bills the calendar month that just CLOSED for every restaurant with a
 * Stripe-billed `phone_ordering` add-on: minutes × US$0.50 above the US$249.99
 * minimum → ONE Stripe invoice item on the PLATFORM customer, recorded in
 * NabilUsageCharge. Idempotent — safe to re-run any number of times (see
 * src/lib/voice/nabil-usage-billing.ts for the three guards).
 *
 * Auth (same shape as /api/cron/marketplace-settle): the Vercel cron Bearer
 * (fail-CLOSED via requireCronAuth) OR a signed-in superadmin for a manual
 * re-run, e.g. after a Stripe outage:
 *   POST /api/cron/nabil-usage-billing?month=YYYY-MM   (UTC month; must be closed)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { getSessionUser } from "@/lib/session";
import { runNabilUsageBilling } from "@/lib/voice/nabil-usage-billing";
import { parsePeriodKey } from "@/lib/voice/nabil-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  // Vercel cron sends the Bearer; a superadmin session is the manual re-run path.
  const unauthorized = requireCronAuth(req);
  if (unauthorized) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") return unauthorized;
  }

  const monthParam = req.nextUrl.searchParams.get("month");
  let monthStart: Date | undefined;
  if (monthParam) {
    const parsed = parsePeriodKey(monthParam);
    if (!parsed) return NextResponse.json({ error: "Invalid month, expected YYYY-MM" }, { status: 400 });
    monthStart = parsed;
  }

  let result: Awaited<ReturnType<typeof runNabilUsageBilling>>;
  try {
    result = await runNabilUsageBilling({ monthStart, timeBudgetMs: 50_000 });
  } catch (e: any) {
    // e.g. "refusing to bill a month that has not closed yet"
    return NextResponse.json({ error: e?.message ?? "billing failed" }, { status: 400 });
  }

  const counts = result.results.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  const invoicedCents = result.results.filter((r) => r.status === "invoiced").reduce((s, r) => s + r.overageCents, 0);
  console.log(
    `[nabil-usage-billing] period=${result.period} restaurants=${result.results.length} counts=${JSON.stringify(counts)} invoicedCents=${invoicedCents} deferred=${result.deferred}`,
  );

  return NextResponse.json({
    period: result.period,
    monthStart: result.monthStart.toISOString(),
    counts,
    invoicedCents,
    deferred: result.deferred,
    results: result.results,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
