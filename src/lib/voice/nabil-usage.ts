/**
 * Nabil AI metering — how many billable minutes a restaurant used in a window.
 *
 * ONE aggregate query per call (no per-call rows come back, no take-cap that
 * could silently under-bill a busy store): SUM(CEIL(durationSeconds / 60))
 * over VoiceCall, rounding UP per call exactly like billedMinutes() in
 * nabil-billing.ts (the two must agree — see nabil-usage-billing.test.ts).
 * Uses the existing VoiceCall @@index([restaurantId, startedAt]).
 *
 * What counts: every call with a recorded duration > 0 whose startedAt falls in
 * [start, end). Outcome is deliberately NOT filtered — a spam / abandoned /
 * transferred call still consumed Nabil minutes (and cost us model + Twilio
 * time), and Luigi's price is per call-minute. In-progress calls (durationSeconds
 * null) are not counted until they end; the stale-call sweep closes orphans.
 */
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export interface NabilUsage {
  calls: number;
  minutes: number;
}

/** Billable minutes + call count for ONE restaurant in [start, end). */
export async function fetchNabilUsage(restaurantId: string, start: Date, end: Date): Promise<NabilUsage> {
  const rows = await prisma.$queryRaw<Array<{ calls: number | bigint; minutes: number | bigint | null }>>`
    SELECT COUNT(*)::int AS calls,
           COALESCE(SUM(CEIL("durationSeconds"::numeric / 60)), 0)::int AS minutes
    FROM "VoiceCall"
    WHERE "restaurantId" = ${restaurantId}
      AND "startedAt" >= ${start}
      AND "startedAt" < ${end}
      AND "durationSeconds" > 0
  `;
  const r = rows[0];
  return { calls: Number(r?.calls ?? 0), minutes: Number(r?.minutes ?? 0) };
}

/**
 * Same aggregate for MANY restaurants at once (the monthly cron): one grouped
 * query over an explicit id list, so N subscribed stores never become N
 * round-trips. Restaurants with no calls are simply absent from the map.
 */
export async function fetchNabilUsageByRestaurant(
  restaurantIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, NabilUsage>> {
  const out = new Map<string, NabilUsage>();
  if (restaurantIds.length === 0) return out;
  const rows = await prisma.$queryRaw<Array<{ restaurantId: string; calls: number | bigint; minutes: number | bigint | null }>>`
    SELECT "restaurantId",
           COUNT(*)::int AS calls,
           COALESCE(SUM(CEIL("durationSeconds"::numeric / 60)), 0)::int AS minutes
    FROM "VoiceCall"
    WHERE "restaurantId" IN (${Prisma.join(restaurantIds)})
      AND "startedAt" >= ${start}
      AND "startedAt" < ${end}
      AND "durationSeconds" > 0
    GROUP BY "restaurantId"
  `;
  for (const r of rows) out.set(r.restaurantId, { calls: Number(r.calls), minutes: Number(r.minutes ?? 0) });
  return out;
}
