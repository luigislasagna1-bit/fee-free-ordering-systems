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
 *  every additional order is free for the restaurant. With the new
 *  $3.00/order rate, the cap hits at ~83 orders/month — covering all
 *  but the very highest-volume restaurants for a predictable $249.99.
 *  Defined here (not in the AddOn row) so order-time billing math
 *  stays consistent even if a superadmin tweaks the AddOn's price. */
export const MARKETPLACE_MONTHLY_CAP_CENTS = 24999; // $249.99

/** Per-order rate for marketplace orders on the pay-as-you-go (PAYG)
 *  billing mode. This is what the platform bills the restaurant —
 *  NOT what the customer pays (customer pays the menu price, same
 *  as a direct order). Covers system, operations, marketing, support
 *  — explicitly NOT delivery (that's ShipDay passthrough).
 *
 *  PAYG only — restaurants on the $199.99/mo monthly plan pay flat
 *  via Stripe subscription and the settlement engine skips them. */
export const MARKETPLACE_PER_ORDER_CENTS = 300; // $3.00/order

/** Flat monthly subscription price for the Marketplace monthly plan.
 *  Source of truth for the $199.99 price tag we show in marketing UI.
 *  The actual Stripe Price is created from AddOn.monthlyPriceCents
 *  when the superadmin clicks Sync — keep this in sync with the seed. */
export const MARKETPLACE_MONTHLY_PLAN_CENTS = 19999; // $199.99

/** USD — the platform always bills in USD regardless of where the
 *  restaurant is located. Marketing copy + Stripe invoice currency.
 *  Tax % varies by restaurant location — see src/lib/platform-tax.ts
 *  (CRA destination-of-supply rules: Canadian = GST/HST per province,
 *  US/international = exempt). */
export const PLATFORM_CURRENCY = "usd";

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
 * Public marketplace browse: every restaurant that's opted into the
 * marketplace AND `isListed = true`. Sorted: featured restaurants
 * first, then by manual sort order, then alphabetical.
 *
 * "Opted into the marketplace" = EITHER
 *   - billingMode "monthly" backed by an active marketplace add-on
 *     subscription ($199.99/mo); OR
 *   - billingMode "payg" — they hit the PAYG opt-in confirmation page
 *     and agreed to $3-per-marketplace-order billing.
 *
 * Both modes appear identically to customers; the only difference is
 * how the restaurant gets billed.
 *
 * Result is small enough to render without pagination at typical scale
 * (sub-1000 restaurants). When we cross that we'll add cursor pagination.
 */
export async function listPublicMarketplaceListings(): Promise<PublicListing[]> {
  // Step 1: candidates — every listing that's set to "listed" and whose
  // restaurant is active. Pull the active add-on rows so we can verify
  // monthly subscribers are still entitled (subscription could have
  // lapsed since the listing was first created).
  const rows = await prisma.marketplaceListing.findMany({
    where: {
      isListed: true,
      restaurant: {
        isActive: true,
        // PUBLISHED-ONLY. An unpublished restaurant can't actually
        // receive marketplace orders (their /order/<slug> page would
        // 404 from the customer side), so they shouldn't be discoverable.
        // The marketplace eligibility gate prevents new signups from
        // unpublished restaurants, but this filter is the defense-in-depth
        // for restaurants that got their listing created back when
        // publishing-before-marketplace wasn't enforced.
        publishedAt: { not: null },
      },
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

  // Step 2: filter by billing mode + entitlement.
  //   - payg listings are always entitled (no Stripe sub required)
  //   - monthly listings need an active add-on grant — if the
  //     subscription lapsed, the webhook would have flipped them back
  //     to payg, but we double-check here as defense in depth.
  const out: PublicListing[] = [];
  for (const r of rows) {
    let granted = false;
    if (r.billingMode === "payg") {
      granted = true;
    } else if (r.billingMode === "monthly") {
      granted = r.restaurant.addOns.some((sub) => {
        try {
          const features = JSON.parse(sub.addOn.enabledFeatures || "[]");
          return Array.isArray(features) && features.includes("marketplace_listing");
        } catch {
          return false;
        }
      });
    }
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
 *
 * Either billing mode counts: monthly subscribers (via the add-on
 * entitlement) AND PAYG opt-ins (via the listing existing) both
 * appear publicly the same way.
 */
export async function isOnMarketplace(restaurantId: string): Promise<boolean> {
  const [listing, hasMarketplace] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId },
      select: { isListed: true, billingMode: true },
    }),
    hasFeature(restaurantId, "marketplace_listing"),
  ]);
  if (!listing?.isListed) return false;
  if (listing.billingMode === "payg") return true;          // PAYG → no sub required
  if (listing.billingMode === "monthly") return hasMarketplace; // monthly → must be entitled
  return false;
}

/**
 * Returns the marketplace "membership" state for an admin-facing page.
 * Used by /admin/marketplace to decide which view to render:
 *   - "none"    → restaurant hasn't opted in OR was previously listed
 *                 but is now hidden (post-cancellation). Show the
 *                 two-plan upsell (MarketplaceLockedView).
 *   - "payg"    → opted into pay-as-you-go AND currently listed; show
 *                 the listing editor.
 *   - "monthly" → on the $199.99/mo subscription; show the listing editor.
 *
 * A hidden (isListed=false) listing returns "none" so the owner sees
 * the plan-choice screen again — they have to re-confirm which way they
 * want to be billed before being re-listed. Avoids the post-cancel
 * silent-PAYG surprise.
 */
export async function getMarketplaceMembership(restaurantId: string): Promise<"none" | "payg" | "monthly"> {
  const [listing, hasMarketplace] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { restaurantId },
      select: { billingMode: true, isListed: true },
    }),
    hasFeature(restaurantId, "marketplace_listing"),
  ]);
  // Monthly always wins when the add-on is active — the webhook flips
  // billingMode to "monthly" on activation, so this is just defensive.
  if (hasMarketplace) return "monthly";
  if (listing?.billingMode === "payg" && listing.isListed) return "payg";
  return "none";
}

/**
 * "How much you would have paid on UberEats" — given an order subtotal
 * (in cents), returns 30% of it. Used by the order POST to stamp
 * a `savedVsUberEatsCents` value on every marketplace order, and to
 * power the savings card on /admin/marketplace.
 */
export function computeUberEatsEquivalentCents(orderSubtotalCents: number): number {
  return Math.round(orderSubtotalCents * (UBER_EATS_COMMISSION_PCT / 100));
}

/**
 * Compute what the restaurant owes the platform THIS billing cycle.
 *
 * New free-base model:
 *   - Joining the marketplace is $0/month
 *   - Each marketplace order accrues $3.00 toward this month's bill
 *   - Once the running total hits $249.99 (~83 orders), the cap kicks
 *     in and every additional order this month is free
 *
 * Returns:
 *   - capCents: hard monthly cap ($249.99)
 *   - accruedCents: per-order × month-to-date count (uncapped)
 *   - effectiveCents: min(accruedCents, capCents) — what we actually bill
 *   - capHit: true when month-to-date has reached the cap (great UX
 *     signal: "no more fees this month, every order is pure margin")
 *
 * Phase M2 EXPOSES this number on /admin/marketplace; the actual
 * monthly settlement (Stripe invoice or ACH debit) lives in the
 * monthly billing cron — M2.5 work.
 */
export function computeMonthlyChargeCents(monthToDateOrders: number): {
  capCents: number;
  accruedCents: number;
  effectiveCents: number;
  capHit: boolean;
} {
  const cap = MARKETPLACE_MONTHLY_CAP_CENTS;
  const accrued = MARKETPLACE_PER_ORDER_CENTS * monthToDateOrders;
  const effective = Math.min(accrued, cap);
  return {
    capCents: cap,
    accruedCents: accrued,
    effectiveCents: effective,
    capHit: accrued >= cap,
  };
}

/**
 * Stamp a fresh marketplace order: increment the listing's counters,
 * bump lifetime savings, and roll over the monthly counters if a new
 * calendar month has begun since `currentMonthStartedAt`.
 *
 * Called from the order POST AFTER the Order row is created — we have
 * the final order total + computed savings to record. Idempotent
 * against duplicate calls because we operate on the listing row, not
 * the Order; if the caller accidentally invokes this twice for the
 * same order, the second call just over-counts by one. Production
 * callers should guard with their own once-only semantics.
 */
export async function recordMarketplaceOrder(args: {
  restaurantId: string;
  orderTotalCents: number;
  savedVsUberEatsCents: number;
}): Promise<void> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId: args.restaurantId },
    select: {
      id: true,
      currentMonthStartedAt: true,
      currentMonthOrders: true,
      currentMonthRevenue: true,
    },
  });
  if (!listing) {
    // No listing row — restaurant isn't entitled or webhook missed.
    // We do NOT auto-create here because the caller already checked
    // entitlement; if we got past that check the row really should
    // exist. Log loudly so the gap is investigable.
    console.warn(`[recordMarketplaceOrder] no listing for restaurant ${args.restaurantId}`);
    return;
  }

  // Rollover check: if the listing's currentMonthStartedAt is in a
  // previous calendar month (UTC), reset the counters to zero before
  // adding this order. We use UTC month boundaries because Stripe
  // bills in UTC and restaurants can be in any timezone — keeping
  // counters in a single tz simplifies reconciliation.
  const now = new Date();
  const sameMonth =
    listing.currentMonthStartedAt.getUTCFullYear() === now.getUTCFullYear() &&
    listing.currentMonthStartedAt.getUTCMonth() === now.getUTCMonth();

  await prisma.marketplaceListing.update({
    where: { id: listing.id },
    data: sameMonth
      ? {
          currentMonthOrders: { increment: 1 },
          currentMonthRevenue: { increment: args.orderTotalCents / 100 },
          lifetimeSavingsVsUberEatsCents: { increment: args.savedVsUberEatsCents },
        }
      : {
          // New month — reset, then count this order as the first.
          currentMonthStartedAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          currentMonthOrders: 1,
          currentMonthRevenue: args.orderTotalCents / 100,
          lifetimeSavingsVsUberEatsCents: { increment: args.savedVsUberEatsCents },
        },
  });
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
