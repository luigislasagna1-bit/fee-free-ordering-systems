/**
 * Bounded retry for TELEMETRY writes (A3, 2026-08-22). Pure — the transport
 * is injected so it is testable without a network and without config.
 *
 * Why: the end-of-call record used to be ONE 8 s POST with no retry; a single
 * slow Vercel cold start or a blip lost the whole call (a $69 placed order was
 * logged `error`, a lunch-hour call became a 0 s "abandoned"). Retries are for
 * transient failures only — a 4xx is a contract bug and retrying it would just
 * repeat the bug.
 */
export type PostResult = { ok: boolean; status: number; json: unknown };
export type PostFn = (path: string, body: unknown, timeoutMs?: number) => Promise<PostResult>;

export type RetryOpts = {
  attempts?: number;
  /** Per-attempt timeout handed to the transport. */
  timeoutMs?: number;
  /** Waits between attempts; the last value repeats. */
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

export type RetryResult = PostResult & { attempts: number; error?: string };

/** Transient: no response at all, timeouts, rate limits, any 5xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function postWithRetry(post: PostFn, path: string, body: unknown, opts: RetryOpts = {}): Promise<RetryResult> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs && opts.backoffMs.length ? opts.backoffMs : [400, 1200];
  const sleep = opts.sleep ?? defaultSleep;
  let last: PostResult = { ok: false, status: 0, json: {} };
  let error: string | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await post(path, body, opts.timeoutMs);
      error = undefined;
      if (last.ok || !isRetryableStatus(last.status)) return { ...last, attempts: i + 1 };
    } catch (e) {
      last = { ok: false, status: 0, json: {} };
      error = String((e as Error)?.message ?? e);
    }
    if (i < attempts - 1) await sleep(backoff[Math.min(i, backoff.length - 1)]);
  }
  return { ...last, attempts, ...(error ? { error } : {}) };
}
