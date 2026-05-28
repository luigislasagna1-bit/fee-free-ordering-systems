/**
 * GET /api/restaurants/[slug]/account/me
 *
 * Returns the currently-logged-in per-restaurant customer at this
 * restaurant. Used by the /order/[slug]/account dashboard + checkout
 * page to populate name/email/phone and decide whether to show
 * "Sign in" vs "Hello, <name>" in the header.
 *
 * Returns 200 { customer: null } when not logged in (NOT 401) — the
 * customer-facing page treats "not signed in" as a normal state, not
 * an error.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ customer: null });

  const customer = await getCurrentRestaurantCustomer({
    expectedRestaurantId: restaurant.id,
  });
  return NextResponse.json({ customer });
}
