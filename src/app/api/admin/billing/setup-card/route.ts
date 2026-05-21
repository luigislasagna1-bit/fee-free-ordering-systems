import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { getStripe, stripeReady } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";

/**
 * POST /api/admin/billing/setup-card
 *
 * Starts a Stripe Checkout session in `mode: "setup"` to collect a
 * payment method without charging the customer. The collected card is
 * attached to the restaurant's Stripe Customer AND set as the default
 * for future invoices (via setup_intent_data.metadata + a webhook
 * fallback).
 *
 * Used by the PAYG marketplace opt-in flow — restaurants must have a
 * card on file before they can accrue per-order fees, otherwise the
 * monthly settlement invoice has no way to auto-charge.
 *
 * Body (optional): { returnPath: string } — where Stripe sends the
 * user after success / cancel. Defaults to /admin/marketplace.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({} as any));
  // Whitelist the returnPath to in-app routes so this can't be abused
  // for an open-redirect after Stripe completes the setup.
  const safeReturnPath = typeof body?.returnPath === "string" && body.returnPath.startsWith("/admin/")
    ? body.returnPath
    : "/admin/marketplace";

  const customerId = await ensureStripeCustomerForRestaurant(user.restaurantId);
  const stripe = await getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "setup",
    // No line_items in setup mode — purely collects a payment method.
    payment_method_types: ["card"],
    // Set the collected card as the customer's default for future
    // invoices. The setup_intent webhook is the source of truth, but
    // attaching here lets us redirect immediately on success without
    // waiting for webhook arrival.
    setup_intent_data: {
      metadata: {
        restaurantId: user.restaurantId,
        purpose: "marketplace_payg_default_card",
      },
    },
    success_url: `${baseUrl}${safeReturnPath}?card_saved=1`,
    cancel_url: `${baseUrl}${safeReturnPath}`,
  });

  return NextResponse.json({ url: session.url });
}
