/**
 * Voice-intelligence catch-up sweep (vercel.json: every 15 minutes).
 *
 * The primary trigger is fire-and-forget from the call-log "end" event; this
 * cron is the safety net for calls whose inline pass failed (Anthropic blip,
 * deploy race, function killed). Picks up to 20 VoiceCalls — any restaurant —
 * that have a transcript, no summary yet, and ended >2 minutes ago (grace so
 * the inline pass always gets first shot), and runs them SERIALLY under a
 * time budget (each pass is one small Claude call; serial keeps us far from
 * rate limits and inside maxDuration).
 *
 * Scale seam: the candidate scan filters on summary IS NULL with no index —
 * fine at current volume (single-digit calls/day). If voice volume grows,
 * add a partial index on VoiceCall(endedAt) WHERE summary IS NULL.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireCronAuth } from "@/lib/cron-auth";
import { generateCallIntelligence } from "@/lib/voice/call-intelligence";
import { sweepStaleCalls } from "@/lib/voice/stale-calls";

export const runtime = "nodejs";
export const maxDuration = 55;

const GRACE_MS = 2 * 60_000;
const MAX_ROWS = 20;
// Stop starting new passes near the function ceiling; leftovers are picked up
// by the next 15-minute tick.
const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();

  // Second arm (2026-08-16): close call rows whose session died without an
  // end event, so nothing shows "In progress" forever. Cheap (one indexed-ish
  // scan on endedAt IS NULL, normally zero rows); never blocks the summaries.
  let stale = 0;
  try {
    const swept = await sweepStaleCalls(new Date(startedAt));
    stale = swept.closed;
    if (stale > 0) console.warn(`[voice-intelligence] closed ${stale} stale in-progress call(s):`, swept.ids.join(","));
  } catch (e) {
    console.error("[voice-intelligence] stale-call sweep failed", e);
  }

  const candidates = await prisma.voiceCall.findMany({
    where: {
      transcript: { not: Prisma.AnyNull },
      summary: null,
      endedAt: { lt: new Date(startedAt - GRACE_MS) },
    },
    orderBy: { endedAt: "asc" },
    take: MAX_ROWS,
    select: { id: true },
  });

  let generated = 0;
  let skipped = 0;
  let deferred = 0;
  for (const c of candidates) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred = candidates.length - generated - skipped;
      break;
    }
    const result = await generateCallIntelligence(c.id);
    if (result) generated++;
    else skipped++; // <2 turns / already done by a racing inline pass / failed (logged inside)
  }

  console.log(
    `[voice-intelligence] candidates=${candidates.length} generated=${generated} skipped=${skipped} deferred=${deferred} staleClosed=${stale}`,
  );
  return NextResponse.json({ candidates: candidates.length, generated, skipped, deferred, staleClosed: stale });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
