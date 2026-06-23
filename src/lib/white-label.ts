/**
 * Is a restaurant a RESELLER WHITE-LABEL account — i.e. sold under a reseller who pays for
 * their own branding? Mirrors resolveImprint() in src/lib/notifications.ts EXACTLY: the
 * reseller profile must be APPROVED with an ACTIVE white-label subscription (basic or full).
 *
 * Used to gate the "Powered by Fee Free Ordering" credit: a reseller white-label restaurant
 * shows the RESELLER's brand (so our credit is suppressed); EVERY other restaurant — including
 * a plain restaurant on its OWN verified custom domain — SHOWS the clickable platform credit
 * (free marketing + SEO backlink to www.feefreeordering.com). Luigi 2026-06-22:
 * "Powered by Fee Free Ordering should NOT be hidden unless the restaurant is signed up under
 * a reseller with a custom branded reseller account."
 *
 * PURE + client-safe — NO prisma / server-only imports. This module is imported by CLIENT
 * components (order status / menu / info pages), so it must never pull prisma (→ node:module)
 * into the client bundle. The server-only auto-subdomain helpers live in
 * src/lib/reseller-subdomain.ts.
 */
export interface ResellerWhiteLabelProfile {
  status?: string | null;
  whiteLabelStatus?: string | null;
  whiteLabelTier?: string | null;
}

export function isResellerWhiteLabel(p?: ResellerWhiteLabelProfile | null): boolean {
  if (!p || p.status !== "approved") return false;
  return p.whiteLabelStatus === "active" && (p.whiteLabelTier === "basic" || p.whiteLabelTier === "full");
}

/** Prisma select fragment for the fields isResellerWhiteLabel() needs — spread into a
 *  restaurant query's `resellerProfile: { select: RESELLER_WHITE_LABEL_SELECT }`. */
export const RESELLER_WHITE_LABEL_SELECT = {
  status: true,
  whiteLabelStatus: true,
  whiteLabelTier: true,
} as const;
