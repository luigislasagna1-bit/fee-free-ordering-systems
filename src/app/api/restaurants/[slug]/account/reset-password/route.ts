/**
 * POST /api/restaurants/[slug]/account/reset-password
 *
 * Consumes a per-restaurant password-reset token issued by the
 * forgot-password endpoint and sets a new password on the Customer
 * row. Once consumed the token is burned (cleared from the row) so a
 * reset email can't be replayed.
 *
 * Multi-location chains: if the Customer being reset has a
 * chainCustomerId, we update passwordHash on EVERY Customer row in the
 * chain so the new password works at every location — same pattern as
 * the signup endpoint replicates rows across the chain.
 *
 * Body: { token, password }
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

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token || "").trim();
  const password = body.password || "";

  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: {
      restaurantId: restaurant.id,
      passwordResetToken: token,
      passwordResetExpiresAt: { gt: new Date() },
    },
    select: { id: true, restaurantId: true, name: true, email: true, phone: true, chainCustomerId: true },
  });
  if (!customer) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Multi-location replication. When the customer is part of a chain,
  // every chain location's Customer row shares the same chainCustomerId
  // — propagate the password change to all of them so the customer can
  // log in at any sibling location with the new password. Same pattern
  // used at signup.
  if (customer.chainCustomerId) {
    await prisma.customer.updateMany({
      where: { chainCustomerId: customer.chainCustomerId },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
  } else {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
  }

  // Auto-sign-in: issue the same session cookie the login endpoint
  // issues so the customer lands on /account already signed in. UX
  // parity with Toast/Uber/DoorDash — they don't bounce you back to
  // the login form after a successful reset.
  const sessionToken = signRestaurantCustomerToken({
    customerId: customer.id,
    restaurantId: restaurant.id,
  });
  const cookieStore = await cookies();
  cookieStore.set({ ...restaurantCustomerCookieOptions(), value: sessionToken });

  return NextResponse.json({
    ok: true,
    customer: {
      id: customer.id,
      restaurantId: customer.restaurantId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
  });
}
