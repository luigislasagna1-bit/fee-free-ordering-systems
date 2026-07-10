import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getStripe, stripeReady } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";
import { euVatSubscriptionBlock } from "@/lib/vies";

/**
 * Start a Stripe Checkout session to attach a payment method and begin a
 * subscription. Used during trial conversion + when reactivating from a
 * cancelled/past-due state.
 *
 * Body: { planId?: string } — defaults to the restaurant's current plan.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  // Launch tax policy "Option A" (Luigi 2026-07-03): EU restaurants need a
  // VIES-validated VAT number before starting a paid plan — see lib/vies.ts.
  const euBlock = await euVatSubscriptionBlock(user.restaurantId);
  if (euBlock) {
    return NextResponse.json(
      {
        error: "EU businesses need a VIES-registered VAT number before subscribing. Add it under Billing → Fiscal details, then try again.",
        code: euBlock.code,
        blockerHref: "/admin/billing",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const planId: string | undefined = body?.planId;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    include: { subscriptionPlan: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const plan = planId
    ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } })
    : restaurant.subscriptionPlan;
  if (!plan || !plan.stripePriceId) {
    return NextResponse.json(
      { error: "Selected plan is not synced to Stripe yet. Ask the platform admin to sync it." },
      { status: 400 }
    );
  }

  const stripe = await getStripe();

  // Resolve (or lazily create) the Stripe Customer via the shared helper —
  // it also self-heals ids minted on a different Stripe account/mode (the
  // platform test→live switch left stale ids that live Checkout rejects).
  const customerId = await ensureStripeCustomerForRestaurant(restaurant.id);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    // No trial. Every restaurant is on the FREE plan by default — when
    // they upgrade through Checkout, billing starts immediately.
    success_url: `${baseUrl}/admin/billing?success=1`,
    cancel_url: `${baseUrl}/admin/billing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
