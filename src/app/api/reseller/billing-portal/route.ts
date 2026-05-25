import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { getStripe, stripeReady } from "@/lib/stripe";

/**
 * Create a Stripe Customer Portal session and return the redirect URL.
 * Lets resellers update their payment method, view invoices, cancel,
 * resume, or change the tier — all the post-checkout self-service that
 * Stripe handles natively. We just hand them the door.
 *
 * Pre-req: the reseller already has a Stripe Customer (created lazily
 * when they first hit /api/reseller/subscribe). If they've never started
 * Checkout, there's no customer to manage — we return 400 and the UI
 * should show the Subscribe flow instead.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true, stripeCustomerId: true },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Your reseller account isn't approved yet" }, { status: 403 });
  }
  if (!profile.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account yet — subscribe first to set one up" },
      { status: 400 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${baseUrl}/reseller/branding`,
  });

  return NextResponse.json({ url: session.url });
}
