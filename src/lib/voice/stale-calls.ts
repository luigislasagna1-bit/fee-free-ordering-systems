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
  // "dropped" (A3, 2026-08-22): the record was lost by the service/infra —
  // not "error" (which reads as the agent failing the caller and feeds the
  // owner's "needs attention" count) and not "abandoned" (the caller's doing).
  const res = await prisma.voiceCall.updateMany({
    where: { id: { in: ids }, endedAt: null },
    data: { endedAt: now, outcome: "dropped" },
  });
  return { closed: res.count, ids };
}

/**
 * Orphan-order reconciliation (A3, 2026-08-22). The voice service places an
 * order with `idempotencyKey = voice-<CallSid>-<cartHash>`; if its end record
 * is then lost (crash, timeout, restart), the Order exists but the VoiceCall
 * says "dropped"/"abandoned" and the dashboard under-reports phone revenue
 * (2026-08-21: a $69 placed order logged `error`). This walks the last 24 h of
 * voice orders for voice-enabled stores and stamps the call row from the
 * order. A `RECONCILED` log line means the primary path (the end record)
 * failed — fix the trigger, don't rely on the sweep (same rule as the
 * dispatch watchdog's RESCUED).
 */
export const RECONCILE_WINDOW_MS = 24 * 60 * 60_000;
export const RECONCILE_CAP = 100;
const VOICE_KEY = /^voice-(CA[0-9a-f]{32})-/;

export type ReconcileResult = { checked: number; reconciled: number; ids: string[] };

export async function reconcileOrphanVoiceOrders(now: Date = new Date()): Promise<ReconcileResult> {
  const since = new Date(now.getTime() - RECONCILE_WINDOW_MS);
  const stores = await prisma.voiceAgentConfig.findMany({ where: { enabled: true }, select: { restaurantId: true } });
  if (stores.length === 0) return { checked: 0, reconciled: 0, ids: [] };
  // (restaurantId, createdAt) index does the scan; the key prefix is a filter.
  const orders = await prisma.order.findMany({
    where: {
      restaurantId: { in: stores.map((s) => s.restaurantId) },
      createdAt: { gte: since },
      idempotencyKey: { startsWith: "voice-" },
    },
    select: { id: true, orderNumber: true, restaurantId: true, idempotencyKey: true },
    orderBy: { createdAt: "desc" },
    take: RECONCILE_CAP,
  });
  const byCallSid = new Map<string, (typeof orders)[number]>();
  for (const o of orders) {
    const m = VOICE_KEY.exec(o.idempotencyKey ?? "");
    if (m && !byCallSid.has(m[1])) byCallSid.set(m[1], o);
  }
  if (byCallSid.size === 0) return { checked: orders.length, reconciled: 0, ids: [] };

  const calls = await prisma.voiceCall.findMany({
    where: { callSid: { in: [...byCallSid.keys()] }, orderId: null },
    select: { id: true, callSid: true, restaurantId: true, outcome: true },
  });
  const ids: string[] = [];
  for (const c of calls) {
    const o = byCallSid.get(c.callSid);
    if (!o || o.restaurantId !== c.restaurantId) continue; // never across tenants
    const res = await prisma.voiceCall.updateMany({
      where: { id: c.id, orderId: null },
      data: { orderId: o.id, orderNumber: o.orderNumber, outcome: "order_placed" },
    });
    if (res.count > 0) {
      ids.push(c.id);
      console.warn(`[voice] RECONCILED orphan voice order ${o.orderNumber} → call ${c.id} (was ${c.outcome ?? "open"})`);
    }
  }
  return { checked: orders.length, reconciled: ids.length, ids };
}
