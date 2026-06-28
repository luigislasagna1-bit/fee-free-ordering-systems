/**
 * POST /api/restaurants/[slug]/account/signup
 *
 * Creates a per-restaurant Customer account (separate from the
 * marketplace-wide CustomerAccount system at /api/customer/signup).
 *
 * Two flows depending on the customer's prior history at this restaurant:
 *
 *   - First-time customer → CREATE a new Customer row with passwordHash +
 *     emailVerifyToken + a fresh chainCustomerId. If the restaurant is
 *     part of a multi-location chain, replicate the row to every sibling
 *     location sharing the same chainCustomerId + passwordHash so one
 *     set of creds authenticates at any location.
 *
 *   - Existing guest-order customer (Customer row exists with same email
 *     but no passwordHash) → ATTACH a passwordHash + chainCustomerId to
 *     the existing row, preserving their order history. Also propagate
 *     to siblings via the same chain logic.
 *
 *   - Existing account at this restaurant (passwordHash != null) → 409.
 *     The customer can sign in instead.
 *
 * Body: { email, password, name?, phone? }
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import {
  signRestaurantCustomerToken,
  restaurantCustomerCookieOptions,
  getChainRestaurantIds,
} from "@/lib/restaurant-customer-session";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, parentRestaurantId: true, isActive: true, rewardsEnabled: true, rewardSignupBonus: true },
  });
  if (!restaurant || !restaurant.isActive) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  let body: { email?: string; password?: string; name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const name = body.name?.trim() || "";
  const phone = body.phone?.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Resolve the chain (this restaurant + all sibling chain locations).
  // We replicate the new account to every location so one login works
  // anywhere in the chain. Single-restaurant: just this one ID.
  const chainIds = await getChainRestaurantIds(restaurant.id);

  // Look for an existing account at ANY location in the chain with this
  // email + non-null passwordHash. If found, the customer already has an
  // account — point them at sign in.
  const existingAccount = await prisma.customer.findFirst({
    where: {
      restaurantId: { in: chainIds },
      email,
      passwordHash: { not: null },
    },
    select: { id: true },
  });
  if (existingAccount) {
    return NextResponse.json(
      { error: "An account with that email already exists for this restaurant. Try signing in." },
      { status: 409 },
    );
  }

  // Phone uniqueness (Luigi 2026-06-27): a phone number may belong to only ONE
  // account, so it can't be reused to spin up duplicate accounts (and so VIP
  // specials stay tied to a single person). Guests (no passwordHash) may still
  // share a phone. Matched on the exact entered number; (restaurantId, phone) is
  // indexed. NOTE: doesn't catch format variants ("(905) 385-4444" vs digits) —
  // a normalized phone column would; tracked in TODO.
  if (phone) {
    const phoneTaken = await prisma.customer.findFirst({
      where: { restaurantId: { in: chainIds }, phone, passwordHash: { not: null } },
      select: { id: true },
    });
    if (phoneTaken) {
      return NextResponse.json(
        { error: "An account with that phone number already exists for this restaurant. Try signing in." },
        { status: 409 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const emailVerifyToken = crypto.randomBytes(32).toString("base64url");
  const chainCustomerId = crypto.randomBytes(16).toString("base64url");

  // For each restaurant in the chain, find-or-create a Customer row.
  // Existing guest-order rows (same email, no passwordHash) get hydrated
  // with credentials in place, preserving their order history. Restaurants
  // with no prior row get a fresh Customer.
  //
  // We can't use a single prisma.upsert because (restaurantId, email)
  // isn't a unique constraint (email is nullable + non-unique on
  // Customer). Per-location find→update-or-create is the only safe
  // shape. The pre-flight chain-wide "existing account" check above
  // catches the race-free case; a true race (two simultaneous signups
  // with the same email at the same restaurant) would resolve with one
  // winning + the other hitting the conflict_chain_existing throw below.
  const customers = await Promise.all(
    chainIds.map(async (rid) => {
      const existing = await prisma.customer.findFirst({
        where: { restaurantId: rid, email },
        select: { id: true, passwordHash: true },
      });
      if (existing) {
        // Hydrate guest-order row with credentials. Don't clobber a
        // passwordHash if one somehow exists — the existing-account
        // check above should have caught that, but defense in depth.
        if (existing.passwordHash) {
          throw new Error("conflict_chain_existing");
        }
        return prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: name,
            phone: phone ?? undefined,
            passwordHash,
            chainCustomerId,
            emailVerifyToken,
            lastLoginAt: new Date(),
          },
          select: { id: true, restaurantId: true },
        });
      }
      return prisma.customer.create({
        data: {
          restaurantId: rid,
          email,
          name,
          phone,
          passwordHash,
          chainCustomerId,
          emailVerifyToken,
          lastLoginAt: new Date(),
        },
        select: { id: true, restaurantId: true },
      });
    }),
  ).catch((e: unknown) => {
    if (e instanceof Error && e.message === "conflict_chain_existing") {
      return null;
    }
    throw e;
  });

  if (!customers) {
    return NextResponse.json(
      { error: "An account with that email already exists for this restaurant. Try signing in." },
      { status: 409 },
    );
  }

  // Find the Customer row at the requesting restaurant — that's the one
  // we'll set the session cookie for.
  const here = customers.find((c) => c.restaurantId === restaurant.id);
  if (!here) {
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }

  // Reward Dollars sign-up bonus — credit the new account once. Idempotent via
  // the synthetic "signup:<customerId>" ledger key (so a retried signup never
  // double-grants). Never blocks signup. Luigi 2026-06-27.
  if (restaurant.rewardsEnabled && (restaurant.rewardSignupBonus ?? 0) > 0) {
    try {
      const { grant } = await import("@/lib/reward-ledger");
      await grant({
        restaurantId: restaurant.id,
        customerId: here.id,
        amount: restaurant.rewardSignupBonus,
        reason: "signup_bonus",
        orderId: `signup:${here.id}`,
      });
    } catch (e) { console.error("[signup reward bonus]", e); }
  }
  // Time-bounded signup CAMPAIGNS (configurable earn rules) — additive to the
  // flat bonus above; idempotent per customer. Luigi 2026-06-27.
  if (restaurant.rewardsEnabled) {
    try {
      const { grantSignupRules } = await import("@/lib/reward-earn");
      await grantSignupRules({ restaurantId: restaurant.id, customerId: here.id, rewardsEnabled: true });
    } catch (e) { console.error("[signup reward rules]", e); }
  }

  // Fire-and-forget verification email. Signup completes regardless of
  // mail-delivery success — customers can request a resend later.
  // (Reuse the generic sendVerifyEmail from src/lib/email.ts? It's
  // currently shaped for the marketplace account flow — different URL.
  // For now we skip the email to avoid coupling; can be added in a
  // follow-up commit once an email template specific to per-restaurant
  // accounts is built. Account works immediately without verification.)
  void emailVerifyToken;

  // Issue session cookie.
  const token = signRestaurantCustomerToken({ customerId: here.id, restaurantId: restaurant.id });
  const cookieStore = await cookies();
  cookieStore.set({
    ...restaurantCustomerCookieOptions(),
    value: token,
  });

  return NextResponse.json({
    ok: true,
    customer: {
      id: here.id,
      restaurantId: restaurant.id,
      name,
      email,
      phone,
      emailVerifiedAt: null,
    },
  });
}
