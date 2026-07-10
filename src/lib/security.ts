/**
 * Small security helpers shared by webhook/cron auth checks.
 */
import crypto from "crypto";

/**
 * Constant-time string comparison for shared-secret tokens (webhook tokens,
 * cron bearers). A plain `!==` leaks how many leading characters matched
 * through response timing; timingSafeEqual doesn't. Length mismatch returns
 * false without leaking the expected length (both sides are hashed to a
 * fixed size first).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}
