/**
 * Marketplace helpers — list public restaurants, ensure a listing
 * exists for a subscribed restaurant, compute "vs UberEats" savings.
 *
 * The public /marketplace page reads from listPublicMarketplaceListings().
 * The subscription webhook calls ensureMarketplaceListing() the moment
 * a restaurant's `marketplace` add-on flips to active.
 */

import prisma from "@/lib/db";
import { haversineKm } from "@/lib/geocode";

/** UberEats / DoorDash standard commission, used as the comparison
 *  baseline in our "savings" pitch. Three big delivery apps all hover
 *  around 30% — see https://www.fastcompany.com/.../ubereats-commissions */
export const UBER_EATS_COMMISSION_PCT = 30;

/** MARKETPLACE IS NOW FREE + INCLUDED for every restaurant (Luigi 2026-07-14).
 *  There is no per-order fee and no monthly plan — every restaurant that offers
 *  pickup or delivery is auto-listed at no charge, and customers see the ones
 *  within MARKETPLACE_RADIUS_KM of them. The fee constants are kept (at 0) so the
 *  order-counter + settlement plumbing keeps running harmlessly (it still powers
 *  the "orders this month / savings vs UberEats" display); the settlement never
 *  bills a $0 invoice. Premium placement (highlights, top spots) is a FUTURE paid
 *  add-on — not built yet. */
export const MARKETPLACE_MONTHLY_CAP_CENTS = 0; // free — no cap needed
export const MARKETPLACE_PER_ORDER_CENTS = 0;   // free — no per-order fee
export const MARKETPLACE_MONTHLY_PLAN_CENTS = 0; // free — no monthly plan

/** How far a customer sees restaurants on the public marketplace (feefreefood).
 *  Only restaurants within this radius of the customer's location are shown as
 *  orderable — a global directory that surfaces what's actually nearby. */
export const MARKETPLACE_RADIUS_KM = 15;

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
  /** Service-type badges — the restaurant's own accepts* flags, so the card can
   *  show "Pickup" / "Delivery" without another query. */
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  /** Geocoded coordinates (null until geocoded) + distance from the customer
   *  when a location was supplied — drives the 15km radius filter + "X km away". */
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  /** When the restaurant signed up — used by the marketplace grid's
   *  "Newest" sort mode. ISO-string serialised at the server→client boundary. */
  createdAt: Date;
};

/**
 * Public marketplace browse (FREE + INCLUDED, Luigi 2026-07-14).
 *
 * The marketplace is no longer opt-in or paid. Every restaurant that:
 *   - is active + published,
 *   - offers pickup OR delivery,
 *   - can take an online card order (marketplace orders are card-only), and
 *   - hasn't explicitly opted OUT (a MarketplaceListing row with isListed=false),
 * is discoverable — with NO listing row or subscription required. The optional
 * MarketplaceListing row only carries customization (tagline/banner/tags/featured).
 *
 * When a customer location is supplied, only restaurants within `radiusKm`
 * (default 15km) are returned, nearest first — a global directory that surfaces
 * what's actually orderable near you. Without a location, all eligible
 * restaurants are returned (the page prompts for a location).
 *
 * Sub-1000-restaurant scale: a bounding-box pre-filter keeps the query local,
 * precise haversine + sort happen in JS. Add PostGIS/cursor pagination past that.
 */
export async function listPublicMarketplaceListings(opts?: {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
}): Promise<PublicListing[]> {
  const radiusKm = opts?.radiusKm ?? MARKETPLACE_RADIUS_KM;
  const hasLoc =
    typeof opts?.lat === "number" && Number.isFinite(opts.lat) &&
    typeof opts?.lng === "number" && Number.isFinite(opts.lng);

  // Bounding-box pre-filter (coarse; precise haversine below) so a local customer
  // doesn't scan a global table.
  let geoWhere: Record<string, unknown> = {};
  if (hasLoc) {
    const dLat = radiusKm / 111; // ~111 km per degree of latitude
    const cosLat = Math.max(0.01, Math.cos((opts!.lat! * Math.PI) / 180));
    const dLng = radiusKm / (111 * cosLat);
    geoWhere = {
      lat: { gte: opts!.lat! - dLat, lte: opts!.lat! + dLat },
      lng: { gte: opts!.lng! - dLng, lte: opts!.lng! + dLng },
    };
  }

  const restaurants = await prisma.restaurant.findMany({
    where: {
      isActive: true,
      publishedAt: { not: null },
      OR: [{ acceptsPickup: true }, { acceptsDelivery: true }],
      // Explicit opt-out only: a restaurant whose listing row is hidden stays
      // off. No row (the default) → included.
      NOT: { marketplaceListing: { is: { isListed: false } } },
      ...geoWhere,
    },
    select: {
      id: true, name: true, slug: true, city: true, cuisineType: true,
      bannerUrl: true, logoUrl: true, createdAt: true,
      lat: true, lng: true, acceptsPickup: true, acceptsDelivery: true,
      stripeChargesEnabled: true,
      paymentProvider: { select: { isActive: true, publishableKey: true } },
      addOns: {
        where: { status: { in: ["active", "trialing"] } },
        include: { addOn: { select: { enabledFeatures: true } } },
      },
      marketplaceListing: {
        select: {
          id: true, marketplaceTagline: true, marketplaceShortDesc: true,
          marketplaceBanner: true, marketplaceCategories: true, marketplaceTags: true,
          marketplaceFeatured: true, marketplaceSortOrder: true,
        },
      },
    },
  });

  const out: PublicListing[] = [];
  for (const r of restaurants) {
    // ORDER-READY ONLY (Luigi 2026-07-14): marketplace orders are card-only, so
    // only list restaurants that can actually take an online order — legacy
    // Stripe-Connect flag OR the key-only capability (active PaymentProvider +
    // publishable key + card_payments entitlement).
    const keyOnlyReady =
      !!(r.paymentProvider?.isActive && r.paymentProvider?.publishableKey) &&
      r.addOns.some((sub) => {
        try {
          const f = JSON.parse(sub.addOn.enabledFeatures || "[]");
          return Array.isArray(f) && f.includes("card_payments");
        } catch {
          return false;
        }
      });
    if (!(r.stripeChargesEnabled || keyOnlyReady)) continue;

    // Precise 15km radius (the bounding box above is only coarse). A restaurant
    // without coordinates can't be placed, so it's excluded from a located view.
    let distanceKm: number | null = null;
    if (hasLoc) {
      if (r.lat == null || r.lng == null) continue;
      distanceKm = haversineKm(opts!.lat!, opts!.lng!, r.lat, r.lng);
      if (distanceKm > radiusKm) continue;
    }

    const listing = r.marketplaceListing;
    out.push({
      id: listing?.id ?? r.id,
      restaurantId: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      cuisineType: r.cuisineType,
      bannerUrl: r.bannerUrl,
      logoUrl: r.logoUrl,
      marketplaceTagline: listing?.marketplaceTagline ?? null,
      marketplaceShortDesc: listing?.marketplaceShortDesc ?? null,
      marketplaceBanner: listing?.marketplaceBanner ?? null,
      marketplaceCategories: safeJsonStringArray(listing?.marketplaceCategories ?? null),
      marketplaceTags: safeJsonStringArray(listing?.marketplaceTags ?? null),
      marketplaceFeatured: listing?.marketplaceFeatured ?? false,
      marketplaceSortOrder: listing?.marketplaceSortOrder ?? 0,
      acceptsPickup: r.acceptsPickup,
      acceptsDelivery: r.acceptsDelivery,
      lat: r.lat,
      lng: r.lng,
      distanceKm,
      createdAt: r.createdAt,
    });
  }

  // Featured first; then nearest (when located), else manual order; then A→Z.
  out.sort((a, b) => {
    if (a.marketplaceFeatured !== b.marketplaceFeatured) return a.marketplaceFeatured ? -1 : 1;
    if (hasLoc && a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.marketplaceSortOrder !== b.marketplaceSortOrder) return a.marketplaceSortOrder - b.marketplaceSortOrder;
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
  // FREE + INCLUDED (Luigi 2026-07-14): every restaurant is on the marketplace
  // unless it explicitly opted OUT (a listing row with isListed=false). No
  // subscription/entitlement required. A missing listing row = included.
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { isListed: true },
  });
  return listing?.isListed !== false;
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
  // FREE + INCLUDED (Luigi 2026-07-14): every restaurant is on the marketplace
  // for free; only an explicit opt-out (listing row with isListed=false) removes
  // them. Mapped onto the legacy union: "included" → "payg" (admin shows the
  // listing editor), opted-out → "none". The $/plan framing is gone (copy pass).
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { isListed: true },
  });
  return listing?.isListed === false ? "none" : "payg";
}

/** Included on the marketplace unless explicitly opted out. Free for everyone. */
export async function isMarketplaceIncluded(restaurantId: string): Promise<boolean> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { isListed: true },
  });
  return listing?.isListed !== false;
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
 * Idempotency: this function is wrapped in a transaction that ALSO
 * flips Order.marketplaceCounterApplied from false → true. If the
 * order is already flagged true the whole transaction is a no-op,
 * so duplicate calls don't double-count.
 *
 * Called from the order POST AFTER the Order row is created.
 */
export async function recordMarketplaceOrder(args: {
  orderId: string;
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

  await prisma.$transaction(async (tx) => {
    // Atomic claim: only proceed if the order hasn't already been counted.
    // If updateMany returns count=0 it means another invocation got here
    // first (or the order doesn't exist) — either way we no-op.
    const claimed = await tx.order.updateMany({
      where: { id: args.orderId, marketplaceCounterApplied: false },
      data: { marketplaceCounterApplied: true },
    });
    if (claimed.count === 0) return;

    await tx.marketplaceListing.update({
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
  });
}

/**
 * Reverse a previous recordMarketplaceOrder — decrement currentMonthOrders
 * and currentMonthRevenue by this order's contribution. Called from the
 * reject/cancel paths so a restaurant isn't billed for an order it
 * never fulfilled.
 *
 * Idempotency: we atomically clear Order.marketplaceCounterApplied from
 * true → false. If it's already false (already decremented, or never
 * recorded) the decrement is skipped — calling this multiple times on
 * the same order is safe.
 *
 * Note on lifetimeSavingsVsUberEatsCents: we do NOT roll that back. The
 * savings number represents what the customer would have paid in
 * commission to UberEats — it's a "what could have been" metric, not a
 * billing input. A rejected order still represents a moment where we
 * saved the restaurant from a 30% kickback; reversing it would
 * understate our value prop in reports.
 */
export async function unrecordMarketplaceOrder(args: {
  orderId: string;
  restaurantId: string;
  orderTotalCents: number;
}): Promise<void> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId: args.restaurantId },
    select: { id: true, currentMonthOrders: true, currentMonthRevenue: true },
  });
  if (!listing) return; // nothing to decrement against

  await prisma.$transaction(async (tx) => {
    // Atomic release: only decrement if the flag is currently true. Same
    // pattern as record — updateMany returns count=0 if nothing to do.
    const released = await tx.order.updateMany({
      where: { id: args.orderId, marketplaceCounterApplied: true },
      data: { marketplaceCounterApplied: false },
    });
    if (released.count === 0) return;

    // Floor at zero. If we somehow got out of sync (e.g. a manual DB
    // edit) we don't want to go negative on counters.
    const revenueDecrement = args.orderTotalCents / 100;
    await tx.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        currentMonthOrders: {
          decrement: listing.currentMonthOrders > 0 ? 1 : 0,
        },
        currentMonthRevenue: {
          decrement: Math.min(listing.currentMonthRevenue, revenueDecrement),
        },
      },
    });
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
