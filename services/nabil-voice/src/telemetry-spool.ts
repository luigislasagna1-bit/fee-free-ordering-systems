/**
 * Process-level TELEMETRY SPOOL (A3, 2026-08-22) — the last line of defence
 * for a call record. When the end-of-call write (or a mid-call event flush)
 * still fails after its own retries, the payload is parked here and pumped
 * again every 30 s with exponential backoff, outliving the CallSession that
 * produced it. `drainSpool` is called from the SIGTERM drain so a deploy
 * flushes what it can before the process goes away.
 *
 * Idempotent by construction on the receiving side: the call-log route upserts
 * on callSid and inserts events with skipDuplicates on (callId, seq), so
 * sending the same payload twice is a no-op.
 *
 * Bounded: MAX_ENTRIES payloads (oldest dropped, counted), MAX_ATTEMPTS per
 * payload (~25 min of backoff), never throws, never blocks a call.
 */
import type { PostFn, PostResult } from "./retry";
import { isRetryableStatus } from "./retry";

export type SpoolEntry = {
  kind: string;
  callSid: string;
  path: string;
  body: unknown;
  attempts: number;
  nextAt: number;
  queuedAt: number;
};

export const MAX_ENTRIES = 200;
export const MAX_ATTEMPTS = 12;
export const PUMP_INTERVAL_MS = 30_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

const entries: SpoolEntry[] = [];
let droppedForCapacity = 0;
let droppedForAttempts = 0;

export function spoolTelemetry(kind: string, callSid: string, path: string, body: unknown, now: number = Date.now()): void {
  if (entries.length >= MAX_ENTRIES) {
    entries.shift();
    droppedForCapacity++;
    console.error("[nabil-voice] telemetry spool full — oldest payload dropped", { droppedForCapacity });
  }
  entries.push({ kind, callSid, path, body, attempts: 0, nextAt: now, queuedAt: now });
  console.warn("[nabil-voice] telemetry spooled", { kind, callSid, size: entries.length });
}

export function spoolSize(): number {
  return entries.length;
}

export function spoolStats() {
  return { size: entries.length, droppedForCapacity, droppedForAttempts };
}

/** Tests only. */
export function _resetSpool(): void {
  entries.splice(0);
  droppedForCapacity = 0;
  droppedForAttempts = 0;
}

function backoffFor(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * One pass over the due entries. `all = true` ignores `nextAt` (shutdown
 * drain). Sequential on purpose — a recovering backend should not be hit by
 * 200 parallel writes.
 */
export async function pumpSpool(post: PostFn, now: number = Date.now(), all = false): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0;
  let failed = 0;
  const due = entries.filter((e) => all || e.nextAt <= now);
  for (const e of due) {
    let res: PostResult;
    try {
      res = await post(e.path, e.body, 15_000);
    } catch (err) {
      res = { ok: false, status: 0, json: { error: String((err as Error)?.message ?? err) } };
    }
    const idx = entries.indexOf(e);
    if (res.ok || !isRetryableStatus(res.status)) {
      // Delivered — or a contract error that retrying cannot fix (logged).
      if (!res.ok) console.error("[nabil-voice] spooled telemetry rejected for good", { kind: e.kind, callSid: e.callSid, status: res.status });
      else sent++;
      if (idx >= 0) entries.splice(idx, 1);
      continue;
    }
    failed++;
    e.attempts++;
    if (e.attempts >= MAX_ATTEMPTS) {
      droppedForAttempts++;
      console.error("[nabil-voice] spooled telemetry gave up", { kind: e.kind, callSid: e.callSid, attempts: e.attempts, status: res.status });
      if (idx >= 0) entries.splice(idx, 1);
      continue;
    }
    e.nextAt = now + backoffFor(e.attempts);
  }
  return { sent, failed, remaining: entries.length };
}

let pumpTimer: NodeJS.Timeout | null = null;

export function startSpoolPump(post: PostFn, intervalMs: number = PUMP_INTERVAL_MS): void {
  if (pumpTimer) return;
  pumpTimer = setInterval(() => {
    if (entries.length === 0) return;
    void pumpSpool(post).then((r) => {
      if (r.sent || r.failed) console.log("[nabil-voice] telemetry spool pump", r);
    });
  }, intervalMs);
  pumpTimer.unref?.();
}

export function stopSpoolPump(): void {
  if (pumpTimer) clearInterval(pumpTimer);
  pumpTimer = null;
}

/** Shutdown: one best-effort pass over EVERYTHING, bounded by `budgetMs`. */
export async function drainSpool(post: PostFn, budgetMs = 10_000): Promise<{ sent: number; failed: number; remaining: number }> {
  if (entries.length === 0) return { sent: 0, failed: 0, remaining: 0 };
  const pass = pumpSpool(post, Date.now(), true);
  const timeout = new Promise<{ sent: number; failed: number; remaining: number }>((r) =>
    setTimeout(() => r({ sent: 0, failed: 0, remaining: entries.length }), budgetMs),
  );
  return Promise.race([pass, timeout]);
}
