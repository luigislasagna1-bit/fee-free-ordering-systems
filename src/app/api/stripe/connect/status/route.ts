import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getConnectAccountStatus, stripeReady } from "@/lib/stripe";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  });

  if (!restaurant?.stripeAccountId) {
    return NextResponse.json({ status: "not_connected", accountId: null });
  }

  if (!(await stripeReady())) {
    return NextResponse.json({ status: restaurant.stripeAccountStatus || "not_connected", accountId: restaurant.stripeAccountId, stripeDisabled: true });
  }

  try {
    // getConnectAccountStatus throws on failure (instead of returning {error}).
    const acct = await getConnectAccountStatus(restaurant.stripeAccountId);

    // Status semantics MUST match the webhook handler in
    // src/lib/stripe/events/account.ts:
    //   - "connected"        — charges are live (can take orders)
    //   - "action_required"  — Stripe wants more info before charges go live
    //   - "pending"          — onboarding submitted but Stripe is still
    //                          verifying / payouts not yet enabled
    //
    // CRITICAL: do NOT also require payoutsEnabled. Payouts being pending
    // is a separate Stripe bank-verification step the restaurant resolves
    // out-of-band — it doesn't block taking orders, and the platform
    // should consider the connection "live" once charges are enabled.
    //
    // The previous logic (require both) caused a feedback bug: the webhook
    // would correctly flip status to "connected" on charges_enabled, then
    // any later UI refresh would call this endpoint, see payouts still
    // pending, and overwrite status back to "pending". Setup wizard then
    // showed the Stripe step incomplete forever even though charges were
    // live. Same gate now means refresh re-affirms what the webhook set.
    let status = "pending";
    if (acct.chargesEnabled) status = "connected";
    else if (acct.requiresAction) status = "action_required";

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        stripeAccountStatus: status,
        stripeChargesEnabled: acct.chargesEnabled ?? false,
        stripePayoutsEnabled: acct.payoutsEnabled ?? false,
      },
    });

    return NextResponse.json({ status, accountId: restaurant.stripeAccountId, ...acct });
  } catch (err: any) {
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  }
}
