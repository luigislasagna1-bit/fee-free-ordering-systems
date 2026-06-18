/**
 * Retry a READ-ONLY database operation once on a transient connection error.
 *
 * Neon is serverless Postgres and recycles pooled connections, so a high-
 * frequency poll occasionally hits a just-closed connection and the in-flight
 * query dies with "Connection terminated unexpectedly". A single retry lets the
 * driver adapter establish a fresh connection, which succeeds immediately.
 *
 * ⚠️ ONLY wrap idempotent reads. Never wrap a write / mutation / payment call —
 * a retry could double-apply it. (This is why it lives as an opt-in helper and
 * is NOT baked into the shared Prisma client.)
 */

const TRANSIENT_MARKERS = [
  "connection terminated", // node-postgres: "Connection terminated unexpectedly"
  "econnreset",
  "etimedout",
  "terminating connection due to", // server-initiated shutdown / recycle
  "server closed the connection",
  "connection reset by peer",
  "socket hang up",
];

/** True if the error looks like a transient DB/network connection drop. */
export function isTransient(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_MARKERS.some((m) => msg.includes(m));
}

export async function withDbRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Only retry transient connection drops; surface real errors immediately.
      if (attempt === retries || !isTransient(err)) throw err;
      // Brief pause so the adapter can re-establish the connection before retry.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastErr;
}
