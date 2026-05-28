/**
 * POST /api/restaurants/[slug]/account/login
 *
 * Per-restaurant customer login. Looks up the Customer row by
 * (restaurantId, email), verifies passwordHash, and issues the
 * `ff_rest_account` session cookie.
 *
 * Multi-location: a customer signed up at one location of a chain
 * has a Customer row at EVERY chain location (replicated at signup —
 * see /api/restaurants/[slug]/account/signup). So a login at any
 * sibling location just looks up by (this restaurant id, email) and
 * works without special-casing.
 *
 * Body: { email, password }
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import {
  signRestaurantCustomerToken,
  restaurantCustomerCookieOptions,
} from "@/lib/restaurant-customer-session";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { restaurantId: restaurant.id, email, passwordHash: { not: null } },
    select: {
      id: true, restaurantId: true, name: true, email: true, phone: true,
      passwordHash: true, emailVerifiedAt: true,
    },
  });
  // Constant-ish-time comparison: even when the customer doesn't exist
  // we still run a dummy bcrypt.compare against a static hash. Stops
  // login-form timing attacks from leaking which emails have accounts.
  // (Not strictly constant-time across the whole handler, but takes the
  // hash-comparison difference out of the equation — the biggest signal.)
  const DUMMY_HASH = "$2b$10$0000000000000000000000000000000000000000000000000000";
  const hashToCheck = customer?.passwordHash ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hashToCheck);

  if (!customer || !ok) {
    return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
  }

  // Bump lastLoginAt for analytics; fire-and-forget.
  prisma.customer
    .update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } })
    .catch((e) => console.error("[restaurant-account login] lastLoginAt update failed", e));

  const token = signRestaurantCustomerToken({
    customerId: customer.id,
    restaurantId: restaurant.id,
  });
  const cookieStore = await cookies();
  cookieStore.set({
    ...restaurantCustomerCookieOptions(),
    value: token,
  });

  return NextResponse.json({
    ok: true,
    customer: {
      id: customer.id,
      restaurantId: restaurant.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      emailVerifiedAt: customer.emailVerifiedAt,
    },
  });
}
