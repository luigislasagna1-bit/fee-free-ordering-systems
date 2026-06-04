/**
 * GET /api/public/restaurant-customer/consent?slug=<restaurant>&email=<email>
 *
 * Returns the stored marketing-consent state for a customer email at one
 * restaurant, so the public checkout can pre-fill the marketing checkbox to
 * the customer's last choice — an opted-out email shows the box UNCHECKED
 * instead of being silently re-opted-in on a later order.
 *
 *   { marketingConsent: true }   → known customer, opted in
 *   { marketingConsent: false }  → known customer, opted out
 *   { marketingConsent: null }   → no record for this email at this restaurant
 *
 * Scope/privacy: read-only, returns a single boolean for an email the visitor
 * already typed into their own checkout. Consent is per-restaurant by design
 * (opting out of Restaurant A does not affect Restaurant B), so this is scoped
 * to the slug and never crosses restaurants. It deliberately exposes nothing
 * beyond the consent flag (no name/phone/order history).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") ?? "").trim();
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();

  // Basic validation — bail cheaply on obviously bad input so we never run a
  // query for junk. Matches the order route's lowercase-email normalization.
  if (!slug || !email || email.length > 254 || !email.includes("@")) {
    return NextResponse.json({ marketingConsent: null });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ marketingConsent: null });
  }

  const customer = await prisma.customer.findFirst({
    where: { restaurantId: restaurant.id, email },
    select: { marketingConsent: true },
  });

  return NextResponse.json(
    { marketingConsent: customer ? customer.marketingConsent : null },
    // Never cache — consent state changes the moment a customer opts in/out.
    { headers: { "Cache-Control": "no-store" } },
  );
}
