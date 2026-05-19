/**
 * Marketplace helpers — list public restaurants, ensure a listing
 * exists for a subscribed restaurant, compute "vs UberEats" savings.
 *
 * The public /marketplace page reads from listPublicMarketplaceListings().
 * The subscription webhook calls ensureMarketplaceListing() the moment
 * a restaurant's `marketplace` add-on flips to active.
 */

import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

/** UberEats / DoorDash standard commission, used as the comparison
 *  baseline in our "savings" pitch. Three big delivery apps all hover
 *  around 30% — see https://www.fastcompany.com/.../ubereats-commissions */
export const UBER_EATS_COMMISSION_PCT = 30;

/** Hard monthly cap we charge a marketplace subscriber. Above this,
 *  the customer is paying nothing extra and the restaurant pockets
 *  every additional order's margin. Defined here (not in the AddOn
 *  row) so order-time billing math stays consistent even if a
 *  superadmin tweaks the AddOn's display price. */
export const MARKETPLACE_MONTHLY_CAP_CENTS = 19999; // $199.99

/** Per-order rate used when computing the "or per-order, whichever is
 *  lower" alternative. Tuned so a restaurant doing ~$650/mo of
 *  marketplace orders pays roughly the cap, and below that pays
 *  proportionally less. Phase M2 will make this configurable
 *  per-AddOn-row. */
export const MARKETPLACE_PER_ORDER_CENTS = 99; // $0.99/order

export type PublicListing = {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  city: string | null;
  cuisineType: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  marketplaceTagline: string | null;
  marketplaceShortDesc: string | null;
  marketplaceBanner: string | null;
  marketplaceCategories: string[];
  marketplaceTags: string[];
  marketplaceFeatured: boolean;
  marketplaceSortOrder: number;
};

/**
 * Public marketplace browse: every restaurant that has BOTH an active
 * marketplace entitlement AND `isListed = true`. Sorted: featured
 * restaurants first, then by manual sort order, then alphabetical.
 *
 * This is the read backing the /marketplace page. Result is small
 * enough to render without pagination at typical scale (sub-1000
 * restaurants). When we cross that, we'll add cursor pagination.
 */
export async function listPublicMarketplaceListings(): Promise<PublicListing[]> {
  // Step 1: candidates — every listing that's set to "listed" and whose
  // restaurant is active. Pull the restaurant + the active add-on rows
  // so we can filter by entitlement in one round-trip.
  const rows = await prisma.marketplaceListing.findMany({
    where: {
      isListed: true,
      restaurant: { isActive: true },
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          cuisineType: true,
          bannerUrl: true,
          logoUrl: true,
          addOns: {
            where: { status: { in: ["active", "trialing"] } },
            include: { addOn: { select: { enabledFeatures: true } } },
          },
        },
      },
    },
    orderBy: [
      { marketplaceFeatured: "desc" },
      { marketplaceSortOrder: "asc" },
    ],
  });

  // Step 2: filter to only those whose active add-ons grant
  // `marketplace_listing`. Done in JS because Prisma can't easily
  // express "JSON array contains X" across the relation.
  const out: PublicListing[] = [];
  for (const r of rows) {
    const granted = r.restaurant.addOns.some((sub) => {
      try {
        const features = JSON.parse(sub.addOn.enabledFeatures || "[]");
        return Array.isArray(features) && features.includes("marketplace_listing");
      } catch {
        return false;
      }
    });
    if (!granted) continue;
    out.push({
      id: r.id,
      restaurantId: r.restaurantId,
      name: r.restaurant.name,
      slug: r.restaurant.slug,
      city: r.restaurant.city,
      cuisineType: r.restaurant.cuisineType,
      bannerUrl: r.restaurant.bannerUrl,
      logoUrl: r.restaurant.logoUrl,
      marketplaceTagline: r.marketplaceTagline,
      marketplaceShortDesc: r.marketplaceShortDesc,
      marketplaceBanner: r.marketplaceBanner,
      marketplaceCategories: safeJsonStringArray(r.marketplaceCategories),
      marketplaceTags: safeJsonStringArray(r.marketplaceTags),
      marketplaceFeatured: r.marketplaceFeatured,
      marketplaceSortOrder: r.marketplaceSortOrder,
    });
  }

  // Alphabetical tiebreaker — Prisma orderBy can't combine with our
  // post-filter, so do it here.
  out.sort((a, b) => {
    if (a.marketplaceFeatured !== b.marketplaceFeatured) {
      return a.marketplaceFeatured ? -1 : 1;
    }
    if (a.marketplaceSortOrder !== b.marketplaceSortOrder) {
      return a.marketplaceSortOrder - b.marketplaceSortOrder;
    }
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Create or update the MarketplaceListing for a restaurant. Called
 * from the subscription webhook the moment the `marketplace` add-on
 * activates. Idempotent — running it twice (Stripe sometimes retries)
 * is a safe no-op past the create.
 *
 * Defaults are pulled from the Restaurant row so the first listing
 * isn't empty — we lift slogan → tagline, description → short desc,
 * cuisineType → first category, bannerUrl → marketplaceBanner. The
 * admin can override every one of these in /admin/marketplace.
 */
export async function ensureMarketplaceListing(restaurantId: string): Promise<{ created: boolean; id: string }> {
  const existing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      slogan: true,
      description: true,
      cuisineType: true,
      bannerUrl: true,
    },
  });

  const created = await prisma.marketplaceListing.create({
    data: {
      restaurantId,
      isListed: true,
      marketplaceTagline: r?.slogan ?? null,
      marketplaceShortDesc: r?.description?.slice(0, 200) ?? null,
      marketplaceBanner: r?.bannerUrl ?? null,
      marketplaceCategories: r?.cuisineType
        ? JSON.stringify([r.cuisineType.toLowerCase()])
        : "[]",
      marketplaceTags: "[]",
    },
  });
  return { created: true, id: created.id };
}

/**
 * Returns true if this restaurant is currently surfaceable on the
 * public marketplace. Used by /admin/marketplace and the brand
 * dashboard to show subscription state.
 */
export async function isOnMarketplace(restaurantId: string): Promise<boolean> {
  const [listing, hasMarketplace] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId },
      select: { isListed: true },
    }),
    hasFeature(restaurantId, "marketplace_listing"),
  ]);
  return !!(listing?.isListed && hasMarketplace);
}

/**
 * "How much you would have paid on UberEats" — given an order subtotal
 * (in cents), returns 30% of it. Used by the order POST to stamp
 * a `savedVsUberEatsCents` value on every marketplace order in M2,
 * and right now to power the savings preview on /admin/marketplace.
 */
export function computeUberEatsEquivalentCents(orderSubtotalCents: number): number {
  return Math.round(orderSubtotalCents * (UBER_EATS_COMMISSION_PCT / 100));
}

function safeJsonStringArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
