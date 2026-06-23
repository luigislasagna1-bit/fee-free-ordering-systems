import prisma from "@/lib/db";

/**
 * Chrome for a reseller-branded auth page (login OR signup). Logo + title + company
 * name + brand colors. Shared so both pages skin identically. Type-only-imported by the
 * client forms (no prisma in the client bundle). Luigi 2026-06-23.
 */
export interface ResellerBranding {
  logoUrl: string | null;
  title: string | null;
  companyName: string | null;
  /** Hex (e.g. "#10b981"). Replaces the platform emerald on the branded page when set. */
  primaryColor: string | null;
  accentColor: string | null;
  /** Custom login/signup background image; null → the default FeeFree food-hero. */
  backgroundUrl: string | null;
}

export interface ResolvedReseller {
  branding: ResellerBranding;
  /** ResellerProfile.id — passed to NextAuth credentials on the branded LOGIN to enforce scope. */
  resellerScopeId: string;
  /** ResellerProfile.referralCode — the branded SIGNUP injects this so the new restaurant is
   *  attributed to this reseller (the register route maps referralCode → resellerProfileId). */
  referralCode: string;
}

/**
 * Resolve a reseller's branded-auth chrome by ResellerProfile id, gated on an ACTIVE white-label
 * subscription for an APPROVED reseller (either tier — generic subdomains work on Basic too;
 * custom domains are Full-gated upstream at the proxy/host resolver, so a lapsed sub stops the
 * host routing here entirely). Returns null for a malformed id or a non-active/non-approved
 * reseller, so the page falls back to the generic FeeFreeOrdering chrome.
 *
 * Used by /login (existing) and /signup (new branded signup). The id-shape regex matches the
 * proxy's ?reseller= contract (src/proxy.ts). HOT public path on a branded host — a per-id cache
 * seam (low TTL) belongs here if branded-host traffic grows (AGENTS.md scale mandate).
 */
export async function resolveResellerBranding(
  resellerId: string | undefined | null,
): Promise<ResolvedReseller | null> {
  if (!resellerId || !/^[a-z0-9-]{20,40}$/i.test(resellerId)) return null;
  const r = await prisma.resellerProfile.findFirst({
    where: { id: resellerId, whiteLabelStatus: "active", status: "approved" },
    select: {
      id: true,
      brandLogoUrl: true,
      brandLoginTitle: true,
      companyName: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      brandLoginBgUrl: true,
      referralCode: true,
    },
  });
  if (!r) return null;
  return {
    branding: {
      logoUrl: r.brandLogoUrl,
      title: r.brandLoginTitle,
      companyName: r.companyName,
      primaryColor: r.brandPrimaryColor,
      accentColor: r.brandAccentColor,
      backgroundUrl: r.brandLoginBgUrl,
    },
    resellerScopeId: r.id,
    referralCode: r.referralCode,
  };
}

/**
 * Resolve a reseller's branded-auth chrome by their REFERRAL CODE (the `?ref=<code>` on their
 * share link), gated identically (active white-label + approved). So a restaurant that lands on
 * `/signup?ref=<code>` from a white-label reseller's share link gets the SAME branded signup
 * (logo/colors/background) as the reseller's own branded host — not the generic FeeFree chrome.
 * Luigi 2026-06-23.
 */
export async function resolveResellerBrandingByRef(
  referralCode: string | undefined | null,
): Promise<ResolvedReseller | null> {
  const code = referralCode?.trim();
  if (!code) return null;
  const r = await prisma.resellerProfile.findFirst({
    where: { referralCode: code, whiteLabelStatus: "active", status: "approved" },
    select: {
      id: true,
      brandLogoUrl: true,
      brandLoginTitle: true,
      companyName: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      brandLoginBgUrl: true,
      referralCode: true,
    },
  });
  if (!r) return null;
  return {
    branding: {
      logoUrl: r.brandLogoUrl,
      title: r.brandLoginTitle,
      companyName: r.companyName,
      primaryColor: r.brandPrimaryColor,
      accentColor: r.brandAccentColor,
      backgroundUrl: r.brandLoginBgUrl,
    },
    resellerScopeId: r.id,
    referralCode: r.referralCode,
  };
}
