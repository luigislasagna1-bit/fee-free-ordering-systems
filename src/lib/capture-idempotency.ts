/**
 * Pure predicates that decide whether a capture ERROR actually means the
 * payment was ALREADY captured — a retry, a webhook replay, or the
 * kitchen-accept path racing the auto-accept capture-on-authorize. In those
 * cases the caller treats it as SUCCESS: the money already moved.
 *
 * Kept dependency-free (no db/SDK imports) so both the kitchen-accept PATCH and
 * the auto-accept capture paths share ONE source of truth (no drift) and it's
 * unit-testable. The dangerous mistake is a FALSE POSITIVE — swallowing a real
 * decline/expiry would mark an unpaid order "paid" — so the tests lock that
 * real failures return false.
 */

/** Stripe: `payment_intent_unexpected_state` with an "already"-ish message or a
 *  succeeded/canceled intent status. */
export function isStripeAlreadyCaptured(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const code = (e as { code?: string })?.code ?? "";
  const status = (e as { raw?: { payment_intent?: { status?: string } } })?.raw?.payment_intent?.status ?? "";
  return (
    code === "payment_intent_unexpected_state" &&
    (msg.includes("already") || status === "succeeded" || status === "canceled")
  );
}

/** PayPal: the authorization was already captured / can no longer be captured. */
export function isPaypalAlreadyCaptured(e: unknown): boolean {
  const lower = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    lower.includes("already_captured") ||
    lower.includes("already been captured") ||
    lower.includes("authorization_already_captured") ||
    lower.includes("auth_capture_not_allowed")
  );
}
