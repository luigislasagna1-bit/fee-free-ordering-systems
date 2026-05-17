import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getStripe, stripeReady } from "@/lib/stripe";

/**
 * Switch the restaurant to a different SubscriptionPlan. If there's an active
 * Stripe subscription, swap the price item with proration; otherwise update
 * the local plan pointer and let the next checkout/portal flow pick it up.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { planId } = await req.json().catch(() => ({}));
  if (!planId) {
    return NextResponse.json({ error: "Missing planId" }, { status: 400 });
  }

  const [restaurant, plan] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
  ]);
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (!plan || !plan.isActive) return NextResponse.json({ error: "Plan not available" }, { status: 400 });

  // No active Stripe subscription yet — just update the local pointer.
  if (!restaurant.stripeSubscriptionId || !(await stripeReady())) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { subscriptionPlanId: plan.id },
    });
    return NextResponse.json({ ok: true, mode: "local" });
  }

  if (!plan.stripePriceId) {
    return NextResponse.json(
      { error: "Selected plan is not synced to Stripe yet." },
      { status: 400 }
    );
  }

  const stripe = await getStripe();
  const sub = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId);
  const currentItem = sub.items.data[0];
  if (!currentItem) {
    return NextResponse.json({ error: "Subscription has no line items" }, { status: 500 });
  }

  await stripe.subscriptions.update(restaurant.stripeSubscriptionId, {
    items: [{ id: currentItem.id, price: plan.stripePriceId }],
    proration_behavior: "create_prorations",
  });

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { subscriptionPlanId: plan.id },
  });

  return NextResponse.json({ ok: true, mode: "stripe" });
}
