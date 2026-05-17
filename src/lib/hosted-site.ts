/**
 * Hosted marketing site helpers — feed the public-facing site renderer at
 * /site/[slug] (and the subdomain-rewritten route in Phase 6).
 *
 * Gated on the `hosted_marketing_page` feature, which the
 * "Sales Optimized Website" add-on unlocks.
 */

import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

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
  bannerUrl: string | null;
  socialLinks: Record<string, string> | null;
  themeSettings: Record<string, unknown> | null;
  hours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null }>;
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
      bannerUrl: true, socialLinks: true, themeSettings: true,
      isActive: true, publishedAt: true,
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
      acceptsReservations: true,
    },
  });
  if (!restaurant || !restaurant.isActive) return { kind: "not_found" };
  if (!restaurant.publishedAt) return { kind: "not_published" };

  const entitled = await hasFeature(restaurant.id, "hosted_marketing_page");
  if (!entitled) {
    return { kind: "upgrade_required", restaurantName: restaurant.name };
  }

  const [hours, featured] = await Promise.all([
    prisma.openingHours.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { dayOfWeek: "asc" },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, isAvailable: true, isFeatured: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
      select: { id: true, name: true, description: true, price: true, imageUrl: true },
    }),
  ]);

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
      bannerUrl: restaurant.bannerUrl,
      socialLinks: safeJson(restaurant.socialLinks),
      themeSettings: safeJson(restaurant.themeSettings),
      hours,
      acceptsPickup: restaurant.acceptsPickup,
      acceptsDelivery: restaurant.acceptsDelivery,
      acceptsDineIn: restaurant.acceptsDineIn,
      acceptsReservations: restaurant.acceptsReservations,
      featuredItems: featured,
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
