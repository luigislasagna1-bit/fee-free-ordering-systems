import "server-only";
import { cache } from "react";
import prisma from "@/lib/db";

/**
 * Scoping for the cross-restaurant Orders List (partner + superadmin).
 *
 * Two audiences, one feed:
 *   • reseller  — every restaurant carrying their `resellerProfileId`
 *   • platform  — every restaurant (superadmin)
 *
 * DESIGN: we scope with a Prisma RELATION FILTER (`order.restaurant.is`)
 * rather than materialising an id array. Two reasons:
 *   1. Safety — an optional `?restaurant=<id>` is ANDed onto the same filter,
 *      so a tampered id that isn't in the caller's scope simply matches zero
 *      rows. There is no separate validation step to forget.
 *   2. Scale — a superadmin's "all restaurants" scope never has to load
 *      thousands of ids into memory just to build an `IN (…)`.
 * `Restaurant.resellerProfileId` is indexed (@@index([resellerProfileId])).
 */

export type OrdersScope =
  | { kind: "reseller"; resellerProfileId: string }
  | { kind: "platform" };

export type ScopeRestaurant = {
  id: string;
  name: string;
  /** "Company Name" column — the brand a location belongs to. */
  companyName: string;
  /** Second line under the name, e.g. "17 Commercial St. , Milton". */
  address: string;
  currency: string;
  timezone: string | null;
};

/** Hard cap on the restaurant picker. A partner has a handful; a superadmin
 *  could have thousands, and the dropdown is a convenience, not a report. */
const RESTAURANT_PICKER_CAP = 500;

/**
 * The `where.restaurant` fragment for this scope, optionally narrowed to one
 * restaurant. Returns undefined for an unfiltered platform scope so we don't
 * add a pointless join.
 */
export function scopeRestaurantFilter(
  scope: OrdersScope,
  restaurantId?: string | null,
): { resellerProfileId?: string; id?: string } | undefined {
  const f: { resellerProfileId?: string; id?: string } = {};
  if (scope.kind === "reseller") f.resellerProfileId = scope.resellerProfileId;
  if (restaurantId) f.id = restaurantId;
  return Object.keys(f).length > 0 ? f : undefined;
}

/**
 * Restaurants in scope — powers the "Restaurant" dropdown ("All restaurants."
 * + one entry each) and the mixed-currency caveat. Cached per request.
 */
export const listScopeRestaurants = cache(
  async (scope: OrdersScope): Promise<ScopeRestaurant[]> => {
    const rows = await prisma.restaurant.findMany({
      where: scope.kind === "reseller" ? { resellerProfileId: scope.resellerProfileId } : {},
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        currency: true,
        timezone: true,
        parentRestaurant: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: RESTAURANT_PICKER_CAP,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      // A child location shows its brand; a standalone restaurant is its own brand.
      companyName: r.parentRestaurant?.name ?? r.name,
      address: [r.address, r.city].filter(Boolean).join(" , "),
      currency: r.currency,
      timezone: r.timezone ?? null,
    }));
  },
);

/** True when the scope spans more than one currency — the list must then never
 *  sum a Total column, and the UI shows an honest caveat instead. */
export function hasMixedCurrency(restaurants: ScopeRestaurant[]): boolean {
  return new Set(restaurants.map((r) => r.currency.toLowerCase())).size > 1;
}

/**
 * True when at least one restaurant belongs to a brand with a different name —
 * i.e. the "Company Name" column carries information. For a standalone store
 * `companyName === name`, so showing it would print the same string twice in
 * two adjacent columns (which is exactly what Luigi reported, 2026-08-07).
 */
export function hasDistinctCompanies(restaurants: ScopeRestaurant[]): boolean {
  return restaurants.some((r) => r.companyName !== r.name);
}
