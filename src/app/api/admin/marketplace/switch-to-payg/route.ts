/**
 * POST /api/admin/marketplace/switch-to-payg
 *
 * Switch a restaurant FROM the Monthly Unlimited plan ($199.99/mo) TO
 * Pay-As-You-Go ($3/order, capped at $249.99/mo). Two-step transition:
 *
 *   1. NOW    — set the Monthly Stripe subscription's
 *               cancel_at_period_end = true (keeps benefits until cycle
 *               ends; no proration headaches). Also set
 *               MarketplaceListing.switchToPaygOnCancel = true so the
 *               eventual subscription-deleted webhook knows to keep
 *               the listing online + flip to PAYG mode.
 *
 *   2. AT PERIOD END — Stripe fires customer.subscription.deleted; the
 *               handler in src/lib/stripe/events/subscription.ts reads
 *               the flag, preserves isListed=true, sets billingMode="payg",
 *               and resets the flag. PAYG settlement takes over.
 *
 * DELETE /api/admin/marketplace/switch-to-payg
 *
 * Undo a pending switch — sets cancel_at_period_end = false on the Stripe
 * subscription AND clears the local flag. Restaurant stays on Monthly.
 *
 * Both methods are restaurant-scoped (session.restaurantId derives the
 * target). No need for superadmin override; reseller impersonation works
 * normally via getSessionUser.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getStripe, stripeReady } from "@/lib/stripe";

const MARKETPLACE_ADDON_SLUG = "marketplace";

export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await stripeReady())) {
    return NextResponse.json(
      { error: "Stripe not configured on the platform — can't schedule the switch." },
      { status: 503 },
    );
  }

  // Resolve the marketplace add-on subscription for this restaurant.
  const marketplaceAddOn = await prisma.addOn.findUnique({
    where: { slug: MARKETPLACE_ADDON_SLUG },
    select: { id: true },
  });
  if (!marketplaceAddOn) {
    return NextResponse.json(
      { error: "Marketplace add-on not configured." },
      { status: 500 },
    );
  }

  const sub = await prisma.restaurantAddOn.findUnique({
    where: {
      restaurantId_addOnId: {
        restaurantId,
        addOnId: marketplaceAddOn.id,
      },
    },
    select: {
      status: true,
      stripeSubscriptionId: true,
      currentPeriodEnd: true,
    },
  });

  if (!sub || sub.status !== "active" && sub.status !== "trialing") {
    return NextResponse.json(
      { error: "You're not currently on the Monthly marketplace plan." },
      { status: 400 },
    );
  }
  if (!sub.stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No Stripe subscription on file for the marketplace add-on." },
      { status: 500 },
    );
  }

  // Tell Stripe to stop renewing at the end of the current period.
  // The subscription stays ACTIVE until then — full Monthly benefits
  // continue (unlimited orders, Driver Pool bundled). At period end
  // Stripe fires subscription.deleted; our webhook handles the switch.
  try {
    const stripe = await getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (e) {
    console.error("[switch-to-payg] Stripe update failed:", e);
    return NextResponse.json(
      { error: "Couldn't schedule the switch with Stripe. Try again or contact support." },
      { status: 502 },
    );
  }

  // Mirror state locally so the admin UI immediately reflects the
  // scheduled switch and the webhook has the flag set.
  await prisma.restaurantAddOn.update({
    where: {
      restaurantId_addOnId: {
        restaurantId,
        addOnId: marketplaceAddOn.id,
      },
    },
    data: { cancelAtPeriodEnd: true },
  });
  await prisma.marketplaceListing.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      billingMode: "monthly", // still on monthly until period end
      switchToPaygOnCancel: true,
    },
    update: { switchToPaygOnCancel: true },
  });

  return NextResponse.json({
    ok: true,
    switchAt: sub.currentPeriodEnd ?? null,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await stripeReady())) {
    return NextResponse.json(
      { error: "Stripe not configured on the platform." },
      { status: 503 },
    );
  }

  const marketplaceAddOn = await prisma.addOn.findUnique({
    where: { slug: MARKETPLACE_ADDON_SLUG },
    select: { id: true },
  });
  if (!marketplaceAddOn) {
    return NextResponse.json({ error: "Marketplace add-on not configured." }, { status: 500 });
  }

  const sub = await prisma.restaurantAddOn.findUnique({
    where: {
      restaurantId_addOnId: { restaurantId, addOnId: marketplaceAddOn.id },
    },
    select: { stripeSubscriptionId: true },
  });
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No Stripe subscription on file." }, { status: 400 });
  }

  try {
    const stripe = await getStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (e) {
    console.error("[switch-to-payg DELETE] Stripe update failed:", e);
    return NextResponse.json(
      { error: "Couldn't undo the switch with Stripe. Try again or contact support." },
      { status: 502 },
    );
  }

  await prisma.restaurantAddOn.update({
    where: {
      restaurantId_addOnId: { restaurantId, addOnId: marketplaceAddOn.id },
    },
    data: { cancelAtPeriodEnd: false },
  });
  await prisma.marketplaceListing.updateMany({
    where: { restaurantId },
    data: { switchToPaygOnCancel: false },
  });

  return NextResponse.json({ ok: true });
}
