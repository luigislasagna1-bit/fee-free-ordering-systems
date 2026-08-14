/**
 * Assemble a fully-resolved render context from a reseller profile + their preferences.
 *
 * Everything a template could possibly need is resolved HERE — QR rendered, logo fetched and
 * inlined, copy translated, prices looked up — so a template is a pure function of its
 * context and can never perform I/O mid-render. That is what makes renders deterministic,
 * and therefore cacheable by content hash.
 */
import QRCode from "qrcode";
import { getDict } from "@/lib/i18n-dict";
import { buildResellerReferralUrl, type ResellerReferralUrlInfo } from "@/lib/reseller/referral-url";
import { resolveResellerKitBrand, type ResellerKitBrandProfile } from "./brand";
import { safeImageDataUri, sanitizeField } from "./images";
import { geomFor, kitSize } from "./sizes";
import { isRenderableLocale, isRtlLocale } from "./fonts";
import type { KitRenderContext, KitTemplate } from "./types";
import type { RenderSpecForHash } from "./cache";

/** Field length caps — also what the editor enforces client-side. */
export const FIELD_LIMITS = {
  headline: 60,
  subhead: 160,
  contactName: 60,
  contactPhone: 32,
  contactEmail: 96,
  contactWebsite: 96,
} as const;

export interface KitPreferences {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactWebsite?: string | null;
  accentColor?: string | null;
  showPricing?: boolean | null;
  locale?: string | null;
  overrides?: Record<string, string | undefined> | null;
}

export interface BuildSpecArgs {
  template: KitTemplate;
  sizeId: string;
  profile: ResellerKitBrandProfile & ResellerReferralUrlInfo;
  prefs: KitPreferences;
  locale: string;
  /** Live add-on prices, already formatted. Empty unless the pricing gate passed. */
  priceRows?: { label: string; price: string }[];
  /**
   * Render at a fraction of the size's normal DPI — used by the on-screen preview.
   *
   * ⚠️ This MUST flow into ctx.geom, not just the output canvas. A template lays itself out
   * entirely in `ctx.geom` units, so scaling the canvas alone draws a full-size flyer into a
   * small frame and crops most of it. Scaling here keeps the preview a true miniature of the
   * downloadable file, which is the whole point of previewing from the same renderer.
   */
  dpiScale?: number;
}

export interface BuiltSpec {
  ctx: KitRenderContext;
  hashInput: RenderSpecForHash;
  /** The size actually used, DPI already scaled. Pass THIS to renderAssetPng. */
  size: ReturnType<typeof kitSize>;
}

/**
 * QR sizing note: generated at a fixed 800px and scaled down by the template. QR modules are
 * square and high-contrast, so downscaling is lossless in practice, whereas generating at an
 * awkward pixel size risks non-integer module widths and a blurry, hard-to-scan code — the
 * one defect that would make the entire asset useless.
 */
async function qrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 800, errorCorrectionLevel: "M" });
}

export async function buildKitSpec(args: BuildSpecArgs): Promise<BuiltSpec> {
  const { template, sizeId, profile, prefs, locale } = args;

  const baseSize = kitSize(sizeId) ?? kitSize(template.sizes[0])!;
  const scale = args.dpiScale ?? 1;
  const size = scale === 1 ? baseSize : { ...baseSize, dpi: Math.max(24, Math.round(baseSize.dpi * scale)) };
  const geom = geomFor(size);

  const brand = resolveResellerKitBrand(profile, prefs.accentColor ?? null);
  const referral = buildResellerReferralUrl(profile);

  // Copy comes from the same dictionary the print routes use. `t()` never throws: a missing
  // key degrades to the English string, and finally to the key itself, so a half-translated
  // locale still produces a printable flyer rather than a crash.
  // Copy resolves template-specific first, then a shared namespace. Strings every flyer needs
  // — "Scan to get started", the free-plan line, the word "commission" — are therefore
  // written and translated ONCE rather than once per template, which matters when the cost of
  // a key is 38 translations.
  const dict = await getDict(locale);
  const root = `resellerKit.${template.copyKey}`;
  const t = (key: string, vars?: Record<string, string | number>) => {
    for (const full of [`${root}.${key}`, `resellerKit.common.${key}`]) {
      try {
        const value = dict(full, vars as never);
        if (typeof value === "string" && value !== full) return value;
      } catch {
        /* try the next namespace */
      }
    }
    return fallbackCopy(`${root}.${key}`);
  };

  const contact = {
    name: sanitizeField(prefs.contactName, FIELD_LIMITS.contactName),
    phone: sanitizeField(prefs.contactPhone, FIELD_LIMITS.contactPhone),
    email: sanitizeField(prefs.contactEmail, FIELD_LIMITS.contactEmail),
    website: sanitizeField(prefs.contactWebsite, FIELD_LIMITS.contactWebsite),
  };

  const overrides: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(prefs.overrides ?? {})) {
    const limit = (FIELD_LIMITS as Record<string, number>)[key] ?? 120;
    const clean = sanitizeField(value, limit);
    if (clean) overrides[key] = clean;
  }

  // Logo is resolved to a data URI with a timeout + type + size guard; null → monogram.
  const logoDataUri = await safeImageDataUri(brand.logoUrl);

  const priceRows = template.showsPlatformPricing && prefs.showPricing ? args.priceRows ?? [] : [];

  const ctx: KitRenderContext = {
    geom,
    brand,
    contact,
    overrides,
    qrDataUri: await qrDataUri(referral.url),
    qrCaption: referral.displayUrl,
    logoDataUri,
    t,
    locale,
    rtl: isRtlLocale(locale),
    priceRows,
  };

  const hashInput: RenderSpecForHash = {
    templateId: template.id,
    // Include the scale so a preview and a full-resolution download never collide in the cache.
    sizeId: scale === 1 ? size.id : `${size.id}@${scale}`,
    locale,
    brand: {
      tier: brand.tier,
      brandName: brand.brandName,
      colors: brand.colors,
      allowPlatformMark: brand.allowPlatformMark,
      country: brand.country,
    },
    contact,
    overrides,
    targetUrl: referral.url,
    logoUrl: brand.logoUrl,
    priceRows,
  };

  return { ctx, hashInput, size };
}

/**
 * Last-resort English so a missing key prints readable words rather than a dotted path on a
 * flyer someone is about to hand to a restaurant owner.
 */
function fallbackCopy(fullKey: string): string {
  const leaf = fullKey.split(".").pop() ?? fullKey;
  return leaf
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase());
}

export { isRenderableLocale };
