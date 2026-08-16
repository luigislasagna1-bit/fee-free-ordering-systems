/**
 * Error reporting for the voice service — the IMPORT-FREE half.
 *
 * WHY TWO FILES. `@sentry/node` loads ~25 OpenTelemetry packages (measured
 * 2–60 s cold on this machine). session.ts / tools.ts / fallback.ts are imported
 * by the sim harness, the engine-scenario tier and a dozen unit tests, so the
 * module THEY import must cost nothing: this one has zero imports and holds a
 * pluggable sink. sentry.ts (imported by server.ts only, first line) installs
 * the real Sentry client into that sink when SENTRY_DSN is set. Without a DSN
 * every function here is a no-op and the service behaves exactly as before.
 *
 * WHAT IS SENT. Message + stack + a few identifiers as TAGS (callSid,
 * restaurantId, orderNumber, where). Never a transcript, never a phone number,
 * never an address, never a customer name: `redactEvent` scrubs every string
 * that could carry speech before it leaves the process. Vendored rules — the
 * app's src/lib/voice/event-redaction.ts cannot be imported across the Docker
 * boundary; keep them in step by hand.
 */

export type CaptureContext = {
  where: string;
  callSid?: string | null;
  restaurantId?: string | null;
  orderNumber?: string | null;
  /** Small, identifier-shaped extras (status codes, tool names). Redacted anyway. */
  extra?: Record<string, unknown>;
  level?: "error" | "warning";
};

export type ErrorSink = {
  capture(err: unknown, ctx?: CaptureContext): void;
  flush(timeoutMs: number): Promise<unknown>;
};

let sink: ErrorSink | null = null;

export function setErrorSink(s: ErrorSink | null): void {
  sink = s;
}

export function hasErrorSink(): boolean {
  return sink !== null;
}

/** Never throws, no-op without a sink. Safe on every hot path. */
export function captureError(err: unknown, ctx?: CaptureContext): void {
  try {
    sink?.capture(err, ctx);
  } catch {
    /* error reporting must never mask the original failure */
  }
}

/** Resolves once the sink has flushed or `ms` has passed — never rejects. */
export async function flushObservability(ms: number): Promise<void> {
  if (!sink) return;
  await Promise.race([sink.flush(ms).catch(() => undefined), new Promise<void>((r) => setTimeout(r, ms).unref?.())]);
}

/** Fires at most once per `ms` — for conditions that would otherwise storm
 *  (a refresh failing every 15 min, every refused call at capacity). */
export function createRefractory(ms: number, now: () => number = Date.now): { fire(): boolean; reset(): void } {
  let last = -Infinity;
  return {
    fire() {
      const t = now();
      if (t - last < ms) return false;
      last = t;
      return true;
    },
    reset() {
      last = -Infinity;
    },
  };
}

/* ─────────────────────────── redaction (vendored) ─────────────────────────── */

const SENTINEL_EMAIL_RE = /voice\.\d+@voice\.nabil\.invalid/gi;
const NANP_PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const DIGIT_RUN_RE = /\d{7,}/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
/** Keys whose VALUES are speech, addresses or identity — dropped outright. */
const DROP_KEY_RE = /transcript|address|customer|from(?:Number|Digits)?$|phone|caller|name|street|email/i;

export function redactString(s: string): string {
  return s
    .replace(SENTINEL_EMAIL_RE, "voice.***@voice.nabil.invalid")
    .replace(NANP_PHONE_RE, (m) => `***-${m.replace(/\D/g, "").slice(-4)}`)
    .replace(DIGIT_RUN_RE, "[digits]")
    .replace(EMAIL_RE, (_m, domain: string) => `***@${domain}`);
}

const MAX_DEPTH = 16;

export function redactDeep<T>(v: T, depth = 0): T {
  if (depth > MAX_DEPTH) return "[redacted-depth]" as unknown as T;
  if (typeof v === "string") return redactString(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, depth + 1)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = DROP_KEY_RE.test(k) ? "[dropped]" : redactDeep(val, depth + 1);
    }
    return out as unknown as T;
  }
  return v;
}

/**
 * Sentry `beforeSend`: scrub message text, exception messages, extra,
 * breadcrumbs, request; drop `user`; leave stack frames, tags, release,
 * event_id, sdk, contexts alone (they carry no speech and are what makes the
 * event useful).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function redactEvent<E extends Record<string, any>>(event: E): E {
  const e: any = { ...event };
  if (typeof e.message === "string") e.message = redactString(e.message);
  if (e.logentry && typeof e.logentry.message === "string") e.logentry = { ...e.logentry, message: redactString(e.logentry.message) };
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v: any) => (v && typeof v.value === "string" ? { ...v, value: redactString(v.value) } : v)),
    };
  }
  if (e.extra) e.extra = redactDeep(e.extra);
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = redactDeep(e.breadcrumbs);
  if (e.request) e.request = redactDeep(e.request);
  delete e.user;
  return e as E;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─────────────────────────── process handlers ─────────────────────────────── */

type ProcLike = { on: (event: string, listener: (...args: any[]) => void) => unknown };

/**
 * Today an uncaught throw kills the machine with nothing recorded and drops
 * every live call on it. Now: report, flush (≤ flushMs), then exit as before.
 * An unhandled rejection is reported and the process SURVIVES — Node's default
 * (≥15) would crash it, and a stray rejection is not worth every live call.
 * Installed by sentry.ts unconditionally (also with no DSN) so behaviour does
 * not depend on an optional secret.
 */
export function installProcessHandlers(o: {
  proc?: ProcLike;
  exit?: (code: number) => void;
  flushMs?: number;
  log?: (...a: unknown[]) => void;
} = {}): void {
  const proc: ProcLike = o.proc ?? (process as unknown as ProcLike);
  const exit = o.exit ?? ((code: number) => process.exit(code));
  const log = o.log ?? ((...a: unknown[]) => console.error(...a));
  const flushMs = o.flushMs ?? 2000;
  let exiting = false;
  proc.on("uncaughtException", (err: unknown) => {
    log("[nabil-voice] uncaughtException", err instanceof Error ? err.stack || err.message : err);
    if (exiting) return exit(1);
    exiting = true;
    captureError(err, { where: "process.uncaughtException" });
    void flushObservability(flushMs).finally(() => exit(1));
  });
  proc.on("unhandledRejection", (reason: unknown) => {
    log("[nabil-voice] unhandledRejection", reason instanceof Error ? reason.stack || reason.message : reason);
    captureError(reason, { where: "process.unhandledRejection" });
  });
}
