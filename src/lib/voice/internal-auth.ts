import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret gate for the Nabil AI internal endpoints
 * (/api/internal/voice/*). These endpoints expose menu / hours /
 * caller-history data AND accept writes (call-log), so the rule is
 * fail-closed everywhere the secret exists:
 *
 *  - INTERNAL_API_SECRET set (ANY environment, dev included) → the
 *    `x-internal-key` header MUST match exactly; 403 otherwise. Hardened
 *    2026-08-10: previously the check only ran in production, so a dev/preview
 *    deployment with the secret configured still accepted anonymous callers.
 *  - INTERNAL_API_SECRET unset → open ONLY outside production (local dev
 *    convenience, no env setup needed); in production an unset/typo'd secret
 *    fails closed with 403 rather than silently leaving the endpoints public.
 *
 * The always-on voice service is the only legitimate caller and holds the
 * secret.
 *
 * Returns a ready-to-return 403 NextResponse to short-circuit the handler, or
 * null when the request is authorized.
 */
export function requireInternalKey(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_SECRET;
  if (expected) {
    if (req.headers.get("x-internal-key") !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
