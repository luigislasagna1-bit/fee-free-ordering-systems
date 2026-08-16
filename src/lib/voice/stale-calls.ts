/**
 * Stale-call sweep — closes VoiceCall rows whose session died without ever
 * sending its "end" event, so a call can never sit "In progress" forever in
 * the admin.
 *
 * WHY (2026-08-16 19:28Z). A `fly secrets deploy` restarted the voice service
 * while a call was 33 s old. The container's main process was `npm`, which
 * died on SIGTERM before node's graceful drain could run (fixed in the
 * Dockerfile — node is the main process now), so the WebSocket vanished, the
 * caller was handed to the store by Twilio's <Connect action> and the record
 * (start row, zero events, no end) stayed "In progress" for the owner. Even
 * with the drain fixed, a crash, an OOM or a Fly host failure can still lose
 * an end event — this sweep is the backstop, not the fix.
 *
 * Rules: only rows with NO endedAt whose start is older than STALE_AFTER_MS
 * (a real call is capped at ~15 min by maxCallSeconds; 45 min leaves a wide
 * margin for a stuck-but-alive session). Marked outcome "error" (the service
 * failed the caller — it is not "abandoned"), endedAt = sweep time,
 * durationSeconds left null (unknown — never a made-up number in analytics).
 * A late-arriving real end event still overwrites all of it: the call-log
 * upsert writes endedAt/outcome/duration unconditionally.
 */
import prisma from "@/lib/db";

export const STALE_AFTER_MS = 45 * 60_000;
export const STALE_SWEEP_CAP = 200;

export type StaleSweepResult = { closed: number; ids: string[] };

export async function sweepStaleCalls(now: Date = new Date()): Promise<StaleSweepResult> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
  const rows = await prisma.voiceCall.findMany({
    where: { endedAt: null, startedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { startedAt: "asc" },
    take: STALE_SWEEP_CAP,
  });
  if (rows.length === 0) return { closed: 0, ids: [] };
  const ids = rows.map((r) => r.id);
  // Conditional on endedAt still being null so a racing real end event wins.
  const res = await prisma.voiceCall.updateMany({
    where: { id: { in: ids }, endedAt: null },
    data: { endedAt: now, outcome: "error" },
  });
  return { closed: res.count, ids };
}
