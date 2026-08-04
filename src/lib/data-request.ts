/**
 * Signed self-serve data-rights links (2026-08-04) — the "Delete my personal
 * data" and "Download my data" links in marketing-email footers, and the token
 * the /api/public/data-request endpoint verifies.
 *
 * Mirrors src/lib/unsubscribe.ts exactly: an HMAC-signed JWT (NEXTAUTH_SECRET)
 * names WHO is requesting WHAT (delete | export) at WHICH restaurant, so the
 * endpoint needs no session and the link can't be forged or enumerated.
 *
 * TTL is deliberately SHORT (30 days) vs the unsubscribe token's 730 days:
 * erasure is destructive, so an ancient footer link must not be able to wipe
 * someone years later.
 */
import jwt from "jsonwebtoken";

const TOKEN_TTL = "30d";

export type DataRequestAction = "delete" | "export";
export type DataRequestPayload = { a: DataRequestAction; r: string; e: string };

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET must be set for data-request-token signing");
  return s;
}

export function signDataRequestToken(payload: DataRequestPayload): string {
  return jwt.sign({ t: "datareq", ...payload }, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyDataRequestToken(token: string): DataRequestPayload | null {
  try {
    const d = jwt.verify(token, getSecret()) as any;
    if (d?.t !== "datareq") return null;
    if ((d.a === "delete" || d.a === "export") && typeof d.r === "string" && typeof d.e === "string") {
      return { a: d.a, r: d.r, e: d.e };
    }
    return null;
  } catch {
    return null;
  }
}

function platformBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com").replace(/\/$/, "");
}

/**
 * Build a data-request URL. `origin` (a restaurant's branded origin, from
 * restaurantOrigin().origin) keeps the link on the restaurant's own domain for
 * white-label cleanliness; it falls back to the platform apex. The endpoint is
 * under /api/... which the proxy serves host-agnostically, so either works.
 */
function buildUrl(action: DataRequestAction, restaurantId: string, email: string, origin?: string): string {
  const token = signDataRequestToken({ a: action, r: restaurantId, e: email.trim().toLowerCase() });
  const base = (origin || platformBase()).replace(/\/$/, "");
  return `${base}/api/public/data-request?token=${encodeURIComponent(token)}`;
}

export function dataDeletionUrl(args: { restaurantId: string; email: string; origin?: string }): string {
  return buildUrl("delete", args.restaurantId, args.email, args.origin);
}

export function dataExportUrl(args: { restaurantId: string; email: string; origin?: string }): string {
  return buildUrl("export", args.restaurantId, args.email, args.origin);
}
