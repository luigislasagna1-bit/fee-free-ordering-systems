import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { checkoutSessionExpiresAt, getStripe, stripeReady } from "@/lib/stripe";
import { ensureResellerGenericSubdomain } from "@/lib/reseller-subdomain";

/**
 * Start a Stripe Checkout session for the reseller's white-label
 * subscription. Mirrors /api/admin/billing/checkout's pattern but
 * scoped to ResellerProfile + the single white-label tier.
 *
 * There is ONE paid tier — "Branded" ($19.99/mo). The legacy Basic
 * tier is gone. The body may carry a `tier` field for backwards
 * compatibility but it's ignored; every checkout uses the Branded price.
 *
 * Env vars required (set in Vercel for prod, .env.local for dev):
 *   STRIPE_WHITE_LABEL_FULL_PRICE_ID   — price_xxx (recurring $19.99/mo, "Branded")
 *
 * Superadmin creates the matching Product + Price in Stripe Dashboard
 * and pastes its ID into the env var. We don't auto-create products
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

  // Single paid tier. We still parse the body for backwards compatibility
  // but ignore whatever `tier` it carries — there is only "Branded" now,
  // tracked internally as "full".
  await req.json().catch(() => ({}));
  const tier = "full";

  const priceId = process.env.STRIPE_WHITE_LABEL_FULL_PRICE_ID;
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
      whiteLabelStatus: true,
      whiteLabelTier: true,
      whiteLabelStripeSubscriptionId: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.status !== "approved") {
    return NextResponse.json({ error: "Your reseller account isn't approved yet" }, { status: 403 });
  }

  const stripe = await getStripe();

  // ── TIER CHANGE (upgrade or downgrade) ─────────────────────────────
  // If the reseller already has an active subscription, don't create a
  // SECOND one — that double-charges them. Instead, swap the existing
  // subscription's price item to the new tier, with proration so they
  // get credited for unused time on the old tier + charged the diff
  // immediately. Stripe handles the math.
  if (
    profile.whiteLabelStripeSubscriptionId &&
    profile.whiteLabelStatus === "active" &&
    profile.whiteLabelTier !== tier
  ) {
    try {
      const existing = await stripe.subscriptions.retrieve(profile.whiteLabelStripeSubscriptionId);
      const firstItem = existing.items.data[0];
      if (!firstItem) {
        return NextResponse.json({ error: "Existing subscription has no items" }, { status: 500 });
      }
      await stripe.subscriptions.update(profile.whiteLabelStripeSubscriptionId, {
        items: [{ id: firstItem.id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: {
          resellerProfileId: profile.id,
          whiteLabelTier: tier,
        },
      });
      // Webhook (customer.subscription.updated) will set
      // whiteLabelTier=new tier on the profile via the existing
      // handleResellerWhiteLabelEvent path.
      // Backfill a generic subdomain for already-active resellers who never
      // got one (e.g. activated before auto-provisioning shipped). Idempotent
      // + best-effort — never blocks the tier swap. New activations get theirs
      // from the webhook's activation hook.
      await ensureResellerGenericSubdomain(profile.id).catch(() => {});
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      return NextResponse.json({
        url: `${baseUrl}/reseller/branding?upgraded=1`,
        swapped: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reseller-subscribe] tier swap failed", { err: msg });
      return NextResponse.json({ error: `Could not change tier: ${msg}` }, { status: 500 });
    }
  }

  // If they're trying to subscribe to the tier they already have,
  // bounce them back without creating anything.
  if (profile.whiteLabelStatus === "active" && profile.whiteLabelTier === tier) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.json({
      url: `${baseUrl}/reseller/branding`,
      noop: true,
    });
  }

  // Lazily create the Stripe Customer the first time the reseller
  // checks out. Same pattern as the restaurant billing endpoint.
  // A stored id minted on a different Stripe account/mode (platform
  // test→live switch, 2026-07-10) is unusable — verify it exists here and
  // fall through to create a fresh one if not.
  let customerId = profile.stripeCustomerId;
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if (("deleted" in existing) && existing.deleted) customerId = null;
    } catch (e: any) {
      if (e?.code === "resource_missing" || e?.raw?.code === "resource_missing" || e?.statusCode === 404) customerId = null;
      // other errors: keep the id — transient failures must not churn customers
    }
  }
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
    // No trial — Branded bills immediately on day 1.
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
    // Short fuse (Stripe default is 24h): two open sessions can BOTH be
    // completed → duplicate live white-label subscriptions.
    expires_at: checkoutSessionExpiresAt(),
  });

  return NextResponse.json({ url: session.url });
}
