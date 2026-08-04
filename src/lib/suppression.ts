/**
 * Unified email suppression (do-not-email) — the ONE gate every marketing
 * send must pass (CASL/anti-spam, 2026-08-04).
 *
 * Before this, opt-outs lived in two disconnected silos:
 *   - Customer.marketingConsent = false   (autopilot / Customer path)
 *   - Prospect.unsubscribedAt   = now     (kickstarter / Prospect path)
 * A person who was both a Customer AND a Prospect could unsubscribe on one
 * path and still be emailed on the other. `EmailSuppression` collapses both
 * into one per-restaurant do-not-email row keyed by lowercased email, so a
 * single unsubscribe (or bounce/complaint/erasure) silences EVERY path — and
 * every FUTURE marketing add-on that goes through `isSuppressed()`.
 *
 * Scope is per-restaurant to match how consent is already modelled
 * (Customer.marketingConsent is per-restaurant): opting out at restaurant A
 * says nothing about restaurant B.
 */
import prisma from "@/lib/db";

export type SuppressionReasonT =
  | "unsubscribe"
  | "bounce"
  | "complaint"
  | "erasure"
  | "manual";

/**
 * Short-TTL in-process cache for the hot `isSuppressed` point lookup, mirroring
 * the 60s transport cache in src/lib/email.ts. Positive results are cached
 * longer (suppression is monotonic — we never silently un-suppress); negative
 * results cache briefly so a fresh unsubscribe is honoured within a minute even
 * across processes that didn't see the write. Writers bust the exact key.
 */
const POSITIVE_TTL_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 30_000;
const suppressionCache = new Map<string, { val: boolean; exp: number }>();

const keyOf = (restaurantId: string, emailLower: string) => `${restaurantId}:${emailLower}`;
const norm = (email: string) => email.trim().toLowerCase();

export function bustSuppressionCache(restaurantId: string, email: string): void {
  suppressionCache.delete(keyOf(restaurantId, norm(email)));
}

/**
 * Add (or refresh) a suppression. Idempotent — safe under webhook retries and
 * double-clicks. Always call this with the raw email; it lowercases internally.
 */
export async function suppressEmail(args: {
  restaurantId: string;
  email: string;
  reason: SuppressionReasonT;
  source?: string;
}): Promise<void> {
  const emailLower = norm(args.email);
  if (!emailLower || !args.restaurantId) return;
  try {
    await prisma.emailSuppression.upsert({
      where: { restaurantId_emailLower: { restaurantId: args.restaurantId, emailLower } },
      create: {
        restaurantId: args.restaurantId,
        emailLower,
        reason: args.reason,
        source: args.source,
      },
      // Keep the most-recent reason/source; the row's mere existence is what
      // gates sends, so overwriting is harmless and keeps provenance current.
      update: { reason: args.reason, source: args.source },
    });
  } catch (e) {
    // A missing restaurant (FK) or transient error must never crash the
    // caller (an unsubscribe handler, a webhook). Log and move on — the
    // caller's primary opt-out write (marketingConsent / unsubscribedAt)
    // still stands as a fallback gate.
    console.error("[suppression] upsert failed:", e);
  }
  // Bust regardless — a failed upsert shouldn't leave a stale negative cached.
  suppressionCache.set(keyOf(args.restaurantId, emailLower), { val: true, exp: Date.now() + POSITIVE_TTL_MS });
}

/**
 * Hot-path check: is this address suppressed for this restaurant? A single
 * indexed point lookup (@@unique([restaurantId, emailLower])) behind a
 * short-TTL cache. Fails OPEN to `false` only on a genuine DB error is WRONG
 * for a compliance gate — so on error we fail CLOSED (treat as suppressed) to
 * never email someone we can't confirm is safe.
 */
export async function isSuppressed(restaurantId: string, email: string): Promise<boolean> {
  const emailLower = norm(email);
  if (!emailLower || !restaurantId) return false;
  const key = keyOf(restaurantId, emailLower);
  const cached = suppressionCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.val;
  try {
    const row = await prisma.emailSuppression.findUnique({
      where: { restaurantId_emailLower: { restaurantId, emailLower } },
      select: { id: true },
    });
    const val = !!row;
    suppressionCache.set(key, { val, exp: Date.now() + (val ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
    return val;
  } catch (e) {
    // Fail CLOSED: if we can't verify the suppression list, do NOT send.
    console.error("[suppression] isSuppressed lookup failed — failing closed:", e);
    return true;
  }
}

/**
 * Preload the ENTIRE suppression set for one restaurant as a Set of lowercased
 * emails. Used by batch senders (the kickstarter drip) so a 1000-row run does
 * ONE query instead of 1000 point lookups. Returns an empty set on error (the
 * per-row send path can still fall back to its own filters).
 */
export async function loadSuppressionSet(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await prisma.emailSuppression.findMany({
      where: { restaurantId },
      select: { emailLower: true },
    });
    return new Set(rows.map((r) => r.emailLower));
  } catch (e) {
    console.error("[suppression] loadSuppressionSet failed:", e);
    return new Set();
  }
}
