// Rate limiting — two tiers (launch Blocker #9):
//
//   rateLimit()        — the original SYNC in-memory limiter. Per-isolate
//                        only: every Vercel lambda instance has its own Map,
//                        so under real traffic N isolates ≈ N× the intended
//                        limit. Fine as a cheap first line / for dev; NOT
//                        sufficient alone for anything security-sensitive.
//
//   rateLimitShared()  — ASYNC limiter backed by a shared Redis store
//                        (Upstash REST / Vercel KV, zero SDK — plain fetch),
//                        so the limit holds across every isolate. The local
//                        Map stays as a same-isolate fast-path: when this
//                        isolate alone has already exceeded the limit we
//                        deny without a network round-trip. When no store
//                        is configured it degrades to the in-memory limiter
//                        (and logs once) so dev/local keeps working — set
//                        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//                        (or Vercel KV's KV_REST_API_URL + KV_REST_API_TOKEN)
//                        in prod to make it real.
//
// Store failures FAIL OPEN (allow + log): a Redis outage must never take
// down login/checkout. The in-memory check still applies in that case.

const store = new Map<string, number[]>();

// Prune old buckets every 5 minutes to avoid memory leaks.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of store) {
    const fresh = hits.filter((t) => now - t < 60_000 * 10);
    if (fresh.length === 0) store.delete(key);
    else store.set(key, fresh);
  }
}, 5 * 60_000).unref?.();

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param key  Unique bucket key (e.g. "coupon:127.0.0.1")
 * @param limit  Max hits allowed in the window
 * @param windowMs  Rolling window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  store.set(key, hits);
  return true;
}

/** Peek without recording a hit — true when the key is already over limit
 *  in THIS isolate. Used as the fast-path in front of the shared store. */
function locallyExceeded(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  return hits.length >= limit;
}

function sharedStoreConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

let warnedNoStore = false;

/**
 * Cross-isolate rate limit backed by the shared Redis store, with the local
 * Map as a same-isolate fast-path. Fixed window: INCR + PEXPIRE-on-first-hit.
 *
 * Returns true = allowed, false = rate-limited. Fail-open on store errors.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  // Same-isolate fast path — already over here means over everywhere.
  if (locallyExceeded(key, limit, windowMs)) return false;

  const cfg = sharedStoreConfig();
  if (!cfg) {
    if (!warnedNoStore && process.env.NODE_ENV === "production") {
      warnedNoStore = true;
      console.warn(
        "[rate-limit] No shared store configured (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN) — falling back to per-isolate limiting. Set them in prod so limits hold across instances.",
      );
    }
    return rateLimit(key, limit, windowMs);
  }

  try {
    // One round-trip: INCR the counter; set its TTL only when it's new (NX),
    // so the fixed window anchors at the first hit.
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
      ]),
      // Keep the limiter snappy — a slow store shouldn't stall logins.
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`shared store HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (data?.[0]?.error) throw new Error(String(data[0].error));
    const count = Number(data?.[0]?.result ?? 0);
    if (count > limit) return false;
    // Mirror into the local Map so the fast-path can short-circuit repeats.
    rateLimit(key, limit, windowMs);
    return true;
  } catch (e) {
    console.error("[rate-limit] shared store error — failing open:", e instanceof Error ? e.message : e);
    return rateLimit(key, limit, windowMs); // fail open to the local limiter
  }
}

/** Increment a shared counter (TTL anchored at first hit). Returns the new
 *  count, or null when no store is configured / the store errored — callers
 *  fall back to the local Map. Used by the login failure counters, which
 *  need increment (on failure) and read (on attempt) as SEPARATE operations
 *  — rateLimitShared can't express that (it always increments). */
export async function sharedCounterIncr(key: string, windowMs: number): Promise<number | null> {
  const cfg = sharedStoreConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
      ]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`shared store HTTP ${res.status}`);
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (data?.[0]?.error) throw new Error(String(data[0].error));
    return Number(data?.[0]?.result ?? 0);
  } catch (e) {
    console.error("[rate-limit] sharedCounterIncr error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Read a shared counter WITHOUT incrementing. Returns the current count
 *  (0 when the key doesn't exist), or null when no store / store error. */
export async function sharedCounterGet(key: string): Promise<number | null> {
  const cfg = sharedStoreConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/GET/${encodeURIComponent(`rl:${key}`)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error(`shared store HTTP ${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data?.error) throw new Error(String(data.error));
    return data.result == null ? 0 : Number(data.result);
  } catch (e) {
    console.error("[rate-limit] sharedCounterGet error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Local-Map fallbacks for the same counter semantics (per-isolate). */
export function localCounterIncr(key: string, windowMs: number): number {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  store.set(key, hits);
  return hits.length;
}
export function localCounterGet(key: string, windowMs: number): number {
  const now = Date.now();
  return (store.get(key) ?? []).filter((t) => now - t < windowMs).length;
}

/** Extract best-effort client IP from Next.js request headers. */
export function getClientIp(req: Request): string {
  const h = req.headers as Headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
