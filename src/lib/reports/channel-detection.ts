/**
 * Server-side channel inference for the visit beacon.
 *
 * Given the request (headers + URL + body), figure out which marketing
 * channel the visitor came from. Maps onto the slugs in `channels.ts`
 * so Order.channel + WebsiteVisit.channel use the same vocabulary and
 * the Sales / Visits / Funnel reports cross-reference cleanly.
 *
 * Detection priority (first match wins):
 *   1. utm_source / utm_medium hint — explicit campaign tracking
 *   2. Referrer hostname pattern — Google → organic, Facebook → social, etc.
 *   3. Internal referrer (matches the restaurant's own domain) → "internal"
 *   4. Empty referrer → "direct"
 *
 * Returns "direct" as the safe fallback so reports always have a value.
 */
import type { ChannelSlug } from "@/lib/reports/channels";

export interface ChannelInputs {
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
  };
  referrer?: string | null;
  /** The restaurant's published primary domain (e.g. "luigis.com") —
   *  used to detect internal-vs-external referrers. Optional; without
   *  it, "internal" routing is skipped. */
  restaurantDomain?: string | null;
  /** True when the visit came from the platform marketplace
   *  (?from=marketplace in the URL). Pre-computed by the caller
   *  because it's a known platform contract, not a heuristic. */
  fromMarketplace?: boolean;
}

/** Resolve a channel slug from request signals. */
export function detectChannel(inputs: ChannelInputs): ChannelSlug {
  if (inputs.fromMarketplace) return "marketplace";

  // 1. Explicit campaign tracking via utm_*.
  const utmSource = (inputs.utm?.source ?? "").toLowerCase().trim();
  const utmMedium = (inputs.utm?.medium ?? "").toLowerCase().trim();

  if (utmMedium === "cpc" || utmMedium === "paid" || utmMedium === "ppc") return "paid_ads";
  if (utmMedium === "email" || utmSource === "email" || utmSource === "newsletter") return "email";
  if (utmMedium === "affiliate" || utmSource === "affiliate") return "affiliate";
  if (utmMedium === "social" || isSocialSource(utmSource)) return "social_media";
  if (utmSource === "google" && utmMedium === "organic") return "organic";

  // 2. Referrer-based detection. We only look at the hostname — never
  //    the full URL — both for privacy and because the path doesn't
  //    matter for channel attribution.
  const referrerHost = parseHostname(inputs.referrer);
  if (referrerHost) {
    // 3. Internal referrer first (a click from the restaurant's
    //    hosted marketing site to /order should be "internal", not
    //    "referral").
    if (inputs.restaurantDomain && hostMatches(referrerHost, inputs.restaurantDomain)) {
      return "internal";
    }

    if (isSearchEngine(referrerHost)) return "organic";
    if (isSocialDomain(referrerHost)) return "social_media";
    if (isAdNetwork(referrerHost)) return "paid_ads";
    return "referral";
  }

  // 4. No referrer + no utm → typed URL or bookmark.
  return "direct";
}

// ── Helpers ───────────────────────────────────────────────────────────

function parseHostname(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether two hostnames refer to the same site (apex + www + subdomains). */
function hostMatches(host: string, ownDomain: string): boolean {
  const own = ownDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Strip www. so "www.luigis.com" matches the configured "luigis.com".
  const norm = (s: string) => s.replace(/^www\./, "");
  return norm(host) === norm(own) || host.endsWith(`.${norm(own)}`);
}

function isSearchEngine(host: string): boolean {
  // Cover the major engines we see in the wild; this list is
  // intentionally short — anything missing falls through to "referral",
  // which is still a reasonable bucket.
  return /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|kagi)\./i.test(host);
}

function isSocialDomain(host: string): boolean {
  return /(^|\.)(facebook|instagram|tiktok|twitter|x|linkedin|reddit|pinterest|snapchat|threads|youtube|t\.co|fb)\./i.test(host)
      || host === "t.co" || host === "lnkd.in";
}

function isAdNetwork(host: string): boolean {
  return /(^|\.)(googleadservices|doubleclick|googlesyndication|facebookads)\./i.test(host);
}

function isSocialSource(source: string): boolean {
  return ["facebook", "instagram", "tiktok", "twitter", "x", "linkedin", "reddit", "pinterest", "snapchat", "threads", "youtube"].includes(source);
}

/** Coarse device classification from a User-Agent. We don't pull in
 *  a UA-parser library; the buckets are intentionally rough since the
 *  report only needs desktop / mobile / tablet split. */
export function classifyDevice(userAgent: string | null | undefined): "desktop" | "mobile" | "tablet" {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile/.test(ua)) return "mobile";
  return "desktop";
}
