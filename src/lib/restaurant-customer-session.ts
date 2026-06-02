/**
 * Per-restaurant customer session helpers.
 *
 * Distinct from the marketplace-wide `CustomerAccount` flow in
 * src/lib/customer-session.ts:
 *
 *   - Marketplace (`ff_customer` cookie, CustomerAccount row): one identity
 *     across every restaurant on the platform. The customer signs up once at
 *     /signup or feefreefood.com and that one account follows them everywhere.
 *
 *   - Per-restaurant (`ff_rest_account` cookie, Customer row): a separate
 *     account at ONE specific restaurant — the restaurant's own customer
 *     base, completely independent from the marketplace identity. A
 *     customer can have BOTH (a marketplace account + a per-restaurant
 *     account at the same email) without them being linked.
 *
 * Why two systems instead of one:
 *   Restaurants want to OWN their customer relationship. A restaurant's
 *   coupon, loyalty, and email-marketing data is theirs to manage from
 *   /admin/customers — not pooled across the platform. The per-restaurant
 *   account lets a customer "sign up for Luigi's Lasagna" specifically
 *   and Luigi can see + reward them directly.
 *
 *   For multi-location chains the customer's one set of credentials
 *   authenticates at any location in the chain (sibling Customer rows
 *   share a chainCustomerId + passwordHash). See the signup flow in
 *   /api/restaurants/[slug]/account/signup.
 *
 * Mechanics:
 *   - Cookie: `ff_rest_account` (httpOnly, sameSite=lax, secure in prod)
 *   - Payload: JWT { customerId, restaurantId } signed with NEXTAUTH_SECRET
 *   - 30-day rolling expiry
 *   - The cookie is restaurant-scoped via the restaurantId in the JWT —
 *     readers verify that the cookie's restaurantId matches the page's
 *     restaurant context. A customer can be logged in at one restaurant
 *     and a guest at another in the same browser without conflict
 *     (only ONE per-restaurant session is active at a time; logging in
 *     at restaurant B overwrites the cookie). Future enhancement: a
 *     per-restaurant suffix on the cookie name to allow multiple
 *     simultaneous logins. Not needed at launch — a customer ordering
 *     from two restaurants at once is an edge case.
 */

import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const COOKIE_NAME = "ff_rest_account";
const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

type RestaurantCustomerJwtPayload = {
  customerId: string;
  restaurantId: string;
};

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET must be set for restaurant-customer session signing");
  return s;
}

export function signRestaurantCustomerToken(payload: RestaurantCustomerJwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: COOKIE_MAX_AGE_SEC });
}

export function verifyRestaurantCustomerToken(token: string): RestaurantCustomerJwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as RestaurantCustomerJwtPayload;
    if (!decoded.customerId || !decoded.restaurantId) return null;
    return { customerId: decoded.customerId, restaurantId: decoded.restaurantId };
  } catch {
    return null;
  }
}

/**
 * Read the per-restaurant customer cookie and load the matching Customer row.
 * Returns null when no cookie / invalid token / customer not found / mismatched
 * restaurant. The optional `expectedRestaurantId` arg lets callers enforce
 * that the cookie matches the current page's restaurant — pages on /order/
 * [slug] pass their resolved restaurant.id so a cookie from a DIFFERENT
 * restaurant doesn't falsely authenticate.
 */
export async function getCurrentRestaurantCustomer(opts: {
  expectedRestaurantId?: string;
} = {}): Promise<{
  id: string;
  restaurantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  chainCustomerId: string | null;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyRestaurantCustomerToken(token);
  if (!payload) return null;

  // If the caller expects a specific restaurant, the cookie must match
  // OR the customer's chainCustomerId must link to the expected one
  // (multi-location: logged in at parent, browsing a child location).
  if (opts.expectedRestaurantId && payload.restaurantId !== opts.expectedRestaurantId) {
    // Resolve cross-chain via chainCustomerId. The customer's chain row
    // at the expected restaurant gives us the right Customer.id for the
    // page's context — we use THAT id so per-restaurant order history
    // attribution stays correct.
    const cookieCustomer = await prisma.customer.findUnique({
      where: { id: payload.customerId },
      select: { chainCustomerId: true },
    });
    if (!cookieCustomer?.chainCustomerId) return null;
    const chainCustomer = await prisma.customer.findFirst({
      where: {
        chainCustomerId: cookieCustomer.chainCustomerId,
        restaurantId: opts.expectedRestaurantId,
      },
      select: {
        id: true, restaurantId: true, name: true, email: true, phone: true,
        emailVerifiedAt: true, chainCustomerId: true, marketingConsent: true,
      },
    });
    return chainCustomer;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: {
      id: true, restaurantId: true, name: true, email: true, phone: true,
      emailVerifiedAt: true, chainCustomerId: true,
    },
  });
  return customer;
}

/** Build the Set-Cookie params for the per-restaurant session cookie. */
export function restaurantCustomerCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}

export const RESTAURANT_CUSTOMER_COOKIE_NAME = COOKIE_NAME;

/**
 * Resolve the set of restaurant ids that share a "chain" with the given
 * restaurant — the parent (if this one is a child) + all sibling children.
 * Used at signup time to replicate the new Customer row across every
 * location in the chain, so one set of creds authenticates at any
 * location. Always includes the input restaurantId.
 */
export async function getChainRestaurantIds(restaurantId: string): Promise<string[]> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, parentRestaurantId: true },
  });
  if (!r) return [restaurantId];

  // Root of the chain = parent if this row IS a child, else this row itself.
  const rootId = r.parentRestaurantId ?? r.id;

  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: rootId },
    select: { id: true },
  });
  const ids = new Set<string>([rootId, ...children.map((c) => c.id)]);
  return Array.from(ids);
}
