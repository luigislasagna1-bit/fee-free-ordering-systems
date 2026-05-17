// POST /api/stripe/connect — create account + return onboarding link
// DELETE /api/stripe/connect — disconnect account
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createConnectAccount, createConnectOnboardingLink, stripeReady } from "@/lib/stripe";
import prisma from "@/lib/db";

export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await stripeReady())) {
    return NextResponse.json({
      error: "Stripe is not configured. Set it up at /superadmin/settings/stripe.",
      setupRequired: true,
    }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  let accountId = restaurant.stripeAccountId;

  // createConnectAccount + createConnectOnboardingLink now throw on failure
  // (instead of returning { error }). Single try/catch surfaces any Stripe
  // API error to the admin UI as a clean 502.
  try {
    if (!accountId) {
      const result = await createConnectAccount({
        email: restaurant.email || undefined,
        restaurantName: restaurant.name,
      });
      accountId = result.accountId;
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeAccountId: accountId, stripeAccountStatus: "pending" },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const linkResult = await createConnectOnboardingLink(accountId!, baseUrl);
    return NextResponse.json({ url: linkResult.url, accountId });
  } catch (err: any) {
    console.error("[stripe connect]", err);
    return NextResponse.json({ error: err?.message ?? "Stripe error" }, { status: 502 });
  }
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
