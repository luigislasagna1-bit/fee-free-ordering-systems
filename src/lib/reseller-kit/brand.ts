/**
 * Which brand a reseller's marketing assets carry (Luigi 2026-08-14).
 *
 * Luigi's decision: assets AUTO-SWAP to the partner's brand. A partner who has de-branded
 * gets collateral with zero platform marks — the same promise their storefront already
 * makes (src/lib/white-label.ts).
 *
 * WHY NOT REUSE resolveResellerBranding() (src/lib/reseller-branding.ts):
 *   1. Its paid gate is LOAD-BEARING, not incidental. Its callers are /login and /signup, and
 *      its resellerScopeId is fed to NextAuth to enforce login scope. Loosening that `where`
 *      would turn the $19.99/mo branded-auth product into a free one.
 *   2. It is prisma-bound; the marketing-kit preview renders client-side, so this must be pure.
 *   3. It returns AUTH chrome (login background, login title), not PRINT chrome (ink/paper,
 *      a printable domain, whether our wordmark may appear at all).
 * So: new resolver, existing one untouched.
 *
 * PURE + client-safe — no prisma. Imported by the preview client component.
 *
 * ── THE CONSEQUENCE THAT SHAPES EVERY TEMPLATE ──────────────────────────────────────────
 * Because a flyer can be de-branded, template body copy may NEVER hardcode "Fee Free
 * Ordering". Every string takes {brandName}. A headline like "Own Your Orders. Keep Your
 * Margin." is brand-free and ships as-is on all three tiers; anything naming the product
 * resolves to the partner's own name, which is correct — from the restaurant's point of
 * view a de-branded partner IS the vendor of record.
 */
import {
  isResellerDebranded,
  isResellerBranded,
  type ResellerWhiteLabelProfile,
} from "@/lib/white-label";

export const PLATFORM_BRAND_NAME = "Fee Free Ordering";

/** Which brand a set of assets carries. */
export type KitBrandTier = "platform" | "debranded" | "branded";

export interface ResellerKitBrandProfile extends ResellerWhiteLabelProfile {
  companyName?: string | null;
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
  country?: string | null;
}

export interface KitPalette {
  /** Headline blocks, QR frame, primary fills. */
  primary: string;
  /** Secondary highlights. */
  accent: string;
  /** Body text. */
  ink: string;
  /** Page background. */
  paper: string;
  /** Text sitting ON `primary` — must stay legible when a partner picks a light brand colour. */
  onPrimary: string;
  /** Muted/secondary text. */
  muted: string;
}

export interface KitBrand {
  tier: KitBrandTier;
  /** Printed on the asset. NEVER empty. */
  brandName: string;
  logoUrl: string | null;
  colors: KitPalette;
  /** May the platform wordmark appear anywhere on this asset? */
  allowPlatformMark: boolean;
  /** ISO country of the partner — gates country-specific claims ("Canadian support"). */
  country: string | null;
  /**
   * True when the printed brand will NOT match the signup page the QR lands on.
   * Happens on the FREE de-brand tier only: the flyer is 100% the partner's brand, but
   * resolveResellerBranding() is paid-gated so the signup page is still ours. We surface
   * this as a banner + upsell rather than silently forcing our mark back onto their flyer
   * (which would contradict the free de-brand promise).
   */
  landingBrandMismatch: boolean;
  /**
   * Set when a partner de-branded but never set a company name, so we had to fall back to
   * platform branding. The UI nudges them to Branding → Imprint. A storefront can survive
   * with no credit at all (resolvePoweredByCredit can return {kind:"none"}); a FLYER cannot
   * — it needs a name at the top.
   */
  degradedReason: "no-company-name" | null;
}

/**
 * Neutral graphite for a de-branded partner who has no brand colours.
 * Deliberately NOT platform emerald: falling back to our green would silently re-brand
 * their flyer as ours through colour alone, which is exactly what de-branding forbids.
 */
const NEUTRAL: KitPalette = {
  primary: "#111827", accent: "#374151", ink: "#0f172a",
  paper: "#ffffff", onPrimary: "#ffffff", muted: "#64748b",
};

const PLATFORM: KitPalette = {
  primary: "#059669", accent: "#0f172a", ink: "#0f172a",
  paper: "#ffffff", onPrimary: "#ffffff", muted: "#64748b",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accept only a full 6-digit hex; anything else falls back. Never trust stored colour text. */
function hex(value: string | null | undefined, fallback: string): string {
  const v = value?.trim();
  return v && HEX.test(v) ? v.toLowerCase() : fallback;
}

/**
 * Relative luminance (WCAG) → pick black or white text for a background.
 * A partner picking a pale brand colour must not end up with white-on-yellow headlines.
 */
export function readableOn(background: string): string {
  const v = hex(background, "#000000").slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? "#0f172a" : "#ffffff";
}

/**
 * Resolve the brand a reseller's marketing assets should carry.
 *
 * @param accentOverride the partner's per-kit accent choice (ResellerKitPreference.accentColor).
 *   Deliberately SEPARATE from ResellerProfile.brandPrimaryColor — that column drives their
 *   PAID login page, and writing to it from a flyer editor would silently restyle their
 *   login screen. Prefilled from it, never written back.
 */
export function resolveResellerKitBrand(
  p: ResellerKitBrandProfile | null | undefined,
  accentOverride?: string | null,
): KitBrand {
  const country = p?.country?.trim() || null;
  const companyName = p?.companyName?.trim() || "";
  const debranded = isResellerDebranded(p);
  const branded = isResellerBranded(p);

  // De-branded but nameless → we have nothing to print at the top of the flyer.
  // Fall back to platform branding and tell them why.
  if (debranded && !companyName) {
    return {
      tier: "platform",
      brandName: PLATFORM_BRAND_NAME,
      logoUrl: null,
      colors: { ...PLATFORM, accent: hex(accentOverride, PLATFORM.accent) },
      allowPlatformMark: true,
      country,
      landingBrandMismatch: false,
      degradedReason: "no-company-name",
    };
  }

  if (!debranded && !branded) {
    return {
      tier: "platform",
      brandName: PLATFORM_BRAND_NAME,
      logoUrl: null,
      colors: { ...PLATFORM, accent: hex(accentOverride, PLATFORM.accent) },
      allowPlatformMark: true,
      country,
      landingBrandMismatch: false,
      degradedReason: null,
    };
  }

  // De-branded (free) or Branded (paid): the partner's own identity.
  // Brand colours are only EXPOSED on the paid /reseller/branding/colors page, so a free
  // de-branded partner usually has null for both — hence the neutral base, plus the kit's
  // own accent picker to fill the gap.
  const primary = hex(p?.brandPrimaryColor, NEUTRAL.primary);
  const accent = hex(accentOverride, hex(p?.brandAccentColor, NEUTRAL.accent));
  return {
    tier: branded ? "branded" : "debranded",
    brandName: companyName,
    logoUrl: p?.brandLogoUrl?.trim() || null,
    colors: { ...NEUTRAL, primary, accent, onPrimary: readableOn(primary) },
    allowPlatformMark: false,
    country,
    // Paid partners get a branded signup page; free de-branded partners do not.
    landingBrandMismatch: !branded,
    degradedReason: null,
  };
}

/** Prisma select fragment for the fields this resolver needs. */
export const RESELLER_KIT_BRAND_SELECT = {
  status: true,
  whiteLabelStatus: true,
  whiteLabelTier: true,
  imprint: true,
  brandLogoUrl: true,
  companyName: true,
  website: true,
  showCustomerPageCredit: true,
  brandPrimaryColor: true,
  brandAccentColor: true,
  country: true,
} as const;
