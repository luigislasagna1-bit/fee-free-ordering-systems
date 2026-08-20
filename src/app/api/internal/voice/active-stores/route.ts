import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/voice/active-stores
 *
 * Feeds the Fly voice service's prompt-cache warmer (warmup.ts): the slug of
 * every store whose agent can actually take a call right now. The warmer
 * pre-builds each store's system prefix and fires a zero-output request so the
 * 1h Anthropic cache entry is hot BEFORE the first caller of the hour — a cold
 * prefix adds seconds of silence to the greeting turn.
 *
 * Unlike fallback-map, this DOES filter on `enabled` (both the number and the
 * agent config): warming a store whose agent never answers is pure spend. An
 * owner making a disabled-agent test call pays one cold start — acceptable.
 *
 * Same caching contract as fallback-map: the service keeps its last good copy
 * when a refresh fails; an error here just means the next caller pays today's
 * cold start.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  // Scale note: one row per provisioned number platform-wide, bounded like
  // fallback-map. The warmer holds one ~40k-token cache entry per store, so
  // the real ceiling is Anthropic spend, not this query.
  const rows = await prisma.voiceNumber.findMany({
    where: { status: { not: "released" }, enabled: true },
    select: {
      isDemo: true,
      restaurant: {
        select: {
          slug: true,
          voiceAgentConfig: { select: { enabled: true } },
        },
      },
    },
    take: 20000,
  });

  const seen = new Set<string>();
  const stores: Array<{ slug: string }> = [];
  for (const r of rows) {
    const slug = r.restaurant?.slug;
    if (!slug || seen.has(slug)) continue;
    // Demo lines answer regardless of the config toggle; real lines only when
    // the agent is switched on.
    if (!r.isDemo && r.restaurant?.voiceAgentConfig?.enabled !== true) continue;
    seen.add(slug);
    stores.push({ slug });
  }

  return NextResponse.json(
    { stores, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
