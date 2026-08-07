import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret gate for the Nabil AI internal read endpoints
 * (/api/internal/voice/*). Mirrors src/app/api/internal/resolve-host/route.ts:
 * in dev we don't require the secret so local testing works without env setup;
 * in production the `x-internal-key` header MUST match INTERNAL_API_SECRET.
 *
 * These endpoints are single-sourced on existing read libs and expose menu /
 * hours / caller-history data, so they're gated exactly like the host resolver
 * — the always-on voice service is the only caller and holds the secret.
 *
 * Returns a ready-to-return 403 NextResponse to short-circuit the handler, or
 * null when the request is authorized.
 */
export function requireInternalKey(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    const key = req.headers.get("x-internal-key");
    const expected = process.env.INTERNAL_API_SECRET;
    if (!expected || key !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return null;
}
