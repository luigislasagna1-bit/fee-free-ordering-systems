import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { getStripe, stripeReady } from "@/lib/stripe";

/**
 * Start a Stripe Checkout session for the reseller's white-label
 * subscription. Mirrors /api/admin/billing/checkout's pattern but
 * scoped to ResellerProfile + the two white-label tiers.
 *
 * Body: { tier: "basic" | "full" }
 *
 * Env vars required (set in Vercel for prod, .env.local for dev):
 *   STRIPE_WHITE_LABEL_BASIC_PRICE_ID  — price_xxx (recurring $9.99/mo)
 *   STRIPE_WHITE_LABEL_FULL_PRICE_ID   — price_xxx (recurring $29/mo)
 *
 * Superadmin creates the matching Products + Prices in Stripe Dashboard
 * and pastes their IDs into env vars. We don't auto-create products
 * from code — keeps the production billing setup auditable + manual.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const tier: string = String(body?.tier ?? "");
  if (tier !== "basic" && tier !== "full") {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const priceId =
    tier === "basic"
      ? process.env.STRIPE_WHITE_LABEL_BASIC_PRICE_ID
      : process.env.STRIPE_WHITE_LABEL_FULL_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "White-label pricing not configured yet. The platform admin needs to create the Stripe Product + Price and paste the price ID into env vars.",
      },
      { status: 503 },
    );
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      id: true,
      status: true,
      companyName: true,
      stripeCustomerId: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.status !== "approved") {
    return NextResponse.json({ error: "Your reseller account isn't approved yet" }, { status: 403 });
  }

  const stripe = await getStripe();

  // Lazily create the Stripe Customer the first time the reseller
  // checks out. Same pattern as the restaurant billing endpoint.
  let customerId = profile.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.user.email,
      name: profile.companyName ?? profile.user.name ?? undefined,
      metadata: { resellerProfileId: profile.id },
    });
    customerId = customer.id;
    await prisma.resellerProfile.update({
      where: { id: profile.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Metadata flows through to subscription.created / updated events
    // so the webhook handler knows which ResellerProfile to update.
    subscription_data: {
      metadata: {
        resellerProfileId: profile.id,
        whiteLabelTier: tier,
      },
    },
    metadata: {
      resellerProfileId: profile.id,
      whiteLabelTier: tier,
    },
    success_url: `${baseUrl}/reseller/branding?subscribed=1`,
    cancel_url: `${baseUrl}/reseller/branding`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
