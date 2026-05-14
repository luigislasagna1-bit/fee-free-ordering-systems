// Simple in-memory rate limiter (single-instance; fine for SQLite/single-server).
// Each bucket tracks hit timestamps within the rolling window.

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

/** Extract best-effort client IP from Next.js request headers. */
export function getClientIp(req: Request): string {
  const h = req.headers as Headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
