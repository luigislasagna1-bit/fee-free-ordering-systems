/**
 * Hosted marketing site helpers — feed the public-facing site renderer at
 * /site/[slug] (and the subdomain-rewritten route in Phase 6).
 *
 * Gated on the `hosted_marketing_page` feature, which the
 * "Sales Optimized Website" add-on unlocks.
 */

import prisma from "@/lib/db";
import { resolveEffectiveMapsKey } from "@/lib/platform-maps";
import { hasFeature } from "@/lib/entitlements";
import {
  parseHostedSiteSettings,
  type HostedSiteSettings,
} from "@/lib/hosted-site-settings";

export interface HostedSiteData {
  id: string;
  name: string;
  slug: string;
  slogan: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  cuisineType: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  bannerUrl: string | null;
  socialLinks: Record<string, string> | null;
  themeSettings: Record<string, unknown> | null;
  hours: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string | null;
    closeTime: string | null;
    closesNextDay?: boolean;
    /** null/undefined = GENERAL (all-services) row; "pickup"/"delivery"/… = a
     *  per-service override. Needed so the hosted site's open-status + hours
     *  table use the GENERAL row, not an arbitrary service row. Luigi 2026-06-22. */
    service?: string | null;
  }>;
  /** Display format for hours — affects both the hero "Open now" badge
   *  and the weekly hours table render. Stored as 24h regardless; this
   *  is purely cosmetic. */
  hoursFormat: "12h" | "24h";
  /** IANA timezone of the restaurant. Used to match real-world "today"
   *  to holiday rows so a Dec 25 holiday closes the restaurant when
   *  the LOCAL clock says Dec 25, not when UTC does. */
  timezone: string;
  /** Upcoming holiday closures (60-day forward window). When today's
   *  date matches one of these, the restaurant is treated as closed
   *  regardless of the weekly schedule. endDate/rules carry the
   *  Gloriafood-parity period + per-service semantics (see
   *  src/lib/holiday-rules.ts). */
  holidays: Array<{ id: string; date: string; endDate: string | null; rules: string | null; name: string | null }>;
  /** Active "special offer" promotions — auto-apply promos within their
   *  startsAt/endsAt window. Rendered as marketing cards on the hosted
   *  site. Same source-of-truth as the order-page promo engine; the
   *  hosted site is read-only. Capped at 6 (any more crowds the page).
   */
  specialOffers: Array<{
    id: string;
    name: string;
    description: string | null;
    promotionType: string;
  }>;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  acceptsDineIn: boolean;
  acceptsReservations: boolean;
  // What featured items to show on the homepage.
  featuredItems: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
  }>;
  /** Menu category names + a small set of featured item names. Fed to
   *  the programmatic-SEO link builder so dishes like "Lava Cake" or
   *  "Pasta" become indexable keywords paired with surrounding cities.
   *  Capped to a sensible number to avoid spamming thin landing pages. */
  seoKeywords: string[];
  /** Restaurant lat/lng for centering the map. Null when not set. */
  lat: number | null;
  lng: number | null;
  /** Map provider preference + optional key. Same as what /order/[slug]/info
   *  uses — Leaflet is the default and needs no key, Google Maps gives a
   *  more polished look when the restaurant has set up an API key in
   *  /admin/website/map-settings. */
  mapProvider: "leaflet" | "google";
  googleMapsApiKey: string | null;
  /** Active delivery zones for the map overlay. Each zone is a colored
   *  ring at the given radius from the restaurant (matches the existing
   *  /order/[slug]/info map's data model — circles concentric on the
   *  restaurant pin, NOT centered on each zone's own lat/lng). Inactive
   *  zones are filtered out so customers don't see paused/seasonal areas. */
  deliveryZones: Array<{
    id: string;
    name: string;
    color: string;
    radiusKm: number;
    deliveryFee: number;
    minimumOrder: number;
    estimatedMinutes: number;
    isActive: boolean;
  }>;
  /** Owner-controlled layout/copy choices from the website editor.
   *  Always populated (defaults when the owner hasn't customized anything).
   *  Base content (menu/hours/address) still comes from the canonical
   *  restaurant fields — these settings only control what's visible and
   *  what custom sections to add. */
  settings: HostedSiteSettings;
}

export type HostedSiteResult =
  | { kind: "ok"; data: HostedSiteData }
  | { kind: "not_found" }
  | { kind: "not_published" }
  | { kind: "upgrade_required"; restaurantName: string };

/**
 * Look up the marketing-site payload for a slug. Returns a tagged union so
 * the page can render an upgrade-prompt vs. 404 vs. real content.
 */
export async function loadHostedSite(slug: string): Promise<HostedSiteResult> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, slogan: true, description: true,
      phone: true, email: true, address: true, city: true, state: true,
      zip: true, country: true, cuisineType: true, logoUrl: true,
      // Owner-uploaded favicon — used as the browser tab icon on the hosted
      // website (was never selected, so the site kept the platform default
      // even after the owner set one). Luigi 2026-06-05.
      faviconUrl: true,
      bannerUrl: true, socialLinks: true, themeSettings: true,
      hostedSiteSettings: true,
      lat: true, lng: true, mapProvider: true, googleMapsApiKey: true,
      isActive: true, publishedAt: true,
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
      acceptsReservations: true,
      // hoursFormat controls 12h vs 24h rendering across the hosted site.
      // timezone determines which calendar day is "today" for holiday
      // matching.
      hoursFormat: true, timezone: true,
    },
  });
  if (!restaurant || !restaurant.isActive) return { kind: "not_found" };
  if (!restaurant.publishedAt) return { kind: "not_published" };

  const entitled = await hasFeature(restaurant.id, "hosted_marketing_page");
  if (!entitled) {
    return { kind: "upgrade_required", restaurantName: restaurant.name };
  }

  // Compute today's calendar date in the restaurant's local timezone so
  // a holiday set for "Dec 25" matches when the local clock says Dec 25
  // regardless of the server's UTC midnight crossing.
  const todayStartUtc = new Date();
  todayStartUtc.setUTCHours(0, 0, 0, 0);
  // Reach back 1 day too, in case the restaurant's local zone hasn't
  // ticked over to the next day yet but UTC has.
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);

  const [hours, featured, categories, popularItems, deliveryZones, holidays, specialOffers] = await Promise.all([
    prisma.openingHours.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { dayOfWeek: "asc" },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, service: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isAvailable: true, isFeatured: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
      select: { id: true, name: true, description: true, price: true, imageUrl: true },
    }),
    // Menu categories the restaurant actually has — top SEO signal because
    // category names line up with how customers search ("pizza delivery",
    // "pasta delivery", "desserts near me"). Cap at 12 so we don't generate
    // hundreds of thin pages from a 40-category menu.
    prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id, isActive: true, isHidden: false },
      orderBy: { sortOrder: "asc" },
      take: 12,
      select: { name: true },
    }),
    // Featured/popular item names — restaurants featuring "Lava Cake" or
    // "Tiramisu" can rank for those specific dish searches in the area.
    // Cap to 8 so the link footer stays manageable.
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isAvailable: true, isFeatured: true },
      orderBy: { sortOrder: "asc" },
      take: 8,
      select: { name: true },
    }),
    // Active delivery zones for the map overlay. Filtered to isActive so
    // paused/seasonal zones don't show up to customers. Order by sortOrder
    // so the legend matches the admin's preferred order.
    prisma.deliveryZone.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, color: true, radiusKm: true,
        deliveryFee: true, minimumOrder: true, estimatedMinutes: true,
        isActive: true,
      },
    }),
    // Holidays near today (yesterday + today + a small forward window).
    // Forward window keeps the customer-facing schema.org block honest
    // ("we'll be closed Dec 25"). We grab a generous 60-day forward
    // slice — cheap, and covers vacation closures planned a couple
    // months ahead.
    prisma.restaurantHoliday.findMany({
      where: {
        restaurantId: restaurant.id,
        OR: [
          {
            date: {
              gte: yesterdayStartUtc,
              lte: new Date(todayStartUtc.getTime() + 60 * 24 * 60 * 60 * 1000),
            },
          },
          // PERIODS that started before the window but are still running.
          { endDate: { gte: yesterdayStartUtc } },
        ],
      },
      orderBy: { date: "asc" },
      select: { id: true, date: true, endDate: true, rules: true, name: true },
    }),
    // Active auto-apply promotions to surface as marketing cards on
    // the hosted site. We filter to autoApply=true so customers see
    // ONLY offers they can actually use without typing a code (code-
    // based coupons would feel like a trick if surfaced here — "20%
    // off!" with no way for the customer to figure out how to claim).
    // Date window filter: include only promos whose startsAt has
    // passed AND endsAt is in the future (or null). Cap at 6 so a
    // restaurant running 20 promos doesn't crowd the page.
    prisma.promotion.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        autoApply: true,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [
          {
            OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        description: true,
        promotionType: true,
      },
    }),
  ]);

  // Build the SEO-keyword pool from category names + featured item names.
  // De-duplicated, normalized to lowercase for the dedupe, original-case
  // preserved for display.
  const seenKeyword = new Set<string>();
  const seoKeywords: string[] = [];
  const addKeyword = (raw: string | undefined | null) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Skip overly long names (>3 words) — too long-tail to rank, and
    // they bloat URLs. "Margherita Pizza" yes, "House Special Margherita
    // Pizza with Fresh Mozzarella" no.
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount > 3) return;
    const key = trimmed.toLowerCase();
    if (seenKeyword.has(key)) return;
    seenKeyword.add(key);
    seoKeywords.push(trimmed);
  };
  for (const c of categories) addKeyword(c.name);
  for (const it of popularItems) addKeyword(it.name);

  return {
    kind: "ok",
    data: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      slogan: restaurant.slogan,
      description: restaurant.description,
      phone: restaurant.phone,
      email: restaurant.email,
      address: restaurant.address,
      city: restaurant.city,
      state: restaurant.state,
      zip: restaurant.zip,
      country: restaurant.country,
      cuisineType: restaurant.cuisineType,
      logoUrl: restaurant.logoUrl,
      faviconUrl: restaurant.faviconUrl,
      bannerUrl: restaurant.bannerUrl,
      socialLinks: safeJson(restaurant.socialLinks),
      themeSettings: safeJson(restaurant.themeSettings),
      hours,
      hoursFormat: (restaurant.hoursFormat === "12h" ? "12h" : "24h") as "12h" | "24h",
      timezone: restaurant.timezone,
      // Date is serialized to YYYY-MM-DD so the client doesn't have to
      // mess with timezones — the date is the date, period.
      holidays: holidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        endDate: h.endDate ? h.endDate.toISOString().slice(0, 10) : null,
        rules: h.rules ?? null,
        name: h.name,
      })),
      specialOffers,
      acceptsPickup: restaurant.acceptsPickup,
      acceptsDelivery: restaurant.acceptsDelivery,
      acceptsDineIn: restaurant.acceptsDineIn,
      acceptsReservations: restaurant.acceptsReservations,
      featuredItems: featured,
      seoKeywords,
      lat: restaurant.lat,
      lng: restaurant.lng,
      mapProvider: (restaurant.mapProvider === "google" ? "google" : "leaflet") as "leaflet" | "google",
      // Sales-facing "delivery areas" map → Google tiles when a key is
      // available (the restaurant's own, else the platform key). The functional
      // pin/zone maps stay free Leaflet. Luigi 2026-06-14.
      googleMapsApiKey: (await resolveEffectiveMapsKey(restaurant.googleMapsApiKey)) ?? null,
      deliveryZones,
      settings: parseHostedSiteSettings(restaurant.hostedSiteSettings),
    },
  };
}

function safeJson(s: string | null | undefined): Record<string, any> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
