import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { applyDefaultCardToAllSubscriptions } from "@/lib/apply-default-card";

/**
 * POST /api/admin/billing/apply-default-card
 *
 * "Use this card for all your subscriptions" (Luigi 2026-07-11) — see
 * src/lib/apply-default-card.ts for the full explanation. Repoints every
 * one of the restaurant's Stripe subscriptions (platform + every add-on)
 * at the CURRENT customer-level default payment method. Takes no body —
 * there is nothing for the client to choose; "this card" always means
 * whatever card is already saved as the default.
 *
 * Idempotent: safe to call repeatedly. Never touches an amount, only
 * which payment method Stripe charges on the next renewal.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  const result = await applyDefaultCardToAllSubscriptions(user.restaurantId);
  if (!result.ok) {
    const status = result.error === "not_configured" ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    success: true,
    updatedCount: result.updatedCount,
    totalCount: result.totalCount,
  });
}
