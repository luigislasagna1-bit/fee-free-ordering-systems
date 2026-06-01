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
import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import {
  signRestaurantCustomerToken,
  restaurantCustomerCookieOptions,
} from "@/lib/restaurant-customer-session";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, isActive: true, name: true, defaultLanguage: true },
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

  // Look up by email only — we need to distinguish "no record at all"
  // (generic "wrong creds" message) from "guest record exists but no
  // password set yet" (friendly "set your password" flow). Filtering
  // by passwordHash here would conflate the two cases. Luigi audit
  // 2026-06-01: customers who ordered as guests were hitting a
  // dead-end at login because the UI couldn't tell them what state
  // they were in.
  const customer = await prisma.customer.findFirst({
    where: { restaurantId: restaurant.id, email },
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

  // Friendly-path: guest-order customer trying to log in. We know their
  // email (they ordered before) but they never set a password. Fire a
  // set-password email automatically and return a structured response
  // the form can render as a friendly info banner. Same UX Toast / Uber
  // / Skip use to convert guests into account-holders.
  if (customer && !customer.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1 hour
    try {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
      });
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
      const resetUrl = `${baseUrl}/order/${slug}/account/reset-password?token=${token}`;
      await sendPasswordResetEmail({
        to: customer.email ?? email,
        name: customer.name,
        resetUrl,
        locale: restaurant.defaultLanguage || "en",
      });
    } catch (e) {
      // Don't block the friendly response on email-send failure —
      // we still want to tell the user "we see you, set up here".
      console.error("[restaurant-account login → needs_password_setup email]", e);
    }
    return NextResponse.json(
      {
        code: "needs_password_setup",
        message: `Looks like you've ordered from ${restaurant.name} before but haven't set a password yet. We just emailed you a link to set one — check your inbox (and spam folder).`,
      },
      { status: 409 },
    );
  }

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
