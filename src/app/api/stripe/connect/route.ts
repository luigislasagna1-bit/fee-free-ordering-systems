// POST /api/stripe/connect — create account + return onboarding link
// DELETE /api/stripe/connect — disconnect account
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createConnectAccount, createConnectOnboardingLink, STRIPE_ENABLED } from "@/lib/stripe";
import prisma from "@/lib/db";

export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!STRIPE_ENABLED) {
    return NextResponse.json({
      error: "Stripe is not enabled. Set STRIPE_ENABLED=true and STRIPE_SECRET_KEY in your .env file.",
      setupRequired: true,
    }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  let accountId = restaurant.stripeAccountId;

  // Create a new connected account if not exists
  if (!accountId) {
    const result = await createConnectAccount({
      email: restaurant.email || undefined,
      restaurantName: restaurant.name,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
    accountId = result.accountId;
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId: accountId, stripeAccountStatus: "pending" },
    });
  }

  // Generate onboarding link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const linkResult = await createConnectOnboardingLink(accountId!, baseUrl);
  if ("error" in linkResult) return NextResponse.json({ error: linkResult.error }, { status: 500 });

  return NextResponse.json({ url: linkResult.url, accountId });
}

export async function DELETE() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { stripeAccountId: null, stripeAccountStatus: "not_connected" },
  });
  return NextResponse.json({ ok: true });
}
