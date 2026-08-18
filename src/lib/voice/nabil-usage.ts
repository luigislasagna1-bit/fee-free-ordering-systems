/**
 * Nabil AI metering — how many billable seconds a restaurant used in a window.
 *
 * ONE aggregate query per call (no per-call rows come back, no take-cap that
 * could silently under-bill a busy store): SUM("durationSeconds") over
 * VoiceCall — per-second billing, no per-call rounding.
 * Uses the existing VoiceCall @@index([restaurantId, startedAt]).
 *
 * What counts: every call with a recorded duration > 0 whose startedAt falls in
 * [start, end). Outcome is deliberately NOT filtered — a spam / abandoned /
 * transferred call still consumed Nabil seconds (and cost us model + Twilio
 * time), and Luigi's price is per second. In-progress calls (durationSeconds
 * null) are not counted until they end; the stale-call sweep closes orphans.
 */
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export interface NabilUsage {
  calls: number;
  seconds: number;
}

/** Billable seconds + call count for ONE restaurant in [start, end). */
export async function fetchNabilUsage(restaurantId: string, start: Date, end: Date): Promise<NabilUsage> {
  const rows = await prisma.$queryRaw<Array<{ calls: number | bigint; seconds: number | bigint | null }>>`
    SELECT COUNT(*)::int AS calls,
           COALESCE(SUM("durationSeconds"), 0)::int AS seconds
    FROM "VoiceCall"
    WHERE "restaurantId" = ${restaurantId}
      AND "startedAt" >= ${start}
      AND "startedAt" < ${end}
      AND "durationSeconds" > 0
  `;
  const r = rows[0];
  return { calls: Number(r?.calls ?? 0), seconds: Number(r?.seconds ?? 0) };
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
  const rows = await prisma.$queryRaw<Array<{ restaurantId: string; calls: number | bigint; seconds: number | bigint | null }>>`
    SELECT "restaurantId",
           COUNT(*)::int AS calls,
           COALESCE(SUM("durationSeconds"), 0)::int AS seconds
    FROM "VoiceCall"
    WHERE "restaurantId" IN (${Prisma.join(restaurantIds)})
      AND "startedAt" >= ${start}
      AND "startedAt" < ${end}
      AND "durationSeconds" > 0
    GROUP BY "restaurantId"
  `;
  for (const r of rows) out.set(r.restaurantId, { calls: Number(r.calls), seconds: Number(r.seconds ?? 0) });
  return out;
}
