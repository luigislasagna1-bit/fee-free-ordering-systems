/**
 * Lightweight HMAC token used to make the order status page guest-
 * accessible via a signed URL (e.g. the customer forwards their
 * confirmation email to a roommate picking up). No JWT library
 * dependency — just SHA-256 HMAC of the order ID with a server secret,
 * base64url-encoded.
 *
 * Token shape:  base64url(  hmac_sha256( ORDER_SIGNING_KEY, orderId )  )
 *
 * No expiry in the token itself — the status page is only really useful
 * for ~24 hours and the customer can re-fetch a fresh link from their
 * confirmation email. Adding expiry to the token would require a
 * rotation story we don't need yet.
 *
 * Secret resolution order:
 *   1. process.env.ORDER_STATUS_SIGNING_KEY
 *   2. process.env.NEXTAUTH_SECRET (fallback so dev / preview work
 *      without an extra env var)
 *
 * If neither is set we throw at sign-time so the order route fails
 * loudly during boot rather than silently shipping unsigned tokens.
 */
import { createHmac } from "node:crypto";

function getSecret(): string {
  const k = process.env.ORDER_STATUS_SIGNING_KEY || process.env.NEXTAUTH_SECRET;
  if (!k) throw new Error("ORDER_STATUS_SIGNING_KEY (or NEXTAUTH_SECRET) is required");
  return k;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signOrderToken(orderId: string): string {
  const sig = createHmac("sha256", getSecret()).update(orderId).digest();
  return b64url(sig);
}

export function verifyOrderToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = signOrderToken(orderId);
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
