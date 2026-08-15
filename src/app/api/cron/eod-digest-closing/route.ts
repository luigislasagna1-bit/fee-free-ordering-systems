/**
 * Closing-time end-of-day digest cron (every minute).
 *
 * Reseller report cmq8gfpxn (Luigi 2026-06-11): the end-of-day report should
 * arrive a few minutes AFTER the restaurant's closing time — "open 10:00–23:00
 * → report ~23:05" — not the next morning, so owners can reconcile the till
 * the same night. Each pass sends only to restaurants whose business day just
 * ended in THEIR timezone (split-hours aware; overnight closers report the
 * previous local day when they close after midnight). Since cms0gyexp #13 the
 * report window is close-to-close, so it ends exactly when the send fires.
 * Idempotent via Restaurant.lastEodDigestDate (the morning cron stays as a
 * catch-up). Shared logic: src/lib/digest-cron.ts.
 *
 * Piggyback (2026-08-15): because this is the platform's only every-minute
 * cron, it also flushes the ops-message queue (src/lib/ops-messages.ts) —
 * DB-queued notes to the platform owner that production emails out. Strictly
 * best-effort and AFTER the digest work: it can neither delay a digest nor
 * change this route's status/response.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { runDigestSweep } from "@/lib/digest-cron";
import { dispatchPendingOpsMessages } from "@/lib/ops-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await runDigestSweep("closing");
  // Best-effort ops-message flush — never affects the digest result above.
  await dispatchPendingOpsMessages().catch((e) => {
    console.error("[eod-digest-closing] ops-message dispatch failed", e);
  });
  return NextResponse.json(result);
}
