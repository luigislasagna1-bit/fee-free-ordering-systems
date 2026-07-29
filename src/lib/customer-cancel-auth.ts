/**
 * Pure auth decision for customer-initiated cancels (order + reservation) —
 * extracted so the matrix is unit-testable without route plumbing.
 *
 * A cancel is authorized when EITHER:
 *   - the caller owns the record via a session (`owned` — the route computes
 *     this with its existing session checks), OR
 *   - the request carries a valid PURPOSE-SCOPED action token for exactly
 *     this subject (the emailed guest link).
 *
 * Purpose scoping means a leaked/forwarded status link can never cancel, and
 * an order token can never touch a reservation. Verified in tests.
 */
import { verifyActionToken, type ActionTokenPurpose } from "@/lib/order-status-token";

export function isCancelAuthorized(opts: {
  owned: boolean;
  purpose: ActionTokenPurpose;
  subjectId: string;
  token: string | null | undefined;
}): boolean {
  if (opts.owned) return true;
  return verifyActionToken(opts.purpose, opts.subjectId, opts.token);
}
