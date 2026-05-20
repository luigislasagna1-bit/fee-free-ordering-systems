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

  // Create the listing if it doesn't exist; otherwise leave billingMode
  // alone (monthly subscribers shouldn't be able to silently downgrade).
  await ensureMarketplaceListing(restaurantId);

  // For brand-new listings, ensureMarketplaceListing defaults to
  // billingMode="payg" via the schema default, so no explicit update
  // is needed. We DO double-check that no existing row has a different
  // mode — if it does, leave it untouched.
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId },
    select: { billingMode: true },
  });

  return NextResponse.json({ ok: true, billingMode: listing?.billingMode ?? "payg" });
}
