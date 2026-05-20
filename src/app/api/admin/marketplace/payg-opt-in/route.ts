import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ensureMarketplaceListing } from "@/lib/marketplace";

/**
 * POST /api/admin/marketplace/payg-opt-in
 *
 * Opts the restaurant into the marketplace under pay-as-you-go billing
 * mode. No Stripe call — the listing is just created with billingMode
 * set to "payg" and the per-order accrual + monthly settlement cron
 * takes it from there.
 *
 * Idempotent: if the listing already exists (regardless of mode), we
 * leave billingMode alone and just return the current state. Switching
 * a "monthly" listing back to "payg" requires an explicit subscription
 * cancellation — owners can't accidentally downgrade themselves out of
 * Driver Pool by clicking this button.
 */
export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure listing exists. Three states the caller could be in:
  //   1. No listing yet → create one (defaults to billingMode=payg, isListed=true).
  //   2. Listing exists, currently HIDDEN (isListed=false, e.g. after
  //      monthly cancellation) → re-list under PAYG. Explicit re-opt-in.
  //   3. Listing exists with isListed=true → idempotent no-op; we never
  //      silently flip a monthly subscriber back to PAYG via this endpoint.
  await ensureMarketplaceListing(restaurantId);

  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { id: true, billingMode: true, isListed: true },
  });

  // Re-opt-in case: a hidden listing means the owner WAS on monthly,
  // cancelled, and is now agreeing to PAYG. Flip both fields together
  // so the listing actually goes live + bills correctly.
  if (listing && !listing.isListed) {
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { billingMode: "payg", isListed: true },
    });
  }

  // Monthly subscribers (billingMode === "monthly" + isListed === true)
  // hitting this endpoint are a no-op — we don't downgrade them. They
  // need to cancel the Stripe subscription first.

  return NextResponse.json({ ok: true, billingMode: "payg" });
}
