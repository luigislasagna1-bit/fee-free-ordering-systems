/**
 * Marketing/attribution channels for reports.
 *
 * Lives separately from the Prisma schema so:
 *   1. The schema stays a plain `String?` (no enum-rename DB migrations
 *      every time we add a new channel).
 *   2. UI labels + colors are co-located with the source-of-truth list.
 *   3. The visit-beacon tracker and the order-create handler reference
 *      the same constant, so a "by channel" pivot is consistent across
 *      Website Visits + Orders.
 *
 * Convention: store the SLUG in the DB ("paid_ads"), render the LABEL
 * in the UI ("Paid ads"). Never store the label.
 *
 * Adding a new channel:
 *   1. Add the entry below.
 *   2. Update the visit-beacon `inferChannelFromRequest()` if you have
 *      a new way to detect it (utm_source, referrer pattern, etc).
 *   3. Existing rows with the old NULL-channel value continue rendering
 *      as "Direct" — no backfill needed.
 */
export type ChannelSlug =
  | "direct"
  | "marketplace"
  | "email"
  | "organic"
  | "paid_ads"
  | "social_media"
  | "referral"
  | "affiliate"
  | "internal";

export interface ChannelDef {
  slug: ChannelSlug;
  label: string;
  /** Tailwind text color class for the legend dot/swatch. */
  color: string;
  /** Hex value for chart series (Recharts / Leaflet markers). */
  hex: string;
  /** One-line plain-English explanation shown in tooltips on the
   *  "by channel" report. */
  description: string;
}

/**
 * Display order matches the GloriaFood Website Visits screenshot
 * legend order so visual continuity holds for owners migrating over.
 */
export const CHANNELS: readonly ChannelDef[] = [
  {
    slug: "affiliate",
    label: "Affiliate",
    color: "text-purple-500",
    hex: "#a855f7",
    description: "Visit came via a tracked partner link with utm_source=affiliate.",
  },
  {
    slug: "direct",
    label: "Direct",
    color: "text-sky-500",
    hex: "#0ea5e9",
    description: "Customer typed the URL or used a bookmark — no referrer info.",
  },
  {
    slug: "email",
    label: "Email",
    color: "text-emerald-500",
    hex: "#10b981",
    description: "Visit came from a click in an email we (or you) sent.",
  },
  {
    slug: "internal",
    label: "From inside your website",
    color: "text-orange-500",
    hex: "#f97316",
    description: "Customer arrived from another page on your own site (hosted marketing page → order page).",
  },
  {
    slug: "organic",
    label: "Organic",
    color: "text-red-500",
    hex: "#ef4444",
    description: "Visit came from a Google / Bing / DuckDuckGo search result (unpaid).",
  },
  {
    slug: "paid_ads",
    label: "Paid ads",
    color: "text-green-600",
    hex: "#16a34a",
    description: "Visit came from a Google Ads / Meta Ads campaign (utm_medium=cpc).",
  },
  {
    slug: "referral",
    label: "Referral",
    color: "text-yellow-500",
    hex: "#eab308",
    description: "Visit came from another website (a blog post, review site, etc).",
  },
  {
    slug: "social_media",
    label: "Social media",
    color: "text-teal-500",
    hex: "#14b8a6",
    description: "Visit came from Facebook / Instagram / TikTok / X.",
  },
  {
    slug: "marketplace",
    label: "Marketplace",
    color: "text-indigo-500",
    hex: "#6366f1",
    description: "Visit came from the Fee Free Marketplace browse page.",
  },
] as const;

const BY_SLUG = new Map<string, ChannelDef>(CHANNELS.map((c) => [c.slug, c]));

/** Resolve a channel definition by slug. Falls back to "direct" for
 *  null/unknown values so reports never crash on bad data. */
export function getChannel(slug: string | null | undefined): ChannelDef {
  if (!slug) return BY_SLUG.get("direct")!;
  return BY_SLUG.get(slug) ?? BY_SLUG.get("direct")!;
}

/** All slugs in display order — convenient for "build a zero-filled
 *  bucket map" in report aggregations. */
export const ALL_CHANNEL_SLUGS: readonly ChannelSlug[] = CHANNELS.map((c) => c.slug);
