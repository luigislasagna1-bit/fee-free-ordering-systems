import * as Sentry from "@sentry/nextjs";

/**
 * Report a caught server error to Sentry WITHOUT ever throwing.
 *
 * The money/hot paths (order create, Stripe/PayPal webhooks, cron sweeps) all
 * `catch (e) { console.error(...); return 500 }` — which means the error is
 * swallowed before Next's `onRequestError` hook, so it never reaches Sentry and
 * nobody is alerted (a broken webhook could 500 every Stripe retry for days
 * silently). Drop `reportError(e, ctx)` into those catches so failures are
 * alertable. Purely additive — it never changes control flow or the response.
 *
 * Pass ONLY identifiers in `context` (orderId, restaurantId, event id/type) —
 * never the raw request body, customer email, or address (Sentry is configured
 * sendDefaultPii:false; keep it that way).
 */
export function reportError(
  e: unknown,
  context?: Record<string, string | number | null | undefined>,
): void {
  try {
    Sentry.captureException(e, context ? { extra: context } : undefined);
  } catch {
    // Error reporting must never throw and mask the original failure.
  }
}
