import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { getStripe, stripeReady } from "@/lib/stripe";

/**
 * POST { addOnSlug } — undo a scheduled cancellation.
 *
 * The mirror of /api/admin/add-ons/cancel. When the owner clicks "Keep
 * this service" before currentPeriodEnd hits, we flip cancel_at_period_end
 * back to false on Stripe and on our local row. Subscription continues
 * billing on its normal schedule.
 *
 * Idempotent: calling resume on a sub that isn't scheduled to cancel is a
 * no-op success — the owner already has what they want.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);
  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({} as any));
  const slug = String(body?.addOnSlug || "").trim();
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

  const addOn = await prisma.addOn.findUnique({ where: { slug } });
  if (!addOn) return NextResponse.json({ error: "addon_not_found" }, { status: 404 });

  const row = await prisma.restaurantAddOn.findUnique({
    where: {
      restaurantId_addOnId: { restaurantId: user.restaurantId, addOnId: addOn.id },
    },
  });
  if (!row || !row.stripeSubscriptionId) {
    return NextResponse.json({ error: "not_subscribed" }, { status: 404 });
  }
  if (!row.cancelAtPeriodEnd) {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }

  const stripe = await getStripe();
  await stripe.subscriptions.update(row.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
  await prisma.restaurantAddOn.update({
    where: { id: row.id },
    data: { cancelAtPeriodEnd: false },
  });
  return NextResponse.json({ ok: true });
}
