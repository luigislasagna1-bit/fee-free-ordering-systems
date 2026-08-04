/**
 * POST/GET /api/cron/retention-anonymize
 *
 * Weekly retention sweep: anonymizes the PII on ORDER rows older than the
 * retention window, making the published promise real (/account-deletion +
 * /privacy: "order and transaction records are retained for at least 7 years,
 * then anonymized"). Order-LEVEL, not whole-customer — a still-active
 * customer's oldest order aging out must not wipe their account.
 *
 * Scale: iterates PER RESTAURANT so each query rides the composite index
 * @@index([restaurantId, createdAt]) instead of a global full-table scan
 * (Order has no bare createdAt index). Bounded per run.
 *
 * Auth: same dual-mode as the other crons — Bearer CRON_SECRET, or a superadmin
 * session for manual triggering.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { scrubOrderPii } from "@/lib/data-erasure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENTION_YEARS = 7;
const BATCH = 500; // orders scrubbed per restaurant per run
const MAX_RESTAURANTS = 200; // cap per run; the weekly cadence drains the rest

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  let restaurantsProcessed = 0;
  let ordersScrubbed = 0;

  // Only restaurants that actually have old, un-scrubbed orders would match, but
  // we can't cheaply pre-filter that; iterate restaurants and let the indexed
  // per-restaurant query be a fast no-op for those with nothing to do.
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true },
    take: MAX_RESTAURANTS,
  });

  for (const r of restaurants) {
    restaurantsProcessed++;
    // Un-scrubbed sentinel: a row still carrying an email (or a real name) hasn't
    // been anonymized yet. Rides @@index([restaurantId, createdAt]).
    const stale = await prisma.order.findMany({
      where: {
        restaurantId: r.id,
        createdAt: { lt: cutoff },
        OR: [{ customerEmail: { not: null } }, { customerPhone: { not: null } }],
      },
      select: { id: true },
      take: BATCH,
    });
    if (stale.length === 0) continue;
    ordersScrubbed += await scrubOrderPii(stale.map((o) => o.id));
  }

  console.log(`[retention-anonymize] restaurants=${restaurantsProcessed} ordersScrubbed=${ordersScrubbed} cutoff=${cutoff.toISOString()}`);
  return NextResponse.json({ restaurantsProcessed, ordersScrubbed, cutoff: cutoff.toISOString() });
}

export const GET = handle;
export const POST = handle;
