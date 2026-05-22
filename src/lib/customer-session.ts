/**
 * Customer-account session helpers — auth for end customers ordering
 * from the marketplace, separate from the restaurant-staff NextAuth
 * flow.
 *
 * Why a separate auth system from NextAuth:
 *   - Customer accounts are marketplace-wide identities (one email →
 *     one identity, across every restaurant they order from)
 *   - Restaurant-staff accounts (restaurant_admin, kitchen_staff,
 *     superadmin, reseller_partner) are NextAuth-managed and roam
 *     /admin, /kitchen, /superadmin, /reseller
 *   - The two flows run on different cookies so a customer logged in
 *     for ordering and a staff member logged in for the admin panel
 *     can co-exist in the same browser without stepping on each other
 *   - Customer auth lives on the customer-facing surfaces:
 *     feefreefood.com, /order/<slug>, /signup, /login, /account
 *
 * Mechanics:
 *   - Cookie: `ff_customer` (httpOnly, sameSite=lax, secure in prod)
 *   - Payload: JWT signed with NEXTAUTH_SECRET (reused so we don't add
 *     yet another secret to manage)
 *   - 30-day rolling expiry — refresh on every successful API call by
 *     re-issuing the cookie
 */

import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import prisma from "@/lib/db";

const COOKIE_NAME = "ff_customer";
const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

type CustomerJwtPayload = {
  customerAccountId: string;
  email: string;
};

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET must be set for customer session signing");
  return s;
}

export function signCustomerToken(payload: CustomerJwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: COOKIE_MAX_AGE_SEC });
}

export function verifyCustomerToken(token: string): CustomerJwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as CustomerJwtPayload;
    if (!decoded.customerAccountId || !decoded.email) return null;
    return { customerAccountId: decoded.customerAccountId, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * Read the customer cookie and load the matching CustomerAccount row.
 * Returns null when no cookie OR token invalid OR account deleted.
 * Used by every customer-facing API route + by /account pages.
 */
export async function getCurrentCustomer(): Promise<{
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyCustomerToken(token);
  if (!payload) return null;
  const account = await prisma.customerAccount.findUnique({
    where: { id: payload.customerAccountId },
    select: { id: true, email: true, name: true, phone: true, emailVerifiedAt: true },
  });
  return account;
}

/** Build the Set-Cookie params for the customer session cookie. */
export function customerCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  };
}

export const CUSTOMER_COOKIE_NAME = COOKIE_NAME;
