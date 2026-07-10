import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getStripe, stripeReady } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";

/**
 * Open the Stripe-hosted Customer Portal so the restaurant owner can manage
 * their card, view invoices, switch plans, or cancel — without us having to
 * build any of that UI ourselves.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { stripeCustomerId: true },
  });
  if (!restaurant?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Start a subscription first." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const stripe = await getStripe();
  // Self-heals ids minted on a different Stripe account/mode (test→live
  // switch) — a stale id makes billingPortal.sessions.create throw.
  const customerId = await ensureStripeCustomerForRestaurant(user.restaurantId);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/admin/billing`,
  });

  return NextResponse.json({ url: session.url });
}
