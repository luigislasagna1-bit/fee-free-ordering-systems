/**
 * Reseller white-label gates. TWO levels, both keyed off the reseller profile attached to a
 * restaurant (Restaurant.resellerProfile):
 *
 *  - isResellerDebranded(p) — the FREE de-brand tier. An APPROVED reseller who has actually
 *    configured branding (a non-empty imprint OR an uploaded logo). Drives: hiding the clickable
 *    "Powered by Fee Free Ordering" credit on the restaurant's customer surfaces, emitting the
 *    reseller imprint + logo in emails (resolveImprint), and showing the reseller logo in the
 *    admin + kitchen apps. No paid subscription required — free partners de-brand once they've set
 *    up their brand. A do-nothing partner (no imprint, no logo) keeps our credit so we never
 *    silently lose the marketing backlink for zero partner benefit.
 *
 *  - isResellerBranded(p) — the PAID "Branded" tier ($19.99/mo). An APPROVED reseller with an
 *    ACTIVE white-label subscription. Drives the paid-only surfaces: the fully branded login page
 *    (logo/title/colors on their own domain) + custom-domain routing.
 *
 * Luigi 2026-06-23 restructured the program to FREE (imprint + logo + full de-brand, no card) +
 * a single paid Branded tier ($19.99/mo). This SUPERSEDES the earlier "hide the credit only for a
 * paid custom-branded account" rule — a free partner who sets their brand now de-brands too.
 *
 * PURE + client-safe — NO prisma / server-only imports. Imported by CLIENT components (order
 * status / menu / info pages), so it must never pull prisma (→ node:module) into the client
 * bundle. Server-only reseller helpers live in src/lib/reseller-subdomain.ts.
 */
export interface ResellerWhiteLabelProfile {
  status?: string | null;
  whiteLabelStatus?: string | null;
  whiteLabelTier?: string | null;
  imprint?: string | null;
  brandLogoUrl?: string | null;
}

/** FREE de-brand tier — approved reseller who configured an imprint or logo. */
export function isResellerDebranded(p?: ResellerWhiteLabelProfile | null): boolean {
  if (!p || p.status !== "approved") return false;
  return !!(p.imprint?.trim() || p.brandLogoUrl);
}

/** PAID "Branded" tier — approved reseller with an active white-label subscription. */
export function isResellerBranded(p?: ResellerWhiteLabelProfile | null): boolean {
  if (!p || p.status !== "approved") return false;
  return p.whiteLabelStatus === "active";
}

/** @deprecated Ambiguous post-restructure. Use isResellerDebranded (free de-brand) or
 *  isResellerBranded (paid). Retained as an alias for the PAID gate so no caller silently breaks. */
export function isResellerWhiteLabel(p?: ResellerWhiteLabelProfile | null): boolean {
  return isResellerBranded(p);
}

/** Prisma select fragment for the fields the gates need — spread into a restaurant query's
 *  `resellerProfile: { select: RESELLER_WHITE_LABEL_SELECT }`. Includes imprint + brandLogoUrl so
 *  isResellerDebranded can tell whether branding was actually configured. */
export const RESELLER_WHITE_LABEL_SELECT = {
  status: true,
  whiteLabelStatus: true,
  whiteLabelTier: true,
  imprint: true,
  brandLogoUrl: true,
} as const;
