/**
 * Lightweight PURPOSE-SCOPED HMAC action tokens for guest-accessible links
 * (Fabrizio cms0idtz7, Luigi 2026-07-28). No JWT dependency — SHA-256 HMAC of
 * `${purpose}:${subjectId}` with a server secret, base64url-encoded.
 *
 * Token shape:  base64url( hmac_sha256( SECRET, `${purpose}:${subjectId}` ) )
 *
 * Purpose scoping is the load-bearing property: a token minted to VIEW an
 * order's status can never authorize CANCELLING it, and an order-cancel token
 * can never cancel a reservation (or a different order). Enforced by tests in
 * order-status-token.test.ts.
 *
 * No expiry in the token itself — every consumer gates on a server-side status
 * precondition (e.g. cancel only while `pending`), which is the real guard.
 * The token is deterministic, so the link in a months-old email still resolves;
 * it's just useless once the status moved on.
 *
 * Secret resolution order:
 *   1. process.env.ORDER_STATUS_SIGNING_KEY
 *   2. process.env.NEXTAUTH_SECRET (fallback so dev / preview work
 *      without an extra env var)
 *
 * If neither is set we throw at sign-time so the caller fails loudly rather
 * than silently shipping unsigned tokens.
 */
import { createHmac } from "node:crypto";

/** Every guest-link action gets its OWN purpose — never share one. */
export type ActionTokenPurpose = "order-status" | "order-cancel" | "reservation-cancel";

function getSecret(): string {
  const k = process.env.ORDER_STATUS_SIGNING_KEY || process.env.NEXTAUTH_SECRET;
  if (!k) throw new Error("ORDER_STATUS_SIGNING_KEY (or NEXTAUTH_SECRET) is required");
  return k;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signActionToken(purpose: ActionTokenPurpose, subjectId: string): string {
  const sig = createHmac("sha256", getSecret()).update(`${purpose}:${subjectId}`).digest();
  return b64url(sig);
}

export function verifyActionToken(
  purpose: ActionTokenPurpose,
  subjectId: string,
  token: string | null | undefined,
): boolean {
  if (!token || !subjectId) return false;
  const expected = signActionToken(purpose, subjectId);
  // Length check first — Buffer.from() with mismatched lengths short-
  // circuits constant-time compare and leaks a tiny timing signal.
  if (expected.length !== token.length) return false;
  // Manual constant-time compare on strings to avoid the Buffer dance.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
