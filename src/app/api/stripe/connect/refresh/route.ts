// Stripe redirects here if the onboarding link expires — regenerate it
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createConnectOnboardingLink } from "@/lib/stripe";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  if (!restaurantId) return NextResponse.redirect(`${baseUrl}/admin/settings`);

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant?.stripeAccountId) return NextResponse.redirect(`${baseUrl}/admin/settings`);

  try {
    const result = await createConnectOnboardingLink(restaurant.stripeAccountId, baseUrl);
    return NextResponse.redirect(result.url);
  } catch (err) {
    console.error("[stripe connect refresh]", err);
    return NextResponse.redirect(`${baseUrl}/admin/settings?stripe=error`);
  }
}
