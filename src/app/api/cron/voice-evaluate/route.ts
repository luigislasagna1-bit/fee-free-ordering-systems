import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { judgePendingCalls } from "@/lib/voice/eval/judge";

/**
 * GET /api/cron/voice-evaluate — every 15 minutes (offset from
 * voice-intelligence): run the LLM judge over evaluations still `pending`
 * (Phase D part 2). 20 rows per tick, 45 s budget; backoff + dead-letter
 * live in judge.ts. Robocalls / dropped / <2-turn calls are skipped inside.
 */
export const runtime = "nodejs";
export const maxDuration = 55;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  const startedAt = Date.now();
  let result = { done: 0, skipped: 0, retried: 0, failed: 0 };
  try {
    result = await judgePendingCalls({ cap: 20, now: new Date(startedAt), budgetMs: 45_000 });
  } catch (e) {
    console.error("[voice-evaluate] judge pass failed", e);
  }
  console.log(`[voice-evaluate] done=${result.done} skipped=${result.skipped} retried=${result.retried} failed=${result.failed} in ${Date.now() - startedAt}ms`);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
